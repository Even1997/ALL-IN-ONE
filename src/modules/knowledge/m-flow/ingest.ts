import type { GeneratedFile, RequirementDoc } from '../../../types';
import type { MFlowSource } from './model.ts';
import { getFileStem, normalizeWhitespace, summarizeText } from './shared.ts';

type MFlowProjectFileInput = {
  path: string;
  content: string;
  updatedAt?: string;
};

type IngestMFlowSourcesOptions = {
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  projectFiles?: MFlowProjectFileInput[];
};

const IGNORED_TOP_LEVEL_DIRECTORIES = new Set([
  '.git',
  '.goodnight',
  '_goodnight',
  '.tmp',
  '.worktrees',
  'dist',
  'node_modules',
  'target',
]);

const normalizeMFlowPath = (value: string) =>
  value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');

export const shouldIgnoreMFlowPath = (value: string) => {
  const normalizedPath = normalizeMFlowPath(value);
  if (!normalizedPath) {
    return true;
  }

  const topLevel = normalizedPath.split('/')[0] || normalizedPath;
  return IGNORED_TOP_LEVEL_DIRECTORIES.has(topLevel);
};

const inferTitleFromPath = (value: string) => getFileStem(value) || 'Untitled';

const toSource = (input: {
  id: string;
  path: string;
  content: string;
  updatedAt?: string;
  kind: MFlowSource['kind'];
  title?: string;
  summary?: string;
  tags?: string[];
}): MFlowSource | null => {
  const path = normalizeMFlowPath(input.path);
  const content = input.content || '';
  if (!path || !normalizeWhitespace(content) || shouldIgnoreMFlowPath(path)) {
    return null;
  }

  return {
    id: input.id,
    path,
    title: input.title?.trim() || inferTitleFromPath(path),
    content,
    updatedAt: input.updatedAt || new Date().toISOString(),
    kind: input.kind,
    summary: input.summary?.trim() || summarizeText(content),
    tags: input.tags || [],
  };
};

const toRequirementSource = (doc: RequirementDoc): MFlowSource | null =>
  toSource({
    id: `knowledge:${doc.id}`,
    path: doc.filePath || `project/${doc.title || doc.id}.md`,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
    kind: 'knowledge-doc',
    summary: doc.summary,
    tags: doc.tags,
  });

const toGeneratedSource = (file: GeneratedFile): MFlowSource | null =>
  toSource({
    id: `generated:${file.path}`,
    path: file.path,
    title: inferTitleFromPath(file.path),
    content: file.content,
    updatedAt: file.updatedAt,
    kind: 'generated-file',
    summary: file.summary,
    tags: file.tags,
  });

const toProjectFileSource = (file: MFlowProjectFileInput): MFlowSource | null =>
  toSource({
    id: `project:${file.path}`,
    path: file.path,
    title: inferTitleFromPath(file.path),
    content: file.content,
    updatedAt: file.updatedAt,
    kind: 'project-file',
  });

const SOURCE_KIND_PRIORITY: Record<MFlowSource['kind'], number> = {
  'knowledge-doc': 3,
  'generated-file': 2,
  'project-file': 1,
};

export const ingestMFlowSources = async (options: IngestMFlowSourcesOptions): Promise<MFlowSource[]> => {
  void options.vaultPath;

  const mergedSources = [
    ...options.requirementDocs.map(toRequirementSource),
    ...options.generatedFiles.map(toGeneratedSource),
    ...(options.projectFiles || []).map(toProjectFileSource),
  ].filter((source): source is MFlowSource => Boolean(source));

  const dedupedSources = new Map<string, MFlowSource>();
  for (const source of mergedSources) {
    const existing = dedupedSources.get(source.path);
    if (!existing || SOURCE_KIND_PRIORITY[source.kind] >= SOURCE_KIND_PRIORITY[existing.kind]) {
      dedupedSources.set(source.path, source);
    }
  }

  return [...dedupedSources.values()].sort((left, right) => left.path.localeCompare(right.path, 'en'));
};

export type { IngestMFlowSourcesOptions, MFlowProjectFileInput };
