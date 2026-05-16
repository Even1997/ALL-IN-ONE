// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
