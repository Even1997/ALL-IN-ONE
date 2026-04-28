import type { GeneratedFile, RequirementDoc } from '../../../types';

type ChangeSyncDocKey =
  | 'change-sync-proposal'
  | 'change-sync-checklist';

type ChangeSyncDocDraft = {
  summary: string;
  content: string;
};

type ChangeSyncLaneDoc = RequirementDoc & {
  docType: 'ai-summary';
};

type ChangeSyncLaneInput = {
  project: {
    id: string;
    name: string;
  };
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  executeText: (prompt: string) => Promise<string>;
};

const DOC_BLUEPRINTS: Array<{
  key: ChangeSyncDocKey;
  title: string;
}> = [
  { key: 'change-sync-proposal', title: '变更同步提案.md' },
  { key: 'change-sync-checklist', title: '待确认同步项.md' },
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
}: Omit<ChangeSyncLaneInput, 'executeText'>) => {
  const requirementSection = requirementDocs.length
    ? requirementDocs
        .map((doc) => `## ${doc.title}\n${doc.content.trim()}`)
        .join('\n\n')
    : '暂无知识文档。';
  const generatedSection = generatedFiles.length
    ? generatedFiles
        .slice(0, 16)
        .map((file) => `- ${file.path}: ${file.summary}`)
        .join('\n')
    : '- 暂无产物';

  return [
    `你是 ${project.name} 的变更同步助手。`,
    '请根据当前知识文档和产物状态，生成一份可确认的变更同步提案，以及一份待确认同步项清单。',
    '只返回 JSON 对象，不要返回解释文字。',
    'JSON schema:',
    JSON.stringify(
      {
        'change-sync-proposal': { summary: 'string', content: 'markdown' },
        'change-sync-checklist': { summary: 'string', content: 'markdown' },
      },
      null,
      2
    ),
    '',
    '# 当前知识文档',
    requirementSection,
    '',
    '# 当前产物',
    generatedSection,
  ].join('\n');
};

const parseLanePayload = (raw: string) => {
  const payloadText = extractJSONObject(raw);
  if (!payloadText) {
    throw new Error('变更同步没有返回有效 JSON。');
  }

  return JSON.parse(payloadText) as Partial<Record<ChangeSyncDocKey, Partial<ChangeSyncDocDraft>>>;
};

export const runChangeSyncLane = async ({
  project,
  requirementDocs,
  generatedFiles,
  executeText,
}: ChangeSyncLaneInput): Promise<ChangeSyncLaneDoc[]> => {
  const raw = await executeText(
    buildLanePrompt({
      project,
      requirementDocs,
      generatedFiles,
    })
  );
  const payload = parseLanePayload(raw);
  const now = new Date().toISOString();

  return DOC_BLUEPRINTS.map(({ key, title }) => {
    const entry = payload[key];
    const content = typeof entry?.content === 'string' ? entry.content.trim() : '';
    const summary = typeof entry?.summary === 'string' && entry.summary.trim()
      ? entry.summary.trim()
      : summarizeContent(content || title.replace(/\.md$/i, ''));

    return {
      id: `change-sync:${project.id}:${key}`,
      title,
      content: content || `# ${title.replace(/\.md$/i, '')}`,
      summary,
      kind: 'note',
      docType: 'ai-summary',
      tags: ['change-sync'],
      relatedIds: [],
      authorRole: '产品',
      sourceType: 'ai',
      updatedAt: now,
      status: 'ready',
    };
  });
};
