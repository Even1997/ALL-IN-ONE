import { getDirectoryPath, joinFileSystemPath } from '../../../utils/fileSystemPaths.ts';
import type {
  MFlowEdge,
  MFlowEntity,
  MFlowEpisode,
  MFlowFacet,
  MFlowFacetPoint,
  MFlowManifest,
  MFlowSource,
  MFlowState,
} from './model.ts';

export const MFLOW_OUTPUT_ROOT = '_goodnight/outputs/m-flow';
const getVaultStateDir = (vaultPath: string) => joinFileSystemPath(vaultPath, '.goodnight');
export const getVaultMFlowDir = (vaultPath: string) => joinFileSystemPath(getVaultStateDir(vaultPath), 'm-flow');
const getVaultOutputsDir = (vaultPath: string) => joinFileSystemPath(vaultPath, '_goodnight', 'outputs');
export const getVaultMFlowOutputsDir = (vaultPath: string) => joinFileSystemPath(getVaultOutputsDir(vaultPath), 'm-flow');
const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === 'function';
const loadProjectPersistenceModule = () => import('../../../utils/projectPersistence.ts');

export const getVaultMFlowManifestPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'manifest.json');

export const getVaultMFlowSourcesPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'sources.json');

export const getVaultMFlowEpisodesPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'episodes.json');

export const getVaultMFlowFacetsPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'facets.json');

export const getVaultMFlowFacetPointsPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'facet-points.json');

export const getVaultMFlowEntitiesPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'entities.json');

export const getVaultMFlowEdgesPath = (vaultPath: string) =>
  joinFileSystemPath(getVaultMFlowDir(vaultPath), 'edges.json');

export const getVaultMFlowOutputPath = (vaultPath: string, ...segments: string[]) =>
  joinFileSystemPath(getVaultMFlowOutputsDir(vaultPath), ...segments);

export const getVaultMFlowIndexArtifactPath = (vaultPath: string) =>
  joinFileSystemPath(vaultPath, `${MFLOW_OUTPUT_ROOT}/index.md`);

export const getVaultMFlowArtifactDirectoryPath = (vaultPath: string, ...segments: string[]) =>
  joinFileSystemPath(vaultPath, MFLOW_OUTPUT_ROOT, ...segments);

const ensureParentDirectory = async (filePath: string) => {
  const directoryPath = getDirectoryPath(filePath);
  if (directoryPath) {
    const { ensureProjectDirectory } = await loadProjectPersistenceModule();
    await ensureProjectDirectory(directoryPath);
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  const { writeProjectJsonFile } = await loadProjectPersistenceModule();
  await ensureParentDirectory(filePath);
  await writeProjectJsonFile(filePath, value);
};

export const writeMFlowManifest = async (vaultPath: string, manifest: MFlowManifest) =>
  writeJson(getVaultMFlowManifestPath(vaultPath), manifest);

export const writeMFlowSources = async (vaultPath: string, sources: MFlowSource[]) =>
  writeJson(getVaultMFlowSourcesPath(vaultPath), sources);

export const writeMFlowEpisodes = async (vaultPath: string, episodes: MFlowEpisode[]) =>
  writeJson(getVaultMFlowEpisodesPath(vaultPath), episodes);

export const writeMFlowFacets = async (vaultPath: string, facets: MFlowFacet[]) =>
  writeJson(getVaultMFlowFacetsPath(vaultPath), facets);

export const writeMFlowFacetPoints = async (vaultPath: string, facetPoints: MFlowFacetPoint[]) =>
  writeJson(getVaultMFlowFacetPointsPath(vaultPath), facetPoints);

export const writeMFlowEntities = async (vaultPath: string, entities: MFlowEntity[]) =>
  writeJson(getVaultMFlowEntitiesPath(vaultPath), entities);

export const writeMFlowEdges = async (vaultPath: string, edges: MFlowEdge[]) =>
  writeJson(getVaultMFlowEdgesPath(vaultPath), edges);

export const readMFlowManifest = async (vaultPath: string) =>
  isTauriRuntimeAvailable()
    ? (await loadProjectPersistenceModule()).readProjectJsonFile<MFlowManifest>(getVaultMFlowManifestPath(vaultPath))
    : null;

export const readMFlowState = async (vaultPath: string): Promise<MFlowState | null> => {
  const manifest = await readMFlowManifest(vaultPath);
  if (!manifest) {
    return null;
  }

  const { readProjectJsonFile } = await loadProjectPersistenceModule();
  const [sources, episodes, facets, facetPoints, entities, edges] = await Promise.all([
    readProjectJsonFile<MFlowSource[]>(getVaultMFlowSourcesPath(vaultPath)),
    readProjectJsonFile<MFlowEpisode[]>(getVaultMFlowEpisodesPath(vaultPath)),
    readProjectJsonFile<MFlowFacet[]>(getVaultMFlowFacetsPath(vaultPath)),
    readProjectJsonFile<MFlowFacetPoint[]>(getVaultMFlowFacetPointsPath(vaultPath)),
    readProjectJsonFile<MFlowEntity[]>(getVaultMFlowEntitiesPath(vaultPath)),
    readProjectJsonFile<MFlowEdge[]>(getVaultMFlowEdgesPath(vaultPath)),
  ]);

  return {
    manifest,
    sources: sources || [],
    episodes: episodes || [],
    facets: facets || [],
    facetPoints: facetPoints || [],
    entities: entities || [],
    edges: edges || [],
  };
};

export const writeMFlowState = async (vaultPath: string, state: MFlowState) => {
  await Promise.all([
    writeMFlowManifest(vaultPath, state.manifest),
    writeMFlowSources(vaultPath, state.sources),
    writeMFlowEpisodes(vaultPath, state.episodes),
    writeMFlowFacets(vaultPath, state.facets),
    writeMFlowFacetPoints(vaultPath, state.facetPoints),
    writeMFlowEntities(vaultPath, state.entities),
    writeMFlowEdges(vaultPath, state.edges),
  ]);
};
