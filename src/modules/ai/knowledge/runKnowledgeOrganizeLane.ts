import type { GeneratedFile, RequirementDoc } from '../../../types';

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
  { key: 'project-overview', title: '项目总览.md', docType: 'wiki-index' },
  { key: 'feature-inventory', title: '功能清单.md', docType: 'wiki-index' },
  { key: 'page-inventory', title: '页面清单.md', docType: 'wiki-index' },
  { key: 'terminology', title: '术语表.md', docType: 'ai-summary' },
  { key: 'open-questions', title: '待确认问题.md', docType: 'ai-summary' },
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

const buildLanePrompt = ({
  project,
  requirementDocs,
  generatedFiles,
}: Omit<KnowledgeOrganizeLaneInput, 'executeText'>) => {
  const requirementSection = requirementDocs.length
    ? requirementDocs
        .map((doc) => `## ${doc.title}\n${doc.content.trim()}`)
        .join('\n\n')
    : '暂无需求文档。';
  const generatedSection = generatedFiles.length
    ? generatedFiles
        .slice(0, 12)
        .map((file) => `- ${file.path}: ${file.summary}`)
        .join('\n')
    : '- 暂无生成产物';

  return [
    `你是 ${project.name} 的产品知识库整理助手。`,
    '请根据已有需求文档和现有产物，生成 5 份结构化知识文档。',
    '只返回 JSON 对象，不要返回解释文字。',
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
    '# 需求文档',
    requirementSection,
    '',
    '# 现有产物',
    generatedSection,
  ].join('\n');
};

const parseLanePayload = (raw: string) => {
  const payloadText = extractJSONObject(raw);
  if (!payloadText) {
    throw new Error('知识整理没有返回有效 JSON。');
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
    const summary = typeof entry?.summary === 'string' && entry.summary.trim()
      ? entry.summary.trim()
      : summarizeContent(content || title.replace(/\.md$/i, ''));

    return {
      id: `knowledge-organize:${project.id}:${key}`,
      title,
      content: content || `# ${title.replace(/\.md$/i, '')}`,
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
