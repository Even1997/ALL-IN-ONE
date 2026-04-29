import { invoke } from '@tauri-apps/api/core';
import type {
  GoodnightAtomsResponse,
  GoodnightAtomWithTags,
  GoodnightDatabaseInfo,
  GoodnightDatabasesResponse,
  GoodnightNeighborhoodGraph,
  GoodnightSimilarAtomResult,
  GoodnightSearchResult,
  KnowledgeNeighborhoodGraph,
  KnowledgeNote,
  LocalKnowledgeServerConfig,
  ProjectKnowledgeSource,
} from '../model/knowledge';
import { buildAtomWritePayload, normalizeKnowledgeTagNames } from './knowledgeAtomPayload';
import { inferKnowledgeDocType } from '../model/knowledgeDocType';
import { mergeKnowledgeSystemTags } from '../model/knowledgeTagMeta';
import { resolveBrowserPreviewKnowledgeServerConfig } from './knowledgeBrowserPreviewConfig';
import { parseKnowledgeReferenceTitles } from '../workspace/knowledgeNoteMarkdown';

let localKnowledgeServerConfigPromise: Promise<LocalKnowledgeServerConfig> | null = null;
const projectDatabaseIdPromises = new Map<string, Promise<string>>();
const PROJECT_DATABASE_NAME_PREFIX = 'goodnight-project:';
const KNOWLEDGE_LIST_LIMIT = 1000;

const getFallbackTitleFromPath = (value?: string | null) => {
  const normalized = value?.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }

  const matched = normalized.split('/').pop();
  return matched?.trim() || normalized;
};

const getFallbackTitleFromContent = (value: string) => {
  const heading = value
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));

  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.split(' ').slice(0, 6).join(' ').trim();
};

const resolveKnowledgeNoteTitle = (
  title: string | undefined,
  content: string,
  sourceUrl?: string | null,
  fallbackTitle?: string
) =>
  title?.trim() ||
  fallbackTitle?.trim() ||
  getFallbackTitleFromPath(sourceUrl) ||
  getFallbackTitleFromContent(content) ||
  '未命名笔记';

const resolveKnowledgeNoteKind = (
  sourceUrl: string | null | undefined,
  tags: string[]
): KnowledgeNote['kind'] => {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const normalizedPath = sourceUrl?.replace(/\\/g, '/').toLowerCase() || '';

  if (normalizedTags.includes('sketch') || normalizedPath.includes('/sketch/')) {
    return 'sketch';
  }

  if (normalizedTags.includes('design') || normalizedPath.includes('/design/')) {
    return 'design';
  }

  return 'note';
};

const resolveKnowledgeClassification = (title: string, rawTags: string[]) => {
  const docType = inferKnowledgeDocType(title);
  const tags = mergeKnowledgeSystemTags(rawTags, docType);

  return { docType, tags };
};

const mapAtomSummaryToKnowledgeNote = (atom: GoodnightAtomsResponse['atoms'][number]): KnowledgeNote => {
  const bodyMarkdown = atom.snippet;
  const sourceUrl = atom.source_url ?? null;
  const title = resolveKnowledgeNoteTitle(atom.title, bodyMarkdown, sourceUrl);
  const { docType, tags } = resolveKnowledgeClassification(
    title,
    atom.tags.map((tag) => tag.name)
  );

  return {
    id: atom.id,
    title,
    bodyMarkdown,
    updatedAt: atom.updated_at,
    docType,
    tags,
    referenceTitles: parseKnowledgeReferenceTitles(bodyMarkdown),
    kind: resolveKnowledgeNoteKind(sourceUrl, tags),
    sourceUrl,
  };
};

const mapAtomWithTagsToKnowledgeNote = (
  atom: GoodnightAtomWithTags,
  fallbackTitle?: string
): KnowledgeNote => {
  const bodyMarkdown = atom.content;
  const sourceUrl = atom.source_url ?? null;
  const title = resolveKnowledgeNoteTitle(atom.title, bodyMarkdown, sourceUrl, fallbackTitle);
  const { docType, tags } = resolveKnowledgeClassification(
    title,
    atom.tags.map((tag) => tag.name)
  );

  return {
    id: atom.id,
    title,
    bodyMarkdown,
    updatedAt: atom.updated_at,
    docType,
    tags,
    referenceTitles: parseKnowledgeReferenceTitles(bodyMarkdown),
    kind: resolveKnowledgeNoteKind(sourceUrl, tags),
    sourceUrl,
  };
};

