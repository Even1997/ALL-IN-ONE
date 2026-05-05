import type { RequirementDoc } from '../../../types';

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

  if (AI_SUMMARY_KEYS.has(normalizedTitle)) {
    return 'ai-summary';
  }

  return undefined;
};
