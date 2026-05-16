// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import {
  containsToolProtocolMarkers,
  formatToolResult,
  parseToolCalls,
  type ToolCall,
  type ToolResult,
  type ToolResultFileChange,
} from './toolExecutor.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import type {
  RuntimeToolLoopOptions,
  RuntimeToolLoopResult,
  RuntimeToolMessage,
  RuntimeToolStep,
} from '../agent-kernel/agentKernelTypes.ts';
import type { CompactionReason } from '../compaction/compactionTypes.ts';
import { compactOldToolResults, isContextLengthError, removeOldestTurn } from '../compaction/compactToolResults.ts';
import {
  createAgentEventDispatcher,
  createStreamingTextSplitter,
  sanitizeAgentVisibleText,
  type StreamSplitEvent,
} from '../dispatch/agentEvents.ts';

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
        operation:
          'operation' in candidate &&
          (candidate.operation === 'write' || candidate.operation === 'edit' || candidate.operation === 'delete')
            ? candidate.operation
            : undefined,
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
        verified: 'verified' in candidate && candidate.verified === true ? true : undefined,
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
const STREAM_EXECUTION_TOOLS = READ_ONLY_TOOLS;
const PROACTIVE_CONTEXT_COMPACTION_RATIO = 0.85;
const REPAIRABLE_TOOL_PROTOCOL_PATTERN =
  /<tool\s+name=|<tool_params>|"tool_calls"\s*:|tool_calls>|<apply_skill\b|<\s*\|\s*DSML\b|<bash\b|<cmd\b/i;

const isSameToolCall = (a: ToolCall, b: ToolCall) =>
  a.name === b.name && JSON.stringify(a.input) === JSON.stringify(b.input);

const splitAssistantContent = (content: string) => {
  const splitter = createStreamingTextSplitter();
  const splitEvents = [...splitter.feed(content), ...splitter.flush()];
  const visibleText = splitEvents
    .filter((event): event is Extract<StreamSplitEvent, { kind: 'text' }> => event.kind === 'text')
    .map((event) => event.delta)
    .join('');
  const toolCalls = splitEvents
    .filter((event): event is Extract<StreamSplitEvent, { kind: 'tool_call' }> => event.kind === 'tool_call')
    .map((event): ToolCall => ({
      id: event.id,
      name: event.name,
      input: event.input,
    }));

  return { visibleText, toolCalls };
};

const estimateMessageTokens = (messages: RuntimeToolMessage[]) =>
  Math.ceil(messages.reduce((total, message) => total + message.content.length + message.role.length + 2, 0) / 4);