const mapSearchResultToKnowledgeNote = (result: GoodnightSearchResult): KnowledgeNote => {
  const bodyMarkdown = result.matching_chunk_content || result.snippet;
  const sourceUrl = result.source_url ?? null;
  const title = resolveKnowledgeNoteTitle(result.title, bodyMarkdown, sourceUrl);
  const { docType, tags } = resolveKnowledgeClassification(
    title,
    result.tags.map((tag) => tag.name)
  );

  return {
    id: result.id,
    title,
    bodyMarkdown,
    updatedAt: result.updated_at,
    docType,
    tags,
    referenceTitles: parseKnowledgeReferenceTitles(bodyMarkdown),
    kind: resolveKnowledgeNoteKind(sourceUrl, tags),
    sourceUrl,
    matchSnippet: result.match_snippet ?? null,
  };
};

const mapSimilarResultToKnowledgeNote = (result: GoodnightSimilarAtomResult): KnowledgeNote => {
  const bodyMarkdown = result.matching_chunk_content || result.snippet;
  const sourceUrl = result.source_url ?? null;
  const title = resolveKnowledgeNoteTitle(result.title, bodyMarkdown, sourceUrl);
  const { docType, tags } = resolveKnowledgeClassification(
    title,
    result.tags.map((tag) => tag.name)
  );

  return {
    id: result.id,
    title,
    bodyMarkdown,
    updatedAt: result.updated_at,
    docType,
    tags,
    referenceTitles: parseKnowledgeReferenceTitles(bodyMarkdown),
    kind: resolveKnowledgeNoteKind(sourceUrl, tags),
    sourceUrl,
  };
};

const mapNeighborhoodGraph = (graph: GoodnightNeighborhoodGraph): KnowledgeNeighborhoodGraph => ({
  centerNoteId: graph.center_atom_id,
  nodes: graph.atoms.map((atom) => {
    const bodyMarkdown = atom.snippet;
    const sourceUrl = atom.source_url ?? null;
    const title = resolveKnowledgeNoteTitle(atom.title, bodyMarkdown, sourceUrl);
    const { docType, tags } = resolveKnowledgeClassification(
      title,
      atom.tags.map((tag) => tag.name)
    );

    return {
      id: atom.id,
      title,
      bodyMarkdown,
      updatedAt: atom.updated_at,
      docType,
      tags,
      referenceTitles: parseKnowledgeReferenceTitles(bodyMarkdown),
      kind: resolveKnowledgeNoteKind(sourceUrl, tags),
      sourceUrl,
      depth: atom.depth,
    };
  }),
  edges: graph.edges.map((edge) => ({
    sourceId: edge.source_id,
    targetId: edge.target_id,
    edgeType: edge.edge_type,
    strength: edge.strength,
    sharedTagCount: edge.shared_tag_count,
    similarityScore: edge.similarity_score ?? null,
  })),
});

const buildKnowledgeRequestHeaders = (
  config: LocalKnowledgeServerConfig,
  databaseId?: string,
  extraHeaders?: Record<string, string>
) => ({
  Authorization: `Bearer ${config.authToken}`,
  ...(databaseId ? { 'X-Goodnight-Database': databaseId } : {}),
  ...extraHeaders,
});

const requestKnowledge = async (
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  databaseId?: string
) => {
  const config = await getLocalKnowledgeServerConfig();
  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: buildKnowledgeRequestHeaders(config, databaseId, init.headers),
  });
};

