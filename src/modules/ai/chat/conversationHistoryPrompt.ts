// 文件作用：Prompt 构造器，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { estimateTextTokens } from './contextBudget.ts';

type ConversationHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const stripInternalThinking = (content: string) =>
  content.trim();

const INTERNAL_HISTORY_BLOCK_PATTERNS = [
  /<goodnight-m-flow\b[^>]*>[\s\S]*?<\/goodnight-m-flow>/gi,
  /<[^>\n]*m-flow[^>\n]*>[\s\S]*?<\/[^>\n]*m-flow[^>\n]*>/gi,
];

const INTERNAL_HISTORY_LINE_PATTERNS = [
  /m-flow/i,
  /鍊欓€夐潰/,
  /\bRoute\b.*璇嗗埆/,
  /璇嗗埆鍊欓€夐潰/,
];

const stripInternalHistoryProtocols = (content: string) => {
  const withoutBlocks = INTERNAL_HISTORY_BLOCK_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ''),
    content
  );

  return withoutBlocks
    .split('\n')
    .filter((line) => !INTERNAL_HISTORY_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .trim();
};

const HISTORY_TOKEN_BUDGET = 8000;
const HISTORY_MAX_CHARS_PER_MSG = 2000;

export const buildConversationHistorySection = (
  messages: ConversationHistoryMessage[] = [],
  maxTokens = HISTORY_TOKEN_BUDGET,
) => {
  if (messages.length === 0) {
    return '';
  }

  const visibleMessages = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      ...message,
      content: stripInternalHistoryProtocols(stripInternalThinking(message.content)).replace(/\s+/g, ' '),
    }))
    .filter((message) => message.content.length > 0);

  if (visibleMessages.length === 0) {
    return '';
  }

  const included: string[] = [];
  let usedTokens = 0;

  for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
    const message = visibleMessages[i]!;
    const perMessageBudget = Math.max(300, Math.min(HISTORY_MAX_CHARS_PER_MSG, maxTokens - usedTokens));
    const truncated = message.content.length > perMessageBudget
      ? `${message.content.slice(0, perMessageBudget)}...[truncated]`
      : message.content;
    const line = `${message.role}: ${truncated}`;
    const lineTokens = estimateTextTokens(line);

    if (usedTokens + lineTokens > maxTokens) {
      break;
    }

    included.unshift(line);
    usedTokens += lineTokens;
  }

  return included.join('\n');
};
