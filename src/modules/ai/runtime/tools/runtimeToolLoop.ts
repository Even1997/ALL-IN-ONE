import {
  formatToolResult,
  parseToolCalls,
  type ToolResult,
  type ToolResultFileChange,
} from '../../../../components/workspace/tools.ts';
import type {
  RuntimeToolLoopOptions,
  RuntimeToolLoopResult,
  RuntimeToolMessage,
  RuntimeToolStep,
} from '../agent-kernel/agentKernelTypes.ts';

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

const emitToolCallsChange = (options: RuntimeToolLoopOptions, toolCalls: RuntimeToolStep[]) => {
  options.onToolCallsChange?.(toolCalls.map((toolCall) => ({ ...toolCall })));
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

  for (let round = 0; round < options.maxRounds; round += 1) {
    const assistantContent = await options.callModel(
      [...messages],
      options.systemPrompt,
      options.onModelEvent
    );
    finalContent = assistantContent;
    messages.push({
      role: 'assistant',
      content: assistantContent,
    });

    const parsedCalls = parseToolCalls(assistantContent);
    if (parsedCalls.length === 0) {
      return {
        finalContent,
        transcript: messages,
        toolCalls,
      };
    }

    for (const call of parsedCalls) {
      const step: RuntimeToolStep = {
        id: call.id,
        name: call.name,
        input: call.input,
        status: 'running',
        resultPreview: '',
      };
      toolCalls.push(step);
      emitToolCallsChange(options, toolCalls);

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
        emitToolCallsChange(options, toolCalls);
        messages.push(createToolResultMessage(step, result));
        continue;
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
        emitToolCallsChange(options, toolCalls);
        messages.push(createToolResultMessage(step, result));
        continue;
      }

      try {
        const result = await options.executeTool(call);
        step.status = result.is_error ? 'failed' : 'completed';
        step.resultPreview = previewResult(result);
        step.resultContent = result.content;
        step.fileChanges = result.is_error ? [] : extractResultFileChanges(result);
        emitToolCallsChange(options, toolCalls);
        await options.afterToolCall?.(call);
        messages.push(createToolResultMessage(step, result));
      } catch (error) {
        const result: ToolResult = {
          type: 'text',
          content: error instanceof Error ? error.message : String(error),
          is_error: true,
        };
        step.status = 'failed';
        step.resultPreview = previewResult(result);
        step.resultContent = result.content;
        emitToolCallsChange(options, toolCalls);
        messages.push(createToolResultMessage(step, result));
      }
    }
  }

  return {
    finalContent: createExhaustedMessage(options.maxRounds),
    transcript: messages,
    toolCalls,
  };
}
