import type { KnowledgeNote } from './knowledge';

const KNOWLEDGE_TAG_LABELS: Record<string, string> = {
  'kind/wiki': '系统索引',
  'kind/note': '\u7b14\u8bb0',
  'status/stale': '\u5f85\u6e05\u7406',
  'status/archived': '\u5df2\u5f52\u6863',
  'candidate/merge': '\u5f85\u5408\u5e76',
};

export const mergeKnowledgeSystemTags = (
  tags: string[],
  docType?: KnowledgeNote['docType']
) => {
  const normalizedTags = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

  if (docType === 'wiki-index' && !normalizedTags.includes('kind/wiki')) {
    normalizedTags.unshift('kind/wiki');
  }

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
