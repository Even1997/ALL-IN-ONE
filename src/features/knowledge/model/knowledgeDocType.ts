import type { RequirementDoc } from '../../../types';

const WIKI_INDEX_TITLES = new Set([
  '项目总览.md',
  '功能清单.md',
  '页面清单.md',
]);

const AI_SUMMARY_TITLES = new Set([
  '术语表.md',
  '待确认问题.md',
  '变更同步提案.md',
  '待确认同步项.md',
]);

export const inferKnowledgeDocType = (title: string): RequirementDoc['docType'] => {
  const normalizedTitle = title.trim();
  if (WIKI_INDEX_TITLES.has(normalizedTitle)) {
    return 'wiki-index';
  }

  if (AI_SUMMARY_TITLES.has(normalizedTitle)) {
    return 'ai-summary';
  }

  return undefined;
};
