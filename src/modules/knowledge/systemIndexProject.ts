import type { GeneratedFile, RequirementDoc } from '../../types';
import { getRelativePathFromRoot, normalizeRelativeFileSystemPath } from '../../utils/fileSystemPaths.ts';
import {
  ensureProjectDirectory,
  ensureVaultKnowledgeDirectoryStructure,
  getProjectDir,
  getSystemIndexChunksPath,
  getSystemIndexDir,
  getSystemIndexDocIntentsPath,
  getSystemIndexManifestPath,
  getSystemIndexSourcesPath,
  getSystemIndexTopicsPath,
  getVaultBaseIndexDir,
  listProjectDirectory,
  readProjectJsonFile,
  readProjectTextFile,
  writeProjectJsonFile,
  writeProjectTextFile,
} from '../../utils/projectPersistence.ts';
import {
  buildSystemIndex,
  buildSystemIndexPromptContext,
  type SystemIndexChunk,
  type SystemIndexData,
  type SystemIndexDocIntent,
  type SystemIndexInputSource,
  type SystemIndexManifest,
  type SystemIndexSourceRecord,
  type SystemIndexTopic,
} from './systemIndex.ts';

const INDEXABLE_EXTENSIONS = new Set([
  'md',
  'markdown',
  'txt',
  'json',
  'html',
  'css',
  'ts',
  'tsx',
  'js',
  'jsx',
  'yml',
  'yaml',
  'rs',
  'toml',
  'sh',
  'sql',
  'py',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.worktrees',
  'node_modules',
  'target',
  'dist',
  'dist-test',
  '.tmp',
]);

const normalizePath = (value: string) => value.replace(/\\/g, '/');

const getFileExtension = (value: string) => {
  const matched = value.toLowerCase().match(/\.([a-z0-9]+)$/);
  return matched ? matched[1] : '';
};

const summarizeText = (value: string, maxLength = 140) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const toSyntheticKnowledgePath = (doc: RequirementDoc) =>
  normalizeRelativeFileSystemPath(`knowledge/${doc.title || doc.id}`);

const mapRequirementDocToIndexSource = (projectDir: string, doc: RequirementDoc): SystemIndexInputSource => ({
  id: `knowledge:${doc.id}`,
  path:
    (doc.filePath && getRelativePathFromRoot(doc.filePath, projectDir)) ||
    normalizeRelativeFileSystemPath(doc.filePath || '') ||
    toSyntheticKnowledgePath(doc),
  title: doc.title,
  content: doc.content,
  updatedAt: doc.updatedAt,
  kind: 'knowledge-doc',
  tags: doc.tags || [],
  summary: doc.summary,
});

const mapGeneratedFileToIndexSource = (file: GeneratedFile): SystemIndexInputSource => ({
  id: `generated:${file.path}`,
  path: normalizeRelativeFileSystemPath(file.path),
  title: file.path.split('/').pop() || file.path,
  content: file.content,
  updatedAt: file.updatedAt,
  kind: 'generated-file',
  tags: file.tags || [],
  summary: file.summary,
});

const parseDirectoryEntry = (entry: string) => {
  const trimmed = entry.trim();
  return {
    name: trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed,
    isDirectory: trimmed.endsWith('/'),
  };
};

const shouldIgnoreRelativePath = (relativePath: string) => {
  const normalized = normalizeRelativeFileSystemPath(relativePath);
  if (!normalized) {
    return true;
  }

  if (normalized.startsWith('.goodnight/base-index')) {
    return true;
  }

  const topLevel = normalized.split('/')[0] || normalized;
  return IGNORED_DIRECTORIES.has(topLevel);
};

const collectProjectFileSources = async (
  projectDir: string,
  absolutePath: string,
  relativeBase = ''
): Promise<SystemIndexInputSource[]> => {
  const entries = await listProjectDirectory(absolutePath);
  const sources: SystemIndexInputSource[] = [];

  for (const rawEntry of entries) {
    const entry = parseDirectoryEntry(rawEntry);
    if (!entry.name) {
      continue;
    }

    const nextRelativePath = normalizeRelativeFileSystemPath(relativeBase ? `${relativeBase}/${entry.name}` : entry.name);
    if (shouldIgnoreRelativePath(nextRelativePath)) {
      continue;
    }

    const nextAbsolutePath = `${absolutePath}${absolutePath.endsWith('\\') || absolutePath.endsWith('/') ? '' : '\\'}${entry.name}`;
    if (entry.isDirectory) {
      const nestedSources = await collectProjectFileSources(projectDir, nextAbsolutePath, nextRelativePath);
      sources.push(...nestedSources);
      continue;
    }

    const extension = getFileExtension(nextRelativePath);
    if (!INDEXABLE_EXTENSIONS.has(extension)) {
      continue;
    }

    const content = await readProjectTextFile(nextAbsolutePath);
    if (!content || !content.trim()) {
      continue;
    }

    sources.push({
      id: `project-file:${nextRelativePath}`,
      path: nextRelativePath,
      title: nextRelativePath.split('/').pop() || nextRelativePath,
      content,
      updatedAt: new Date().toISOString(),
      kind: 'project-file',
      tags: [extension],
      summary: summarizeText(content),
    });
  }

  return sources;
};

