// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { KnowledgeNote } from './knowledge';

const KNOWLEDGE_TAG_LABELS: Record<string, string> = {
  'kind/note': '\u7b14\u8bb0',
  'status/stale': '\u5f85\u6e05\u7406',
  'status/archived': '\u5df2\u5f52\u6863',
  'candidate/merge': '\u5f85\u5408\u5e76',
};

export const mergeKnowledgeSystemTags = (
  tags: string[],
  _docType?: KnowledgeNote['docType']
) => {
  const normalizedTags = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

  return normalizedTags;
};

export const formatKnowledgeTagLabel = (tag: string) => {
  const normalizedTag = tag.trim();
  if (!normalizedTag) {
    return '';
  }

  return KNOWLEDGE_TAG_LABELS[normalizedTag] || normalizedTag;
};

export const formatKnowledgeTagLabels = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map(formatKnowledgeTagLabel)
        .filter(Boolean)
    )
  );
