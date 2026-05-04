import {
  containsToolProtocolMarkers,
  createStreamingToolDetector,
  formatToolResult,
  parseToolCalls,
  type ToolCall,
  type ToolResult,
  type ToolResultFileChange,
} from '../../../../components/workspace/tools.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import type {
  RuntimeToolLoopOptions,
  RuntimeToolLoopResult,
  RuntimeToolMessage,
  RuntimeToolStep,
} from '../agent-kernel/agentKernelTypes.ts';
import { compactOldToolResults, isContextLengthError, removeOldestTurn } from '../compaction/compactToolResults.ts';

const previewResult = (result: ToolResult) => result.content.slice(0, 1000);

const extractResultFileChanges = (result: ToolResult): ToolResultFileChange[] => {
  const candidates = result.metadata?.fileChanges;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return [];
    }

    const path = 'path' in candidate && typeof candidate.path === 'string' ? candidate.path : '';
    if (!path.trim()) {
      return [];
    }

    return [
      {
        path,
        beforeContent:
          'beforeContent' in candidate && typeof candidate.beforeContent === 'string'
            ? candidate.beforeContent
            : candidate.beforeContent === null
              ? null
              : null,
        afterContent:
          'afterContent' in candidate && typeof candidate.afterContent === 'string'
            ? candidate.afterContent
            : candidate.afterContent === null
              ? null
              : null,
      } satisfies ToolResultFileChange,
    ];
  });
};

const createToolResultMessage = (
  step: RuntimeToolStep,
  result: ToolResult,
): RuntimeToolMessage => ({
  role: 'user',
  content: `Tool ${step.name} result:\n${formatToolResult(result)}`,
});

const createExhaustedMessage = (maxRounds: number) =>
  `Runtime tool loop exhausted after ${maxRounds} rounds before the model returned final content.`;

const createToolCallRepairMessage = () =>
  [
    'Your last response appears to contain tool protocol markup, but it was not in a parseable format.',
    'If you want to call a tool, resend only the tool call using this exact XML format:',
    '<tool_use>',
    '<tool name="tool_name">',
    '<tool_params>{"key":"value"}</tool_params>',
    '</tool>',
    '</tool_use>',
    'Do not include DSML, tool_calls JSON, or any extra commentary before the tool call.',
    'If no tool is needed, answer the user directly.',
  ].join('\n');

const emitToolCallsChange = (options: RuntimeToolLoopOptions, toolCalls: RuntimeToolStep[]) => {
  options.onToolCallsChange?.(toolCalls.map((toolCall) => ({ ...toolCall })));
};

const READ_ONLY_TOOLS = new Set(['glob', 'grep', 'ls', 'view']);

const isSameToolCall = (a: ToolCall, b: ToolCall) =>
  a.name === b.name && JSON.stringify(a.input) === JSON.stringify(b.input);

