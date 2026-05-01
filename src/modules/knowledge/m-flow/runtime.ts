import type { GeneratedFile, RequirementDoc } from '../../../types';
import { getDirectoryPath } from '../../../utils/fileSystemPaths.ts';
import { buildEdges } from './buildEdges.ts';
import { buildEntities } from './buildEntities.ts';
import { buildEpisodes } from './buildEpisodes.ts';
import { buildFacetPoints } from './buildFacetPoints.ts';
import { buildFacets } from './buildFacets.ts';
import { ingestMFlowSources, shouldIgnoreMFlowPath, type MFlowProjectFileInput } from './ingest.ts';
import type { MFlowManifest, MFlowState } from './model.ts';
import {
  getVaultMFlowEdgesPath,
  getVaultMFlowEntitiesPath,
  getVaultMFlowEpisodesPath,
  getVaultMFlowFacetPointsPath,
  getVaultMFlowFacetsPath,
  getVaultMFlowManifestPath,
  getVaultMFlowSourcesPath,
  readMFlowState,
  writeMFlowState,
} from './persistence.ts';
import { renderMFlowArtifacts, type MFlowArtifact } from './renderArtifacts.ts';
import { scoreEpisodeBundles } from './scoreBundles.ts';
import { searchAnchors } from './searchAnchors.ts';
import { normalizeWhitespace, summarizeText } from './shared.ts';

const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === 'function';

const loadProjectPersistenceModule = () => import('../../../utils/projectPersistence.ts');

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

const hashFingerprint = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const buildMFlowManifest = (state: Omit<MFlowState, 'manifest'>, builtAt: string): MFlowManifest => ({
  version: 1,
  builtAt,
  fingerprint: hashFingerprint(
    state.sources.map((source) => [source.path, source.updatedAt, normalizeWhitespace(source.content)].join('::')).join('\n')
  ),
  sourceCount: state.sources.length,
  episodeCount: state.episodes.length,
  facetCount: state.facets.length,
  facetPointCount: state.facetPoints.length,
  entityCount: state.entities.length,
  edgeCount: state.edges.length,
});

const getFileExtension = (value: string) => {
  const matched = value.toLowerCase().match(/\.([a-z0-9]+)$/);
  return matched ? matched[1] : '';
};

const collectProjectFilesFromVault = async (
  vaultPath: string,
  absolutePath = vaultPath,
  relativeBase = ''
): Promise<MFlowProjectFileInput[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  const { listProjectDirectory, readProjectTextFile } = await loadProjectPersistenceModule();
  const entries = await listProjectDirectory(absolutePath);
  const projectFiles: MFlowProjectFileInput[] = [];

  for (const rawEntry of entries) {
    const trimmed = rawEntry.trim();
    const isDirectory = trimmed.endsWith('/');
    const entryName = isDirectory ? trimmed.slice(0, -1) : trimmed;
    if (!entryName) {
      continue;
    }

    const nextRelativePath = relativeBase ? `${relativeBase}/${entryName}` : entryName;
    if (shouldIgnoreMFlowPath(nextRelativePath)) {
      continue;
    }

    const nextAbsolutePath = `${absolutePath}${absolutePath.endsWith('\\') || absolutePath.endsWith('/') ? '' : '\\'}${entryName}`;
    if (isDirectory) {
      projectFiles.push(...(await collectProjectFilesFromVault(vaultPath, nextAbsolutePath, nextRelativePath)));
      continue;
    }

    if (!INDEXABLE_EXTENSIONS.has(getFileExtension(nextRelativePath))) {
      continue;
    }

    const content = await readProjectTextFile(nextAbsolutePath);
    if (!content || !content.trim()) {
      continue;
    }

    projectFiles.push({
      path: nextRelativePath,
      content,
      updatedAt: new Date().toISOString(),
    });
  }

  return projectFiles;
};

const buildStateArtifacts = (vaultPath: string, state: MFlowState): MFlowArtifact[] => [
  {
    path: getVaultMFlowManifestPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.manifest, null, 2),
  },
  {
    path: getVaultMFlowSourcesPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.sources, null, 2),
  },
  {
    path: getVaultMFlowEpisodesPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.episodes, null, 2),
  },
  {
    path: getVaultMFlowFacetsPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.facets, null, 2),
  },
  {
    path: getVaultMFlowFacetPointsPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.facetPoints, null, 2),
  },
  {
    path: getVaultMFlowEntitiesPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.entities, null, 2),
  },
  {
    path: getVaultMFlowEdgesPath(vaultPath).replace(/\\/g, '/'),
    content: JSON.stringify(state.edges, null, 2),
  },
];

const writeArtifactsToDisk = async (artifacts: MFlowArtifact[]) => {
  const { ensureProjectDirectory, writeProjectTextFile } = await loadProjectPersistenceModule();
  for (const artifact of artifacts) {
    const directoryPath = getDirectoryPath(artifact.path);
    if (directoryPath) {
      await ensureProjectDirectory(directoryPath);
    }
    await writeProjectTextFile(artifact.path, artifact.content);
  }
};

