import type { GeneratedFile, KnowledgeRetrievalMethod, RequirementDoc } from '../../types';
import {
  getDirectoryPath,
  getRelativePathFromRoot,
  joinFileSystemPath,
  normalizeRelativeFileSystemPath,
} from '../../utils/fileSystemPaths.ts';
import {
  ensureProjectDirectory,
  ensureVaultKnowledgeDirectoryStructure,
  ensureVaultKnowledgeRuntimeDirectoryStructure,
  getProjectDir,
  getSystemIndexChunksPath,
  getSystemIndexDir,
  getSystemIndexDocIntentsPath,
  getSystemIndexManifestPath,
  getSystemIndexSourcesPath,
  getSystemIndexTopicsPath,
  getVaultBaseIndexDir,
  getVaultSkillOutputsDir,
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
import { buildKnowledgeRuntimeArtifacts } from './runtime/knowledgeRuntime.ts';

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

const isLlmwikiOutputPath = (normalizedPath: string) =>
  normalizedPath === '_goodnight/outputs/llmwiki' ||
  normalizedPath.startsWith('_goodnight/outputs/llmwiki/');

const shouldIgnoreRelativePath = (
  relativePath: string,
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod
) => {
  const normalized = normalizeRelativeFileSystemPath(relativePath);
  if (!normalized) {
    return true;
  }

  if (normalized === '.goodnight' || normalized.startsWith('.goodnight/')) {
    return true;
  }

  if (normalized === '_goodnight' || normalized.startsWith('_goodnight/')) {
    return knowledgeRetrievalMethod !== 'llmwiki' || !isLlmwikiOutputPath(normalized);
  }

  const topLevel = normalized.split('/')[0] || normalized;
  return IGNORED_DIRECTORIES.has(topLevel);
};

const collectProjectFileSources = async (
  projectDir: string,
  absolutePath: string,
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod,
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
    if (shouldIgnoreRelativePath(nextRelativePath, knowledgeRetrievalMethod)) {
      continue;
    }

    const nextAbsolutePath = `${absolutePath}${absolutePath.endsWith('\\') || absolutePath.endsWith('/') ? '' : '\\'}${entry.name}`;
    if (entry.isDirectory) {
      const nestedSources = await collectProjectFileSources(
        projectDir,
        nextAbsolutePath,
        knowledgeRetrievalMethod,
        nextRelativePath
      );
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
      id: `${isLlmwikiOutputPath(nextRelativePath) ? 'generated' : 'project-file'}:${nextRelativePath}`,
      path: nextRelativePath,
      title: nextRelativePath.split('/').pop() || nextRelativePath,
      content,
      updatedAt: new Date().toISOString(),
      kind: isLlmwikiOutputPath(nextRelativePath) ? 'generated-file' : 'project-file',
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

const writeKnowledgeRuntimeArtifacts = async (
  index: SystemIndexData,
  vaultPath: string,
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod
) => {
  const artifacts = buildKnowledgeRuntimeArtifacts({
    index,
    vaultPath,
    knowledgeRetrievalMethod,
  });

  for (const artifact of artifacts) {
    const directoryPath = getDirectoryPath(artifact.path);
    if (directoryPath) {
      await ensureProjectDirectory(directoryPath);
    }
    await writeProjectTextFile(artifact.path, artifact.content);
  }
};

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

export const getProjectSystemIndexArtifactPath = (
  vaultPath: string,
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod
) => joinFileSystemPath(getVaultSkillOutputsDir(vaultPath, knowledgeRetrievalMethod), 'system-index.md');

export const buildProjectSystemIndexArtifact = (
  index: SystemIndexData,
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod
) => {
  const topicLines = index.topics
    .slice(0, 8)
    .map((topic) => `- ${topic.label} (${topic.sourceIds.length} sources, ${topic.chunkIds.length} chunks)`);
  const sourceLines = index.sources
    .slice(0, 12)
    .map((source) => `- ${source.path} | ${source.kind} | ${source.summary || 'No summary'}`);
  const intentLines = index.docIntents.map(
    (intent) => `- ${intent.id} | ${intent.label} | ${intent.sourceIds.length} sources | ${intent.chunkIds.length} chunks`
  );

  return [
    '# System Index Artifact',
    '',
    `Built at: ${index.manifest.builtAt}`,
    `Project: ${index.manifest.projectName} (${index.manifest.projectId})`,
    `Retrieval method: \`${knowledgeRetrievalMethod}\``,
    `Fingerprint: \`${index.manifest.fingerprint}\``,
    '',
    '## Counts',
    `- Sources: ${index.manifest.sourceCount}`,
    `- Chunks: ${index.manifest.chunkCount}`,
    `- Topics: ${index.manifest.topicCount}`,
    '',
    '## Canonical hidden files',
    '- `.goodnight/base-index/manifest.json`',
    '- `.goodnight/base-index/sources.json`',
    '- `.goodnight/base-index/chunks.jsonl`',
    '- `.goodnight/base-index/topics.json`',
    '- `.goodnight/base-index/doc-intents.json`',
    '',
    '## Top topics',
    ...(topicLines.length > 0 ? topicLines : ['- none']),
    '',
    '## Representative sources',
    ...(sourceLines.length > 0 ? sourceLines : ['- none']),
    '',
    '## Doc intents',
    ...(intentLines.length > 0 ? intentLines : ['- none']),
  ].join('\n');
};

export const refreshProjectSystemIndex = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  writeRuntimeArtifacts?: boolean;
}) => {
  await ensureVaultKnowledgeDirectoryStructure(options.vaultPath);
  const projectDir = options.vaultPath;
  const systemIndexDir = getVaultBaseIndexDir(options.vaultPath);
  await ensureProjectDirectory(systemIndexDir);

  const projectSources = await collectProjectFileSources(
    options.vaultPath,
    options.vaultPath,
    options.knowledgeRetrievalMethod
  );
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
    if (options.writeRuntimeArtifacts !== false) {
      await ensureVaultKnowledgeRuntimeDirectoryStructure(options.vaultPath, options.knowledgeRetrievalMethod);
      await writeProjectTextFile(
        getProjectSystemIndexArtifactPath(options.vaultPath, options.knowledgeRetrievalMethod),
        buildProjectSystemIndexArtifact(currentIndex, options.knowledgeRetrievalMethod)
      );
      await writeKnowledgeRuntimeArtifacts(currentIndex, options.vaultPath, options.knowledgeRetrievalMethod);
    }
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
  if (options.writeRuntimeArtifacts !== false) {
    await ensureVaultKnowledgeRuntimeDirectoryStructure(options.vaultPath, options.knowledgeRetrievalMethod);
    await writeProjectTextFile(
      getProjectSystemIndexArtifactPath(options.vaultPath, options.knowledgeRetrievalMethod),
      buildProjectSystemIndexArtifact(nextIndex, options.knowledgeRetrievalMethod)
    );
    await writeKnowledgeRuntimeArtifacts(nextIndex, options.vaultPath, options.knowledgeRetrievalMethod);
  }

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
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  writeRuntimeArtifacts?: boolean;
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
