const normalizeHeadingText = (value: string) => value.trim().replace(/\s+/g, ' ');

const splitLeadingHeading = (markdown: string) => {
  const normalizedMarkdown = markdown.replace(/^\uFEFF/, '');
  const match = normalizedMarkdown.match(/^#\s+(.+?)(?:\r?\n|$)/);

  if (!match) {
    return null;
  }

  return {
    heading: match[1] || '',
    remainder: normalizedMarkdown.slice(match[0].length).replace(/^(?:\r?\n)+/, ''),
  };
};

export const extractKnowledgeNoteEditorBody = (title: string, markdown: string) => {
  if (!markdown) {
    return '';
  }

  const leadingHeading = splitLeadingHeading(markdown);
  if (!leadingHeading) {
    return markdown.replace(/^\uFEFF/, '');
  }

  return normalizeHeadingText(leadingHeading.heading) === normalizeHeadingText(title)
    ? leadingHeading.remainder
    : markdown.replace(/^\uFEFF/, '');
};

export const serializeKnowledgeNoteMarkdown = (title: string, body: string) => {
  const normalizedTitle = title.trim();
  const normalizedBody = extractKnowledgeNoteEditorBody(title, body);

  if (!normalizedTitle) {
    return normalizedBody;
  }

  return normalizedBody ? `# ${normalizedTitle}\n\n${normalizedBody}` : `# ${normalizedTitle}`;
};
