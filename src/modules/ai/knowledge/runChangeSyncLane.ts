import type { GeneratedFile, RequirementDoc } from '../../../types';

type ChangeSyncDocKey = 'change-sync-proposal' | 'change-sync-checklist';

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
  { key: 'change-sync-proposal', title: 'change-sync-proposal.md' },
  { key: 'change-sync-checklist', title: 'change-sync-checklist.md' },
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
    ? requirementDocs.map((doc) => `## ${doc.title}\n${doc.content.trim()}`).join('\n\n')
    : 'No knowledge documents yet.';
  const generatedSection = generatedFiles.length
    ? generatedFiles
        .slice(0, 16)
        .map((file) => `- ${file.path}: ${file.summary}`)
        .join('\n')
    : '- No generated artifacts yet';

  return [
    `You are the change sync assistant for ${project.name}.`,
    'Compare the current knowledge documents with generated artifacts and produce a reviewable sync proposal plus a checklist.',
    'Return JSON only, without any extra explanation.',
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
    '# Current knowledge documents',
    requirementSection,
    '',
    '# Current artifacts',
    generatedSection,
  ].join('\n');
};

const parseLanePayload = (raw: string) => {
  const payloadText = extractJSONObject(raw);
  if (!payloadText) {
    throw new Error('Change sync did not return valid JSON.');
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
    const summary =
      typeof entry?.summary === 'string' && entry.summary.trim()
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
