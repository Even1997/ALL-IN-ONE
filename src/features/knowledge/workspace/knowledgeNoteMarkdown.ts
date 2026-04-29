const normalizeHeadingText = (value: string) => value.trim().replace(/\s+/g, ' ');
const REFERENCE_SECTION_HEADING = '## 引用来源';
const RELATED_NOTES_SECTION_HEADING = '## Related notes';
const MARKDOWN_EXTENSION_PATTERN = /\.(md|markdown)$/i;
const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

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
        .map((title) => title.trim().replace(MARKDOWN_EXTENSION_PATTERN, ''))
        .filter(Boolean)
    )
  );

const parseWikiLinkTitle = (raw: string) => {
  const [target] = raw.split('|');
  const [noteTitle] = (target || '').split('#');
  const normalized = noteTitle?.trim().replace(MARKDOWN_EXTENSION_PATTERN, '') || '';
  return normalized || null;
};

const splitMarkdownOutsideCodeFences = (markdown: string) =>
  markdown.split(/(```[\s\S]*?```)/g).filter((segment) => segment.length > 0);

const parseInlineWikiLinkTitles = (markdown: string) => {
  const titles: string[] = [];

  for (const segment of splitMarkdownOutsideCodeFences(markdown)) {
    if (segment.startsWith('```')) {
      continue;
    }

    for (const match of segment.matchAll(WIKI_LINK_PATTERN)) {
      const title = parseWikiLinkTitle(match[1] || '');
      if (title) {
        titles.push(title);
      }
    }
  }

  return normalizeReferenceTitles(titles);
};

const stripKnowledgeReferenceSection = (markdown: string) =>
  markdown
    .replace(
      /(?:\r?\n){2,}## 引用来源\s*(?:\r?\n)+(?:- .*(?:\r?\n|$))+\s*$/u,
      ''
    )
    .trimEnd();

const stripKnowledgeRelatedNotesSection = (markdown: string) =>
  markdown
    .replace(
      /(?:\r?\n){2,}## Related notes\s*(?:\r?\n)+(?:- \[\[[^[\]]+\]\](?:\r?\n|$))+\s*$/u,
      ''
    )
    .trimEnd();

export const parseKnowledgeReferenceTitles = (markdown: string) => {
  const legacyMatch = markdown.match(/(?:^|\r?\n)## 引用来源\s*(?:\r?\n)+((?:- .*(?:\r?\n|$))+)\s*$/u);
  const relatedNotesMatch = markdown.match(
    /(?:^|\r?\n)## Related notes\s*(?:\r?\n)+((?:- \[\[[^[\]]+\]\](?:\r?\n|$))+)\s*$/u
  );

  const legacyTitles = legacyMatch?.[1]
    ? legacyMatch[1]
        .split(/\r?\n/)
        .map((line) => line.match(/^- (.+)$/)?.[1] || '')
    : [];

  const relatedNoteTitles = relatedNotesMatch?.[1]
    ? relatedNotesMatch[1]
        .split(/\r?\n/)
        .map((line) => parseWikiLinkTitle(line.match(/^- \[\[([^[\]]+)\]\]$/)?.[1] || '') || '')
    : [];

  return normalizeReferenceTitles([
    ...legacyTitles,
    ...relatedNoteTitles,
    ...parseInlineWikiLinkTitles(markdown),
  ]);
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

export const upsertKnowledgeRelatedNotesSection = (markdown: string, referenceTitles: string[]) => {
  const normalizedReferenceTitles = normalizeReferenceTitles(referenceTitles);
  const baseMarkdown = stripKnowledgeRelatedNotesSection(
    stripKnowledgeReferenceSection(markdown.replace(/^\uFEFF/, ''))
  );

  if (normalizedReferenceTitles.length === 0) {
    return baseMarkdown;
  }

  const referenceSection = [
    RELATED_NOTES_SECTION_HEADING,
    ...normalizedReferenceTitles.map((title) => `- [[${title}]]`),
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