const requestKnowledgeJson = async <T>(
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  databaseId?: string
) => {
  const response = await requestKnowledge(path, init, databaseId);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Knowledge sidecar request failed: ${response.status}${details ? ` ${details}` : ''}`);
  }

  return response.json() as Promise<T>;
};

const getProjectDatabaseName = (projectId: string) => `${PROJECT_DATABASE_NAME_PREFIX}${projectId}`;

const listDatabases = async () =>
  requestKnowledgeJson<GoodnightDatabasesResponse>('/api/databases');

const createDatabase = async (name: string) =>
  requestKnowledgeJson<GoodnightDatabaseInfo>(
    '/api/databases',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }
  );

const listTags = async (databaseId: string) =>
  requestKnowledgeJson<Array<{ id: string; name: string }>>(
    '/api/tags',
    {},
    databaseId
  );

const createTag = async (databaseId: string, name: string) =>
  requestKnowledgeJson<{ id: string; name: string }>(
    '/api/tags',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    },
    databaseId
  );

const ensureTagIds = async (databaseId: string, tagNames: string[]) => {
  const normalizedNames = normalizeKnowledgeTagNames(tagNames);
  if (normalizedNames.length === 0) {
    return [];
  }

  const existingTags = await listTags(databaseId);
  const tagsByName = new Map(existingTags.map((tag) => [tag.name, tag.id]));
  const resolvedTagIds: string[] = [];

  for (const name of normalizedNames) {
    const existingTagId = tagsByName.get(name);
    if (existingTagId) {
      resolvedTagIds.push(existingTagId);
      continue;
    }

    const createdTag = await createTag(databaseId, name);
    tagsByName.set(createdTag.name, createdTag.id);
    resolvedTagIds.push(createdTag.id);
  }

  return resolvedTagIds;
};

const ensureProjectKnowledgeDatabase = async (projectId: string) => {
  const databaseName = getProjectDatabaseName(projectId);
  const existing = await listDatabases();
  const matchedDatabase = existing.databases.find((database) => database.name === databaseName);
  if (matchedDatabase) {
    return matchedDatabase.id;
  }

  const createdDatabase = await createDatabase(databaseName);
  return createdDatabase.id;
};

const getProjectKnowledgeDatabaseId = async (projectId: string) => {
  const existingPromise = projectDatabaseIdPromises.get(projectId);
  if (existingPromise) {
    return existingPromise;
  }

  const nextPromise = ensureProjectKnowledgeDatabase(projectId).catch((error) => {
    projectDatabaseIdPromises.delete(projectId);
    throw error;
  });
  projectDatabaseIdPromises.set(projectId, nextPromise);
  return nextPromise;
};

const updateAtomContent = async (databaseId: string, atomId: string, source: ProjectKnowledgeSource) => {
  const tagIds = await ensureTagIds(databaseId, source.tags);
  await requestKnowledgeJson<GoodnightAtomWithTags>(
    `/api/atoms/${encodeURIComponent(atomId)}/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAtomWritePayload(source, tagIds)),
    },
    databaseId
  );
};

const createAtom = async (databaseId: string, source: ProjectKnowledgeSource) => {
  const tagIds = await ensureTagIds(databaseId, source.tags);
  await requestKnowledgeJson<GoodnightAtomWithTags>(
    '/api/atoms',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...buildAtomWritePayload(source, tagIds),
        skip_if_source_exists: true,
      }),
    },
    databaseId
  );
};

const deleteAtom = async (databaseId: string, atomId: string) => {
  await requestKnowledgeJson<{ deleted: boolean }>(
    `/api/atoms/${encodeURIComponent(atomId)}`,
    {
      method: 'DELETE',
    },
    databaseId
  );
};

const normalizeProjectSources = (sources: ProjectKnowledgeSource[]) => {
  const uniqueSources = new Map<string, ProjectKnowledgeSource>();

  for (const source of sources) {
    const filePath = source.filePath.trim();
    if (!filePath) {
      continue;
    }

    uniqueSources.set(filePath, {
      ...source,
      filePath,
    });
  }

  return [...uniqueSources.values()];
};

export const getLocalKnowledgeServerConfig = async () => {
  const browserPreviewConfig =
    typeof window !== 'undefined' ? resolveBrowserPreviewKnowledgeServerConfig(window.location.href) : null;
  if (browserPreviewConfig) {
    return browserPreviewConfig;
  }

  if (!localKnowledgeServerConfigPromise) {
    localKnowledgeServerConfigPromise = invoke<LocalKnowledgeServerConfig>('get_local_knowledge_server_config');
  }

  return localKnowledgeServerConfigPromise;
};