export const rebuildProjectMFlow = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  projectFiles?: MFlowProjectFileInput[];
  writeArtifacts?: boolean;
}) => {
  const builtAt = new Date().toISOString();
  const projectFiles = options.projectFiles || (await collectProjectFilesFromVault(options.vaultPath));
  const sources = await ingestMFlowSources({
    vaultPath: options.vaultPath,
    requirementDocs: options.requirementDocs,
    generatedFiles: options.generatedFiles,
    projectFiles,
  });
  const episodes = buildEpisodes(sources);
  const facets = buildFacets(episodes);
  const facetPoints = buildFacetPoints(facets);
  const entities = buildEntities({ episodes, facets, sources });
  const edges = buildEdges({ episodes, facets, facetPoints, entities });

  const draftState = {
    sources,
    episodes,
    facets,
    facetPoints,
    entities,
    edges,
  };
  const nextState: MFlowState = {
    manifest: buildMFlowManifest(draftState, builtAt),
    ...draftState,
  };

  const existingState = isTauriRuntimeAvailable() ? await readMFlowState(options.vaultPath) : null;
  const refreshed = existingState?.manifest.fingerprint !== nextState.manifest.fingerprint;
  const state = refreshed === false && existingState ? existingState : nextState;
  const artifacts = [...buildStateArtifacts(options.vaultPath, state), ...renderMFlowArtifacts({ vaultPath: options.vaultPath, state })];

  if (isTauriRuntimeAvailable()) {
    const { ensureVaultMFlowDirectoryStructure } = await loadProjectPersistenceModule();
    await ensureVaultMFlowDirectoryStructure(options.vaultPath);
    if (refreshed !== false) {
      await writeMFlowState(options.vaultPath, state);
    }
    if (options.writeArtifacts !== false) {
      await writeArtifactsToDisk(artifacts);
    }
  }

  return {
    state,
    artifacts,
    refreshed: refreshed !== false,
  };
};

export const loadMFlowPromptState = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  projectFiles?: MFlowProjectFileInput[];
  cachedState?: MFlowState | null;
}) => {
  if (options.cachedState) {
    return {
      state: options.cachedState,
      source: 'cache' as const,
    };
  }

  const existingState = isTauriRuntimeAvailable() ? await readMFlowState(options.vaultPath) : null;
  if (existingState) {
    return {
      state: existingState,
      source: 'disk' as const,
    };
  }

  const rebuilt = await rebuildProjectMFlow({
    ...options,
    writeArtifacts: false,
  });

  return {
    state: rebuilt.state,
    source: 'rebuild' as const,
  };
};

export const buildMFlowPromptContext = (state: MFlowState, userInput: string) => {
  const bundles = scoreEpisodeBundles({
    state,
    anchors: searchAnchors(state, userInput),
    hopCost: 0.15,
    directEpisodePenalty: 0.4,
    edgeMissCost: 0.9,
  }).slice(0, 5);

  return {
    labels: [`m-flow / ${state.manifest.episodeCount} episodes`, `bundles / ${bundles.length}`],
    indexSection: bundles
      .map((bundle) => {
        const episode = state.episodes.find((candidate) => candidate.id === bundle.episodeId);
        return `- ${bundle.episodeId} | ${episode?.path || ''} | best_path: ${bundle.bestPath.kind} | score: ${bundle.score.toFixed(3)}`;
      })
      .join('\n'),
    expandedSection: bundles
      .map((bundle) => {
        const episode = state.episodes.find((candidate) => candidate.id === bundle.episodeId);
        return [
          `episode_bundle: ${bundle.episodeId}`,
          `best_path: ${bundle.bestPath.kind}`,
          `support_id: ${bundle.bestPath.supportId || 'none'}`,
          `score: ${bundle.score.toFixed(3)}`,
          `summary: ${episode?.summary || ''}`,
          `path: ${episode?.path || ''}`,
        ].join('\n');
      })
      .join('\n\n'),
    policySection:
      'Prefer the lowest-cost episode bundle routed from precise anchors. Use point/entity evidence before broad episode summaries when possible.',
  };
};

export const formatMFlowRefreshSummary = (state: MFlowState, refreshed: boolean) =>
  refreshed
    ? `原生 m-flow 已刷新：${state.manifest.sourceCount} 个来源，${state.manifest.episodeCount} 个 Episodes，${state.manifest.edgeCount} 条 Edges。`
    : `原生 m-flow 已是最新状态：${state.manifest.sourceCount} 个来源，${state.manifest.episodeCount} 个 Episodes，${state.manifest.edgeCount} 条 Edges。`;

export const summarizeMFlowArtifacts = (artifacts: MFlowArtifact[]) =>
  artifacts.slice(0, 12).map((artifact) => summarizeText(artifact.path, 140));