const dedupeSources = (sources: SystemIndexInputSource[]) => {
  const priority: Record<SystemIndexInputSource['kind'], number> = {
    'knowledge-doc': 3,
    'generated-file': 2,
    'project-file': 1,
  };
  const deduped = new Map<string, SystemIndexInputSource>();

  for (const source of sources) {
    const key = normalizePath(source.path);
    const existing = deduped.get(key);
    if (!existing || priority[source.kind] >= priority[existing.kind]) {
      deduped.set(key, {
        ...source,
        path: key,
      });
    }
  }

  return [...deduped.values()];
};

const serializeChunksJsonl = (chunks: SystemIndexChunk[]) =>
  chunks.map((chunk) => JSON.stringify(chunk)).join('\n');

const parseChunksJsonl = (content: string): SystemIndexChunk[] =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SystemIndexChunk];
      } catch {
        return [];
      }
    });

export const loadProjectSystemIndex = async (projectDir: string): Promise<SystemIndexData | null> => {
  const manifest = await readProjectJsonFile<SystemIndexManifest>(getSystemIndexManifestPath(projectDir));
  if (!manifest) {
    return null;
  }

  const sources = (await readProjectJsonFile<SystemIndexSourceRecord[]>(getSystemIndexSourcesPath(projectDir))) || [];
  const topics = (await readProjectJsonFile<SystemIndexTopic[]>(getSystemIndexTopicsPath(projectDir))) || [];
  const docIntents =
    (await readProjectJsonFile<SystemIndexDocIntent[]>(getSystemIndexDocIntentsPath(projectDir))) || [];
  const chunksText = await readProjectTextFile(getSystemIndexChunksPath(projectDir));
  const chunks = chunksText ? parseChunksJsonl(chunksText) : [];

  return {
    manifest,
    sources,
    chunks,
    topics,
    docIntents,
  };
};

export const refreshProjectSystemIndex = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
}) => {
  await ensureVaultKnowledgeDirectoryStructure(options.vaultPath);
  const projectDir = options.vaultPath;
  const systemIndexDir = getVaultBaseIndexDir(options.vaultPath);
  await ensureProjectDirectory(systemIndexDir);

  const projectSources = await collectProjectFileSources(options.vaultPath, options.vaultPath);
  const mergedSources = dedupeSources([
    ...options.requirementDocs.map((doc) => mapRequirementDocToIndexSource(projectDir, doc)),
    ...options.generatedFiles.map(mapGeneratedFileToIndexSource),
    ...projectSources,
  ]);

  const nextIndex = buildSystemIndex({
    projectId: options.projectId,
    projectName: options.projectName,
    sources: mergedSources,
  });
  const currentIndex = await loadProjectSystemIndex(projectDir);

  if (currentIndex?.manifest.fingerprint === nextIndex.manifest.fingerprint) {
    return {
      index: currentIndex,
      refreshed: false,
      projectDir,
    };
  }

  await writeProjectJsonFile(getSystemIndexManifestPath(projectDir), nextIndex.manifest);
  await writeProjectJsonFile(getSystemIndexSourcesPath(projectDir), nextIndex.sources);
  await writeProjectTextFile(getSystemIndexChunksPath(projectDir), serializeChunksJsonl(nextIndex.chunks));
  await writeProjectJsonFile(getSystemIndexTopicsPath(projectDir), nextIndex.topics);
  await writeProjectJsonFile(getSystemIndexDocIntentsPath(projectDir), nextIndex.docIntents);

  return {
    index: nextIndex,
    refreshed: true,
    projectDir,
  };
};

export const ensureProjectSystemIndex = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
}) => refreshProjectSystemIndex(options);

export const buildProjectSystemIndexPromptContext = (index: SystemIndexData, userInput: string) =>
  buildSystemIndexPromptContext(index, userInput, {
    maxSources: 8,
    maxExpandedChunks: 4,
    maxExpandedChars: 2600,
  });

export const getProjectSystemIndexDir = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);
  return getSystemIndexDir(projectDir);
};
