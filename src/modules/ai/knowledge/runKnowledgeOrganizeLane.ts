import type { GeneratedFile, RequirementDoc } from '../../../types';
import { KNOWLEDGE_ORGANIZE_DOC_TITLES } from './knowledgeOrganizeState.ts';

type KnowledgeOrganizeDocKey =
  | 'project-overview'
  | 'feature-inventory'
  | 'page-inventory'
  | 'terminology'
  | 'open-questions';

type KnowledgeOrganizeDocDraft = {
  summary: string;
  content: string;
};

type KnowledgeOrganizeLaneDoc = RequirementDoc & {
  docType: 'wiki-index' | 'ai-summary';
};

type KnowledgeOrganizeLaneInput = {
  project: {
    id: string;
    name: string;
  };
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  executeText: (prompt: string) => Promise<string>;
};

const DOC_BLUEPRINTS: Array<{
  key: KnowledgeOrganizeDocKey;
  title: string;
  docType: KnowledgeOrganizeLaneDoc['docType'];
}> = [
  { key: 'project-overview', title: KNOWLEDGE_ORGANIZE_DOC_TITLES[0], docType: 'wiki-index' },
  { key: 'feature-inventory', title: KNOWLEDGE_ORGANIZE_DOC_TITLES[1], docType: 'wiki-index' },
  { key: 'page-inventory', title: KNOWLEDGE_ORGANIZE_DOC_TITLES[2], docType: 'wiki-index' },
  { key: 'terminology', title: KNOWLEDGE_ORGANIZE_DOC_TITLES[3], docType: 'ai-summary' },
  { key: 'open-questions', title: KNOWLEDGE_ORGANIZE_DOC_TITLES[4], docType: 'ai-summary' },
];

const extractJSONObject = (value: string) => {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = value.indexOf('{');
  if (objectStart === -1) {
    return '';
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push(char);
      continue;
    }

    if (char === '}') {
      stack.pop();
      if (stack.length === 0) {
        return value.slice(objectStart, index + 1);
      }
    }
  }

  return '';
};

const summarizeContent = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
};

const stripMarkdownExtension = (value: string) => value.replace(/\.(md|markdown)$/i, '');

const extractLeadingHeading = (value: string) => {
  const match = value.trim().match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim() || '';
};

const removeLeadingHeading = (value: string) => value.trim().replace(/^#\s+.+?(?:\r?\n|$)/, '').trim();

const buildWikiIndexSection = (body: string, summary: string) => {
  const sectionTitles = Array.from(body.matchAll(/^##\s+(.+)$/gm))
    .map((match) => match[1]?.trim() || '')
    .filter((title) => title && !/^(index|索引)$/i.test(title));

  const items = sectionTitles.length > 0 ? sectionTitles : [summary || '待补充'];
  return `## 索引\n${items.map((item) => `- ${item}`).join('\n')}`;
};

const normalizeWikiDraftContent = (title: string, content: string, summary: string) => {
  const fallbackHeading = stripMarkdownExtension(title);
  const heading = extractLeadingHeading(content) || fallbackHeading;
  const rawBody = removeLeadingHeading(content);
  const hasSecondaryHeading = /^##\s+/m.test(rawBody);
  const hasIndexSection = /^##\s*(index|索引)\s*$/im.test(rawBody);

  let body = rawBody;
  if (!body) {
    body = `## 索引\n- ${summary || fallbackHeading}\n\n## 内容\n- 待补充`;
  } else if (!hasSecondaryHeading) {
    body = `${buildWikiIndexSection(body, summary)}\n\n## 内容\n${body}`;
  } else if (!hasIndexSection) {
    body = `${buildWikiIndexSection(body, summary)}\n\n${body}`;
  }

  return `# ${heading}\n\n${body.trim()}`;
};

const normalizeDraftContent = (
  title: string,
  docType: KnowledgeOrganizeLaneDoc['docType'],
  content: string,
  summary: string
) => {
  if (docType === 'wiki-index') {
    return normalizeWikiDraftContent(title, content, summary);
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return `# ${stripMarkdownExtension(title)}`;
  }

  if (/^#\s+/m.test(trimmed)) {
    return trimmed;
  }

  return `# ${stripMarkdownExtension(title)}\n\n${trimmed}`;
};

const buildLanePrompt = ({
  project,
  requirementDocs,
  generatedFiles,
}: Omit<KnowledgeOrganizeLaneInput, 'executeText'>) => {
  const requirementSection = requirementDocs.length
    ? requirementDocs.map((doc) => `## ${doc.title}\n${doc.content.trim()}`).join('\n\n')
    : 'No requirement documents yet.';
  const generatedSection = generatedFiles.length
    ? generatedFiles
        .slice(0, 12)
        .map((file) => `- ${file.path}: ${file.summary}`)
        .join('\n')
    : '- No generated artifacts yet';

  return [
    `You are the product knowledge organizer for ${project.name}.`,
    'Based on the current knowledge docs and generated artifacts, produce 5 structured system index drafts.',
    'These drafts are system-maintained internal context, not editable user notes.',
    'For project-overview, feature-inventory, and page-inventory, the markdown must include an H1 title, a "## 索引" section with bullets, and at least one additional "##" section.',
    'Return JSON only, without any extra explanation.',
    'JSON schema:',
    JSON.stringify(
      {
        'project-overview': { summary: 'string', content: 'markdown' },
        'feature-inventory': { summary: 'string', content: 'markdown' },
        'page-inventory': { summary: 'string', content: 'markdown' },
        terminology: { summary: 'string', content: 'markdown' },
        'open-questions': { summary: 'string', content: 'markdown' },
      },
      null,
      2
    ),
    '',
    '# Requirement docs',
    requirementSection,
    '',
    '# Existing artifacts',
    generatedSection,
  ].join('\n');
};

const parseLanePayload = (raw: string) => {
  const payloadText = extractJSONObject(raw);
  if (!payloadText) {
    throw new Error('Knowledge organize did not return valid JSON.');
  }

  return JSON.parse(payloadText) as Partial<Record<KnowledgeOrganizeDocKey, Partial<KnowledgeOrganizeDocDraft>>>;
};

export const runKnowledgeOrganizeLane = async ({
  project,
  requirementDocs,
  generatedFiles,
  executeText,
}: KnowledgeOrganizeLaneInput): Promise<KnowledgeOrganizeLaneDoc[]> => {
  const raw = await executeText(
    buildLanePrompt({
      project,
      requirementDocs,
      generatedFiles,
    })
  );
  const payload = parseLanePayload(raw);
  const now = new Date().toISOString();

  return DOC_BLUEPRINTS.map(({ key, title, docType }) => {
    const entry = payload[key];
    const content = typeof entry?.content === 'string' ? entry.content.trim() : '';
    const summary =
      typeof entry?.summary === 'string' && entry.summary.trim()
        ? entry.summary.trim()
        : summarizeContent(content || title.replace(/\.md$/i, ''));
    const normalizedContent = normalizeDraftContent(title, docType, content, summary);

    return {
      id: `knowledge-organize:${project.id}:${key}`,
      title,
      content: normalizedContent,
      summary,
      kind: 'note',
      docType,
      tags: ['knowledge-organize'],
      relatedIds: [],
      authorRole: '产品',
      sourceType: 'ai',
      updatedAt: now,
      status: 'ready',
    };
  });
};
