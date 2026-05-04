import type { RuntimeToolMessage } from '../agent-kernel/agentKernelTypes';
import type { CompactOptions, CompactionResult } from './compactionTypes';

const TOOL_RESULT_PREFIX = /^Tool (\S+) result:\n/;

const summarizeToolResult = (content: string, name: string, previewChars: number): string => {
  const totalChars = content.length;
  const previewEnd = Math.min(totalChars, previewChars);
  const preview = content.slice(0, previewEnd);

  return `Tool "${name}" completed. Output (${totalChars} chars total):\n${preview}${totalChars > previewChars ? '\n...' : ''}`;
};

export const compactOldToolResults = (
  messages: RuntimeToolMessage[],
  options: CompactOptions = {}
): CompactionResult => {
  const { maxResultChars = 2000, keepRecentRounds = 2, previewChars = 500 } = options;

  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]!.role === 'user' && TOOL_RESULT_PREFIX.test(messages[i]!.content)) {
      userIndices.push(i);
    }
  }

  if (userIndices.length <= keepRecentRounds) {
    return { compacted: false, reason: 'tool_results_trimmed', trimmedCount: 0 };
  }

  const protectFrom = userIndices[userIndices.length - keepRecentRounds]!;
  let trimmedCount = 0;

  for (const idx of userIndices) {
    if (idx >= protectFrom) continue;

    const msg = messages[idx]!;
    if (msg.content.length <= maxResultChars) continue;

    const nameMatch = TOOL_RESULT_PREFIX.exec(msg.content);
    const toolName = nameMatch?.[1] ?? 'unknown';
    messages[idx] = {
      ...msg,
      content: summarizeToolResult(msg.content, toolName, previewChars),
    };
    trimmedCount += 1;
  }

  return { compacted: trimmedCount > 0, reason: 'tool_results_trimmed', trimmedCount };
};

export const removeOldestTurn = (messages: RuntimeToolMessage[]): CompactionResult => {
  if (messages.length < 2) {
    return { compacted: false, reason: 'old_turns_removed', trimmedCount: 0 };
  }

  // Remove first user message and the following assistant response
  let removed = 0;
  if (messages[0]?.role === 'user') {
    messages.splice(0, 1);
    removed += 1;
  }
  if (messages[0]?.role === 'assistant') {
    messages.splice(0, 1);
    removed += 1;
  }

  return { compacted: removed > 0, reason: 'old_turns_removed', trimmedCount: removed };
};

export const isContextLengthError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('context_length_exceeded') ||
    message.includes('context length') ||
    message.includes('too many tokens') ||
    message.includes('reduce the length') ||
    message.includes('400') && message.includes('token')
  );
};
