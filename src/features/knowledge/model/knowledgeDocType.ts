import type { RequirementDoc } from '../../../types';

const WIKI_INDEX_KEYS = new Set([
  '\u9879\u76ee\u6982\u89c8',
  '\u529f\u80fd\u6e05\u5355',
  '\u9875\u9762\u6e05\u5355',
  'project-overview',
  'feature-inventory',
  'page-inventory',
]);

const AI_SUMMARY_KEYS = new Set([
  '\u672f\u8bed\u8868',
  '\u5f00\u653e\u95ee\u9898',
  '\u53d8\u66f4\u540c\u6b65\u63d0\u6848',
  '\u5f85\u786e\u8ba4\u540c\u6b65\u9879',
  'terminology',
  'open-questions',
]);

const normalizeDocLookupKey = (title: string) => {
  const normalizedPath = title.replace(/\\/g, '/').trim();
  const basename = normalizedPath.split('/').pop() || normalizedPath;

  return basename
    .replace(/\.(md|markdown)$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
};

export const inferKnowledgeDocType = (title: string): RequirementDoc['docType'] => {
  const normalizedTitle = normalizeDocLookupKey(title);
  if (!normalizedTitle) {
    return undefined;
  }

  if (WIKI_INDEX_KEYS.has(normalizedTitle)) {
    return 'wiki-index';
  }

  if (AI_SUMMARY_KEYS.has(normalizedTitle)) {
    return 'ai-summary';
  }

  return undefined;
};