export async function runRuntimeToolLoop(
  options: RuntimeToolLoopOptions,
): Promise<RuntimeToolLoopResult> {
  const messages: RuntimeToolMessage[] = [
    {
      role: 'user',
      content: options.initialPrompt,
    },
  ];
  const toolCalls: RuntimeToolStep[] = [];
  const allowedTools = new Set(options.allowedTools);
  let finalContent = '';

  const wrapOnModelEvent = (onEvent?: (event: AITextStreamEvent) => void) => {
    let finishReason: AITextStreamEvent['finishReason'];
    const wrapped = onEvent
      ? (event: AITextStreamEvent) => {
          if (event.finishReason) {
            finishReason = event.finishReason;
          }
          onEvent(event);
        }
      : undefined;
    return { wrapped, getFinishReason: () => finishReason };
  };

  const executeSingleTool = async (call: ToolCall): Promise<{ step: RuntimeToolStep; result: ToolResult }> => {
    const step: RuntimeToolStep = {
      id: call.id,
      name: call.name,
      input: call.input,
      status: 'running',
      resultPreview: '',
    };

    try {
      await options.beforeToolCall?.(call);
    } catch (error) {
      const result: ToolResult = {
        type: 'text',
        content: error instanceof Error ? error.message : String(error),
        is_error: true,
      };
      step.status = 'blocked';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      return { step, result };
    }

    if (!allowedTools.has(call.name)) {
      const result: ToolResult = {
        type: 'text',
        content: `Tool "${call.name}" is not allowed.`,
        is_error: true,
      };
      step.status = 'blocked';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      return { step, result };
    }

    try {
      const result = await options.executeTool(call);
      step.status = result.is_error ? 'failed' : 'completed';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      step.fileChanges = result.is_error ? [] : extractResultFileChanges(result);
      await options.afterToolCall?.(call);
      return { step, result };
    } catch (error) {
      const result: ToolResult = {
        type: 'text',
        content: error instanceof Error ? error.message : String(error),
        is_error: true,
      };
      step.status = 'failed';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      return { step, result };
    }
  };

  const executeToolGroup = async (
    calls: ToolCall[],
  ): Promise<Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }>> => {
    if (calls.length === 0) return [];

    // Determine execution mode: parallel for all-read-only groups, sequential otherwise
    const allReadOnly = calls.every((c) => READ_ONLY_TOOLS.has(c.name));

    if (allReadOnly && calls.length > 1) {
      const results = await Promise.all(calls.map((c) => executeSingleTool(c)));
      return calls.map((call, i) => ({ call, step: results[i]!.step, result: results[i]!.result }));
    }

    const results: Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }> = [];
    for (const call of calls) {
      const { step, result } = await executeSingleTool(call);
      results.push({ call, step, result });
    }
    return results;
  };

  const appendToolResults = (
    executed: Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }>,
  ) => {
    for (const { step, result } of executed) {
      toolCalls.push(step);
      messages.push(createToolResultMessage(step, result));
    }
    emitToolCallsChange(options, toolCalls);
  };

  for (let round = 0; round < options.maxRounds; round += 1) {
    let assistantContent: string;
    const { wrapped, getFinishReason } = wrapOnModelEvent(options.onModelEvent);

    // Phase 1a: Streaming tool detection — execute tools as soon as they appear in the stream
    const streamDetector = createStreamingToolDetector();
    const streamExecutedResults: Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }> = [];
    const streamExecutionPromises: Promise<void>[] = [];

    const streamAwareOnEvent = wrapped
      ? (event: AITextStreamEvent) => {
          wrapped(event);
          if (event.kind === 'text' && event.delta) {
            const detectedCalls = streamDetector.feed(event.delta);
            for (const call of detectedCalls) {
              const promise = executeSingleTool(call).then(({ step, result }) => {
                streamExecutedResults.push({ call, step, result });
                toolCalls.push(step);
                emitToolCallsChange(options, toolCalls);
              });
              streamExecutionPromises.push(promise);
            }
          }
        }
      : undefined;

    try {
      assistantContent = await options.callModel(
        [...messages],
        options.systemPrompt,
        streamAwareOnEvent,
      );
    } catch (error) {
      if (!isContextLengthError(error)) throw error;

      const compaction = compactOldToolResults(messages);
      if (compaction.compacted) {
        options.onContextCompaction?.('tool_results_trimmed');
        try {
          assistantContent = await options.callModel(
            [...messages],
            options.systemPrompt,
            streamAwareOnEvent,
          );
        } catch (retryError) {
          if (!isContextLengthError(retryError)) throw retryError;
          const removal = removeOldestTurn(messages);
          if (removal.compacted) {
            options.onContextCompaction?.('old_turns_removed');
            assistantContent = await options.callModel(
              [...messages],
              options.systemPrompt,
              streamAwareOnEvent,
            );
          } else {
            throw retryError;
          }
        }
      } else {
        const removal = removeOldestTurn(messages);
        if (removal.compacted) {
          options.onContextCompaction?.('old_turns_removed');
          assistantContent = await options.callModel(
            [...messages],
            options.systemPrompt,
            streamAwareOnEvent,
          );
        } else {
          throw error;
        }
      }
    }

    // Wait for any in-flight stream-detected tool executions
    await Promise.all(streamExecutionPromises);

    finalContent = assistantContent;
    messages.push({
      role: 'assistant',
      content: assistantContent,
    });

    // Determine which tools were executed during streaming vs. need execution now
    const parsedCalls = parseToolCalls(assistantContent);
    const remainingCalls = parsedCalls.filter(
      (pc) => !streamExecutedResults.some((se) => isSameToolCall(se.call, pc)),
    );

    if (streamExecutedResults.length > 0 || remainingCalls.length > 0) {
      // Append stream-executed results first
      for (const { step, result } of streamExecutedResults) {
        messages.push(createToolResultMessage(step, result));
      }

      // Phase 1b: Execute remaining calls in groups (parallel for read-only bursts)
      if (remainingCalls.length > 0) {
        const executed = await executeToolGroup(remainingCalls);
        appendToolResults(executed);
      }

      // Phase 7c: finish_reason === 'length' — response truncated, continue
      if (parsedCalls.length === 0 && getFinishReason() === 'length') {
        messages.push({
          role: 'user',
          content: 'Your last response was cut off due to token limit. Continue from where you left off.',
        });
      }
      continue;
    }

    // No tool calls found in either stream or full parse
    if (containsToolProtocolMarkers(assistantContent)) {
      messages.push({
        role: 'user',
        content: createToolCallRepairMessage(),
      });
      continue;
    }

    if (getFinishReason() === 'length') {
      messages.push({
        role: 'user',
        content: 'Your last response was cut off due to token limit. Continue from where you left off.',
      });
      continue;
    }

    return {
      finalContent,
      transcript: messages,
      toolCalls,
    };
  }

  return {
    finalContent: createExhaustedMessage(options.maxRounds),
    transcript: messages,
    toolCalls,
  };
}
