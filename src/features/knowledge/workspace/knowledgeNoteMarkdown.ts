const normalizeHeadingText = (value: string) => value.trim().replace(/\s+/g, ' ');
const REFERENCE_SECTION_HEADING = '## 引用来源';

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

const normalizeReferenceTitles = (titles: string[]) =>
  Array.from(
    new Set(
      titles
        .map((title) => title.trim())
        .filter(Boolean)
    )
  );

const stripKnowledgeReferenceSection = (markdown: string) =>
  markdown
    .replace(
      /(?:\r?\n){2,}## 引用来源\s*(?:\r?\n)+(?:- .*(?:\r?\n|$))+\s*$/u,
      ''
    )
    .trimEnd();

export const parseKnowledgeReferenceTitles = (markdown: string) => {
  const match = markdown.match(/(?:^|\r?\n)## 引用来源\s*(?:\r?\n)+((?:- .*(?:\r?\n|$))+)\s*$/u);
  if (!match?.[1]) {
    return [];
  }

  return normalizeReferenceTitles(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^- (.+)$/)?.[1] || '')
  );
};

export const upsertKnowledgeReferenceSection = (markdown: string, referenceTitles: string[]) => {
  const normalizedReferenceTitles = normalizeReferenceTitles(referenceTitles);
  const baseMarkdown = stripKnowledgeReferenceSection(markdown.replace(/^\uFEFF/, ''));

  if (normalizedReferenceTitles.length === 0) {
    return baseMarkdown;
  }

  const referenceSection = [
    REFERENCE_SECTION_HEADING,
    ...normalizedReferenceTitles.map((title) => `- ${title}`),
  ].join('\n');

  return baseMarkdown.trim()
    ? `${baseMarkdown.trimEnd()}\n\n${referenceSection}`
    : referenceSection;
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
