import type { GeneratedFile, RequirementDoc } from '../../types';

export type KnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: 'markdown' | 'html';
  source: 'requirement' | 'generated';
  filePath?: string;
  updatedAt: string;
  status: 'draft' | 'ready';
  kind?: RequirementDoc['kind'];
  tags: string[];
  relatedIds: string[];
  sourceRequirementId?: string;
};

export const toGeneratedKnowledgeId = (path: string) => `generated:${path}`;

const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

const isVisibleGeneratedKnowledgePath = (path: string, type: KnowledgeEntry['type']) => {
  const normalizedPath = normalizePath(path).toLowerCase();

  if (normalizedPath.startsWith('design/')) {
    return true;
  }

  if (type === 'html' && normalizedPath.startsWith('src/generated/prototypes/')) {
    return true;
  }

  return false;
};

const inferRequirementKind = (doc: RequirementDoc): RequirementDoc['kind'] => {
  if (doc.kind) {
    return doc.kind;
  }

  const normalizedTitle = doc.title.toLowerCase();
  if (normalizedTitle.includes('草图') || normalizedTitle.includes('sketch')) {
    return 'sketch';
  }
  if (normalizedTitle.includes('需求') || normalizedTitle.includes('spec')) {
    return 'spec';
  }
  return 'note';
};

export const buildKnowledgeEntries = (
  requirementDocs: RequirementDoc[],
  generatedFiles: GeneratedFile[]
): KnowledgeEntry[] => [
  ...requirementDocs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    content: doc.content,
    type: 'markdown' as const,
    source: 'requirement' as const,
    filePath: doc.filePath,
    updatedAt: doc.updatedAt,
    status: doc.status,
    kind: inferRequirementKind(doc),
    tags: doc.tags || [],
    relatedIds: doc.relatedIds || [],
    sourceRequirementId: undefined,
  })),
  ...generatedFiles
    .filter((file) => file.language === 'html' || file.language === 'md')
    .map((file) => {
      const type: KnowledgeEntry['type'] = file.language === 'html' ? 'html' : 'markdown';
      return {
        id: toGeneratedKnowledgeId(file.path),
        title: file.path.split('/').pop() || file.path,
        summary: file.summary,
        content: file.content,
        type,
        source: 'generated' as const,
        filePath: file.path,
        updatedAt: file.updatedAt,
        status: 'ready' as const,
        kind: undefined,
        tags: file.tags || [],
        relatedIds: (file.relatedRequirementIds || []).slice(),
        sourceRequirementId: file.sourceRequirementId,
      };
    })
    .filter((entry) => isVisibleGeneratedKnowledgePath(entry.filePath || '', entry.type)),
].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

export const findKnowledgeEntry = (entries: KnowledgeEntry[], id: string | null) =>
  id ? entries.find((entry) => entry.id === id) || null : null;

export const buildKnowledgeContextSelection = (
  entries: KnowledgeEntry[],
  activeKnowledgeFileId: string | null,
  selectedKnowledgeContextIds: string[]
) => {
  const currentFile =
    findKnowledgeEntry(entries, activeKnowledgeFileId) ||
    findKnowledgeEntry(entries, selectedKnowledgeContextIds[0] || null) ||
    null;

  const selectedIds = new Set(selectedKnowledgeContextIds);
  const relatedFiles = entries.filter(
    (entry) => entry.id !== currentFile?.id && (selectedIds.has(entry.id) || currentFile?.relatedIds.includes(entry.id))
  );

  return {
    currentFile,
    relatedFiles,
  };
};
