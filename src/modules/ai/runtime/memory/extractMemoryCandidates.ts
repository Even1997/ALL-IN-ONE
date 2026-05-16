// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { AgentMemoryCandidate } from '../agentRuntimeStore';

type ExtractMemoryCandidatesInput = {
  threadId: string;
  userInput: string;
  assistantContent: string;
  createdAt?: number;
};

const sentenceBreakPattern = /[。！？.!?\n]/;
const projectFactPattern = /项目事实[:：]\s*([^。！？.!?\n]+)/g;
const preferencePatterns = [
  /(以后\s*回答短一点[^。！？.!?\n]*)/,
  /(回答短一点[^。！？.!?\n]*)/,
  /(回答简洁[^。！？.!?\n]*)/,
  /偏好[:：]\s*([^。！？.!?\n]+)/,
  /(我喜欢[^。！？.!?\n]+)/,
];

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const hasUsefulContent = (value: string) => value.replace(/[。！？.!?,，、:：\s]/g, '').length >= 2;

const truncate = (value: string, maxLength: number) => {
  const normalized = normalizeText(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const hashCandidate = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const createCandidate = (
  threadId: string,
  kind: AgentMemoryCandidate['kind'],
  title: string,
  content: string,
  createdAt: number,
): AgentMemoryCandidate => {
  const normalizedContent = normalizeText(content);
  return {
    id: `memory-candidate_${threadId}_${kind}_${hashCandidate(`${kind}:${normalizedContent}`)}`,
    threadId,
    title,
    summary: truncate(normalizedContent, 96),
    content: normalizedContent,
    kind,
    status: 'pending',
    createdAt,
  };
};

export const extractMemoryCandidates = ({
  threadId,
  userInput,
  assistantContent: _assistantContent,
  createdAt = 0,
}: ExtractMemoryCandidatesInput): AgentMemoryCandidate[] => {
  const candidates: AgentMemoryCandidate[] = [];
  const seen = new Set<string>();
  const sourceText = normalizeText(userInput);

  for (const match of sourceText.matchAll(projectFactPattern)) {
    const content = normalizeText(match[1] || '');
    if (!hasUsefulContent(content)) {
      continue;
    }
    const key = `projectFact:${content}`;
    if (!seen.has(key)) {
      candidates.push(createCandidate(threadId, 'projectFact', '项目事实', content, createdAt));
      seen.add(key);
    }
  }

  const preferenceSentence = sourceText
    .split(sentenceBreakPattern)
    .map((item) => normalizeText(item))
    .map((item) => preferencePatterns.map((pattern) => item.match(pattern)?.[1] || '').find(hasUsefulContent) || '')
    .find(Boolean);

  if (preferenceSentence) {
    const key = `userPreference:${preferenceSentence}`;
    if (!seen.has(key)) {
      candidates.push(createCandidate(threadId, 'userPreference', '回答偏好', preferenceSentence, createdAt));
      seen.add(key);
    }
  }

  return candidates;
};
