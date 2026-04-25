import type { ReferenceFile } from '../../knowledge/referenceFiles.ts';

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const scoreReferenceFile = (file: ReferenceFile, tokens: string[]) => {
  if (tokens.length === 0) {
    return 0;
  }

  const haystack = `${file.path} ${file.title} ${file.summary} ${file.tags.join(' ')}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
};

const truncateContent = (content: string, maxChars: number) =>
  content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated]` : content;

export const buildReferencePromptContext = (options: {
  userInput?: string;
  selectedFiles: ReferenceFile[];
  maxExpandedFiles?: number;
  maxExpandedChars?: number;
}) => {
  const visibleFiles = options.selectedFiles.filter((file) => file.readableByAI);
  if (visibleFiles.length === 0) {
    return {
      labels: [],
      indexSection: '',
      expandedSection: '',
    };
  }

  const tokens = tokenize(options.userInput || '');
  const rankedFiles = [...visibleFiles].sort((left, right) => {
    const scoreDiff = scoreReferenceFile(right, tokens) - scoreReferenceFile(left, tokens);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.path.localeCompare(right.path);
  });

  const maxExpandedFiles = Math.max(1, options.maxExpandedFiles || 3);
  const maxExpandedChars = Math.max(400, options.maxExpandedChars || 3200);
  const expandedFiles = rankedFiles.slice(0, maxExpandedFiles);

  return {
    labels: [`已选文件 / ${visibleFiles.length}`],
    indexSection: visibleFiles
      .map((file) => `- ${file.path} | ${file.title} | ${file.summary || 'No summary'} | ${file.type} | ${file.updatedAt}`)
      .join('\n'),
    expandedSection: expandedFiles
      .map((file) => `file: ${file.path}\n${truncateContent(file.content, maxExpandedChars)}`)
      .join('\n\n'),
  };
};
