// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { RuntimeToolMessage } from '../agent-kernel/agentKernelTypes';
import type { CompactOptions, CompactionResult } from './compactionTypes';

const TOOL_RESULT_PREFIX = /^Tool (\S+) result:\n/;

const summarizeToolResult = (content: string, name: string, previewChars: number): string => {
  const totalChars = content.length;
  const previewEnd = Math.min(totalChars, previewChars);
  const preview = content.slice(0, previewEnd);

  return `Tool "${name}" completed. Output (${totalChars} chars total):\n${preview}${totalChars > previewChars ? '\n...' : ''}`;
};

const isToolResultMessage = (message: RuntimeToolMessage) =>
  message.kind === 'tool_result' || (message.role === 'user' && TOOL_RESULT_PREFIX.test(message.content));

const isAssistantRoundMessage = (message: RuntimeToolMessage) =>
  message.kind === 'assistant_text' || message.kind === 'assistant_tool_call' || message.role === 'tool';

export const compactOldToolResults = (
  messages: RuntimeToolMessage[],
  options: CompactOptions = {}
): CompactionResult => {
  const { maxResultChars = 2000, keepRecentRounds = 2, previewChars = 500 } = options;

  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (isToolResultMessage(messages[i]!)) {
      userIndices.push(i);
    }
  }

  if (userIndices.length <= keepRecentRounds) {
    return { compacted: false, reason: 'tool_results_trimmed', trimmedCount: 0 };
  }

  const protectFrom =
    keepRecentRounds > 0 ? userIndices[userIndices.length - keepRecentRounds]! : Number.POSITIVE_INFINITY;
  let trimmedCount = 0;

  for (const idx of userIndices) {
    if (idx >= protectFrom) continue;

    const msg = messages[idx]!;
    if (msg.content.length <= maxResultChars) continue;

    const nameMatch = TOOL_RESULT_PREFIX.exec(msg.content);
    const toolName = msg.kind === 'tool_result' ? msg.toolName : nameMatch?.[1] ?? 'unknown';
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

  const firstUserIndex = messages.findIndex((message) => message.role === 'user');
  if (firstUserIndex === -1) {
    return { compacted: false, reason: 'old_turns_removed', trimmedCount: 0 };
  }

  // 结构化 transcript 下，一轮 user 之后可能跟着 assistant_tool_call / tool_result / assistant_text。
  // 这里按“整轮”裁剪，避免只删掉 user 文本后留下悬空 tool_result。
  let endExclusive = firstUserIndex + 1;
  while (endExclusive < messages.length && isAssistantRoundMessage(messages[endExclusive]!)) {
    endExclusive += 1;
  }

  const removed = endExclusive - firstUserIndex;
  messages.splice(firstUserIndex, removed);
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