const compactMessagesForBudget = (
  messages: RuntimeToolMessage[],
  contextWindowTokens: number | undefined,
): CompactionReason | null => {
  if (!contextWindowTokens || !Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) {
    return null;
  }

  const targetTokens = Math.floor(contextWindowTokens * PROACTIVE_CONTEXT_COMPACTION_RATIO);
  if (estimateMessageTokens(messages) <= targetTokens) {
    return null;
  }

  const compaction = compactOldToolResults(messages, {
    keepRecentRounds: 0,
    maxResultChars: 1200,
    previewChars: 400,
  });

  return compaction.compacted ? compaction.reason : null;
};

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
  const visibleTextPerRound: string[] = [];
  const agentEvents = createAgentEventDispatcher(options.onAgentEvent);

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

    if (!allowedTools.has(call.name)) {
      const result: ToolResult = {
        type: 'text',
        content: `Tool "${call.name}" is not allowed.`,
        is_error: true,
      };
      step.status = 'blocked';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      agentEvents.emit({ type: 'tool_call_started', toolCall: { ...step } });
      agentEvents.emit({
        type: 'tool_result',
        toolCallId: step.id,
        name: step.name,
        status: step.status,
        content: result.content,
        isError: true,
      });
      agentEvents.emit({ type: 'tool_call_completed', toolCall: { ...step } });
      return { step, result };
    }

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
      agentEvents.emit({ type: 'tool_call_started', toolCall: { ...step } });
      agentEvents.emit({
        type: 'tool_result',
        toolCallId: step.id,
        name: step.name,
        status: step.status,
        content: result.content,
        isError: true,
      });
      agentEvents.emit({ type: 'tool_call_completed', toolCall: { ...step } });
      return { step, result };
    }

    agentEvents.emit({ type: 'tool_call_started', toolCall: { ...step } });
    options.onToolCallsChange?.([...toolCalls, step].map((toolCall) => ({ ...toolCall })));

    try {
      const result = await options.executeTool(call);
      step.status = result.is_error ? 'failed' : 'completed';
      step.resultPreview = previewResult(result);
      step.resultContent = result.content;
      step.fileChanges = result.is_error ? [] : extractResultFileChanges(result);
      await options.afterToolCall?.(call);
      agentEvents.emit({
        type: 'tool_result',
        toolCallId: step.id,
        name: step.name,
        status: step.status,
        content: result.content,
        isError: result.is_error,
        fileChanges: step.fileChanges,
      });
      agentEvents.emit({ type: 'tool_call_completed', toolCall: { ...step } });
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
      agentEvents.emit({
        type: 'tool_result',
        toolCallId: step.id,
        name: step.name,
        status: step.status,
        content: result.content,
        isError: true,
      });
      agentEvents.emit({ type: 'tool_call_completed', toolCall: { ...step } });
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
    const proactiveCompaction = compactMessagesForBudget(messages, options.contextWindowTokens);
    if (proactiveCompaction) {
      options.onContextCompaction?.(proactiveCompaction);
      agentEvents.emit({ type: 'context_compacted', reason: proactiveCompaction });
    }

    // Phase 1a: Streaming tool detection — execute tools as soon as they appear in the stream
    const streamSplitter = createStreamingTextSplitter();
    const eventToolCalls: ToolCall[] = [];
    const streamExecutedResults: Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }> = [];
    const streamExecutionPromises: Promise<void>[] = [];
    const queueStreamToolExecution = (call: ToolCall) => {
      const promise = executeSingleTool(call).then(({ step, result }) => {
        streamExecutedResults.push({ call, step, result });
        toolCalls.push(step);
        emitToolCallsChange(options, toolCalls);
      });
      streamExecutionPromises.push(promise);
    };
    const handleSplitEvent = (splitEvent: StreamSplitEvent) => {
      if (splitEvent.kind === 'text') {
        wrapped?.({ kind: 'text', delta: splitEvent.delta });
        return;
      }

      if (!STREAM_EXECUTION_TOOLS.has(splitEvent.name)) {
        return;
      }

      const call: ToolCall = {
        id: splitEvent.id,
        name: splitEvent.name,
        input: splitEvent.input,
      };
      eventToolCalls.push(call);
      queueStreamToolExecution(call);
    };
    const flushStreamSplitter = () => {
      for (const splitEvent of streamSplitter.flush()) {
        handleSplitEvent(splitEvent);
      }
    };

    const streamAwareOnEvent = (event: AITextStreamEvent) => {
      if (event.kind === 'tool_call') {
        const call: ToolCall = {
          id: event.toolCall.id,
          name: event.toolCall.name,
          input: event.toolCall.input,
        };
        eventToolCalls.push(call);
        if (STREAM_EXECUTION_TOOLS.has(call.name)) {
          queueStreamToolExecution(call);
        }
      } else if (event.kind === 'text' && event.delta) {
        for (const splitEvent of streamSplitter.feed(event.delta)) {
          handleSplitEvent(splitEvent);
        }
        if (event.finishReason) {
          wrapped?.({ kind: 'text', delta: '', finishReason: event.finishReason });
        }
      } else {
        wrapped?.(event);
      }
    };

    try {
      assistantContent = await options.callModel(
        [...messages],
        options.systemPrompt,
        streamAwareOnEvent,
      );
    } catch (error) {
      if (!isContextLengthError(error)) throw error;
      streamSplitter.reset();

      const compaction = compactOldToolResults(messages);
      if (compaction.compacted) {
        options.onContextCompaction?.('tool_results_trimmed');
        agentEvents.emit({ type: 'context_compacted', reason: 'tool_results_trimmed' });
        try {
          assistantContent = await options.callModel(
            [...messages],
            options.systemPrompt,
            streamAwareOnEvent,
          );
        } catch (retryError) {
          if (!isContextLengthError(retryError)) throw retryError;
          streamSplitter.reset();
          const removal = removeOldestTurn(messages);
          if (removal.compacted) {
            options.onContextCompaction?.('old_turns_removed');
            agentEvents.emit({ type: 'context_compacted', reason: 'old_turns_removed' });
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
          agentEvents.emit({ type: 'context_compacted', reason: 'old_turns_removed' });
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

    flushStreamSplitter();

    // Wait for any in-flight stream-detected tool executions
    await Promise.all(streamExecutionPromises);

    const normalizedAssistantContent = splitAssistantContent(assistantContent);
    const roundVisibleText = sanitizeAgentVisibleText(normalizedAssistantContent.visibleText);
    if (roundVisibleText) {
      visibleTextPerRound.push(roundVisibleText);
    }
    finalContent = roundVisibleText;
    messages.push({
      role: 'assistant',
      content: assistantContent,
    });

    // Determine which tools were executed during streaming vs. need execution now
    const parsedCalls =
      eventToolCalls.length > 0
        ? eventToolCalls
        : normalizedAssistantContent.toolCalls.length > 0
          ? normalizedAssistantContent.toolCalls
          : parseToolCalls(assistantContent);
    const unmatchedStreamExecutedResults = [...streamExecutedResults];
    const orderedStreamExecutedResults: Array<{ call: ToolCall; step: RuntimeToolStep; result: ToolResult }> = [];
    const remainingCalls: ToolCall[] = [];

    for (const parsedCall of parsedCalls) {
      const matchingStreamResultIndex = unmatchedStreamExecutedResults.findIndex((executed) =>
        isSameToolCall(executed.call, parsedCall)
      );

      if (matchingStreamResultIndex === -1) {
        remainingCalls.push(parsedCall);
        continue;
      }

      const [matchedStreamResult] = unmatchedStreamExecutedResults.splice(matchingStreamResultIndex, 1);
      if (matchedStreamResult) {
        orderedStreamExecutedResults.push(matchedStreamResult);
      }
    }

    if (orderedStreamExecutedResults.length > 0 || remainingCalls.length > 0) {
      // Append stream-executed results first
      for (const { step, result } of orderedStreamExecutedResults) {
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
      if (finalContent && !REPAIRABLE_TOOL_PROTOCOL_PATTERN.test(assistantContent)) {
        const accumulatedVisibleText = visibleTextPerRound.join('\n\n');
        agentEvents.emit({ type: 'final_text', text: finalContent });
        return {
          finalContent: accumulatedVisibleText || finalContent,
          transcript: messages,
          toolCalls,
        };
      }
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

    const accumulatedVisibleText = visibleTextPerRound.join('\n\n');
    agentEvents.emit({ type: 'final_text', text: finalContent });
    return {
      finalContent: accumulatedVisibleText || finalContent,
      transcript: messages,
      toolCalls,
    };
  }

  return {
    finalContent: visibleTextPerRound.join('\n\n') || createExhaustedMessage(options.maxRounds),
    transcript: messages,
    toolCalls,
  };
}
