export type KnowledgeContextFile = {
  title: string;
  type: 'markdown' | 'html';
  summary: string;
  content: string;
};

export type KnowledgeContextInput = {
  currentFile: KnowledgeContextFile | null;
  relatedFiles: KnowledgeContextFile[];
};

const formatFileBlock = (prefix: string, file: KnowledgeContextFile) =>
  [
    `${prefix}:`,
    `title: ${file.title}`,
    `type: ${file.type}`,
    `summary: ${file.summary}`,
    `content:`,
    file.content,
  ].join('\n');

export const buildKnowledgeContextSections = ({ currentFile, relatedFiles }: KnowledgeContextInput) => {
  const sections: string[] = [];

  if (currentFile) {
    sections.push(formatFileBlock('current_file', currentFile));
  }

  if (relatedFiles.length > 0) {
    sections.push(
      [
        'related_files:',
        ...relatedFiles.map((file, index) => formatFileBlock(`related_file_${index + 1}`, file)),
      ].join('\n\n')
    );
  }

  return sections.join('\n\n');
};