export const listKnowledgeNotes = async (projectId: string) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const data = await requestKnowledgeJson<GoodnightAtomsResponse>(
    `/api/atoms?limit=${KNOWLEDGE_LIST_LIMIT}&sort_by=updated&sort_order=desc`,
    {},
    databaseId
  );

  return data.atoms.map(mapAtomSummaryToKnowledgeNote);
};

export const getKnowledgeNote = async (projectId: string, noteId: string) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const atom = await requestKnowledgeJson<GoodnightAtomWithTags>(
    `/api/atoms/${encodeURIComponent(noteId)}`,
    {},
    databaseId
  );

  return mapAtomWithTagsToKnowledgeNote(atom);
};

export const createProjectKnowledgeNote = async (
  projectId: string,
  source: ProjectKnowledgeSource
) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const tagIds = await ensureTagIds(databaseId, source.tags);
  const atom = await requestKnowledgeJson<GoodnightAtomWithTags>(
    '/api/atoms',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...buildAtomWritePayload(source, tagIds),
        skip_if_source_exists: false,
      }),
    },
    databaseId
  );

  return mapAtomWithTagsToKnowledgeNote(atom, source.title);
};

export const updateProjectKnowledgeNote = async (
  projectId: string,
  noteId: string,
  source: ProjectKnowledgeSource
) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  await updateAtomContent(databaseId, noteId, source);
  const note = await getKnowledgeNote(projectId, noteId);
  return note.title.trim()
    ? note
    : {
        ...note,
        title: resolveKnowledgeNoteTitle(note.title, note.bodyMarkdown, note.sourceUrl, source.title),
      };
};

export const deleteProjectKnowledgeNote = async (
  projectId: string,
  noteId: string
) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  await deleteAtom(databaseId, noteId);
};

export const searchKnowledgeNotes = async (projectId: string, query: string) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const searchBody = (mode: 'hybrid' | 'keyword') => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: normalizedQuery,
      mode,
      limit: 50,
      threshold: 0.3,
    }),
  });

  try {
    const results = await requestKnowledgeJson<GoodnightSearchResult[]>(
      '/api/search',
      searchBody('hybrid'),
      databaseId
    );
    return results.map(mapSearchResultToKnowledgeNote);
  } catch {
    const results = await requestKnowledgeJson<GoodnightSearchResult[]>(
      '/api/search',
      searchBody('keyword'),
      databaseId
    );
    return results.map(mapSearchResultToKnowledgeNote);
  }
};

export const listSimilarKnowledgeNotes = async (projectId: string, noteId: string) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const results = await requestKnowledgeJson<GoodnightSimilarAtomResult[]>(
    `/api/atoms/${encodeURIComponent(noteId)}/similar?limit=8&threshold=0.45`,
    {},
    databaseId
  );

  return results.map(mapSimilarResultToKnowledgeNote);
};

export const getKnowledgeNeighborhood = async (projectId: string, noteId: string) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const graph = await requestKnowledgeJson<GoodnightNeighborhoodGraph>(
    `/api/graph/neighborhood/${encodeURIComponent(noteId)}?depth=1&min_similarity=0.45`,
    {},
    databaseId
  );

  return mapNeighborhoodGraph(graph);
};

export const syncProjectKnowledgeNotes = async (projectId: string, sources: ProjectKnowledgeSource[]) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const normalizedSources = normalizeProjectSources(sources);
  const existingNotes = await listKnowledgeNotes(projectId);
  const existingBySourceUrl = new Map(
    existingNotes
      .filter((note) => Boolean(note.sourceUrl))
      .map((note) => [note.sourceUrl as string, note])
  );
  const nextSourcePaths = new Set(normalizedSources.map((source) => source.filePath));

  for (const source of normalizedSources) {
    const existingNote = existingBySourceUrl.get(source.filePath);
    if (existingNote) {
      const currentNote = await getKnowledgeNote(projectId, existingNote.id);
      if (currentNote.bodyMarkdown !== source.content) {
        await updateAtomContent(databaseId, existingNote.id, source);
      }
      continue;
    }

    await createAtom(databaseId, source);
  }

  for (const note of existingNotes) {
    if (!note.sourceUrl || nextSourcePaths.has(note.sourceUrl)) {
      continue;
    }

    await deleteAtom(databaseId, note.id);
  }

  return listKnowledgeNotes(projectId);
};
