import { create } from 'zustand';
import { useProjectStore } from '../../../store/projectStore';
import { joinFileSystemPath } from '../../../utils/fileSystemPaths.ts';
import {
  isTauriRuntimeAvailable,
  listProjectDirectory,
  loadProjectIndexFromDisk,
  readProjectTextFile,
} from '../../../utils/projectPersistence.ts';
import type { KnowledgeNeighborhoodGraph, KnowledgeNote, ProjectKnowledgeSource } from '../model/knowledge';
import { parseKnowledgeReferenceTitles } from '../workspace/knowledgeNoteMarkdown.ts';

type KnowledgeStoreState = {
  notes: KnowledgeNote[];
  searchResults: KnowledgeNote[];
  searchQuery: string;
  similarNotes: KnowledgeNote[];
  similarSourceNoteId: string | null;
  neighborhoodGraph: KnowledgeNeighborhoodGraph | null;
  neighborhoodSourceNoteId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  isSearching: boolean;
  error: string | null;
  loadNotes: (projectId: string) => Promise<void>;
  createProjectNote: (projectId: string, source: ProjectKnowledgeSource) => Promise<KnowledgeNote>;
  deleteProjectNote: (projectId: string, noteId: string) => Promise<void>;
  searchNotes: (projectId: string, query: string) => Promise<void>;
  loadSimilarNotes: (projectId: string, noteId: string | null) => Promise<void>;
  loadNeighborhoodGraph: (projectId: string, noteId: string | null) => Promise<void>;
  syncProjectNotes: (projectId: string, sources: ProjectKnowledgeSource[]) => Promise<KnowledgeNote[]>;
  updateProjectNote: (projectId: string, noteId: string, source: ProjectKnowledgeSource) => Promise<void>;
};

type VaultMarkdownFile = {
  absolutePath: string;
  relativePath: string;
};

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const IGNORED_DIRECTORY_NAMES = new Set(['.ai', '.git', '.goodnight', 'node_modules']);

const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');
const getFileName = (value: string) => normalizePath(value).split('/').pop() || value;
const getTitleFallback = (filePath: string) => getFileName(filePath).replace(MARKDOWN_FILE_PATTERN, '') || 'Untitled';
const summarizeMarkdown = (value: string, fallback: string, maxLength = 120) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const extractTitleFromMarkdown = (filePath: string, markdown: string) => {
  const matched = markdown.replace(/^\uFEFF/, '').match(/^#\s+(.+?)(?:\r?\n|$)/);
  return matched?.[1]?.trim() || getTitleFallback(filePath);
};

const inferNoteKind = (relativePath: string): KnowledgeNote['kind'] => {
  const normalizedPath = normalizePath(relativePath).toLowerCase();
  if (normalizedPath.includes('/design/')) {
    return 'design';
  }

  if (normalizedPath.includes('/sketch/')) {
    return 'sketch';
  }

  return 'note';
};

const buildKnowledgeNoteFromFile = (file: VaultMarkdownFile, markdown: string): KnowledgeNote => {
  const title = extractTitleFromMarkdown(file.relativePath, markdown);

  return {
    id: file.absolutePath,
    title,
    bodyMarkdown: markdown,
    updatedAt: new Date().toISOString(),
    tags: [],
    referenceTitles: parseKnowledgeReferenceTitles(markdown),
    kind: inferNoteKind(file.relativePath),
    sourceUrl: file.absolutePath,
    matchSnippet: summarizeMarkdown(markdown, title),
  };
};

const buildKnowledgeNoteFromSource = (
  source: ProjectKnowledgeSource,
  fallbackId: string,
  nextPath?: string
): KnowledgeNote => {
  const filePath = nextPath || source.filePath || fallbackId;
  const title = source.title.trim() || extractTitleFromMarkdown(filePath, source.content);

  return {
    id: fallbackId,
    title,
    bodyMarkdown: source.content,
    updatedAt: source.updatedAt,
    tags: source.tags.slice(),
    referenceTitles: parseKnowledgeReferenceTitles(source.content),
    kind: inferNoteKind(filePath),
    sourceUrl: filePath || null,
    matchSnippet: summarizeMarkdown(source.content, title),
  };
};

const resolveProjectVaultPath = async (projectId: string) => {
  const projectState = useProjectStore.getState();
  const currentProject = projectState.currentProject;
  if (currentProject?.id === projectId && currentProject.vaultPath) {
    return currentProject.vaultPath;
  }

  const matchedProject = projectState.projects.find((project) => project.id === projectId);
  if (matchedProject?.vaultPath) {
    return matchedProject.vaultPath;
  }

  const persistedProjects = await loadProjectIndexFromDisk();
  return persistedProjects.find((project) => project.id === projectId)?.vaultPath || '';
};

const collectVaultMarkdownFiles = async (
  rootPath: string,
  absolutePath = rootPath,
  relativeBase = ''
): Promise<VaultMarkdownFile[]> => {
  let entries: string[] = [];
  try {
    entries = await listProjectDirectory(absolutePath);
  } catch {
    return [];
  }

  const files: VaultMarkdownFile[] = [];
  for (const rawEntry of entries) {
    const trimmed = rawEntry.trim();
    const isDirectory = trimmed.endsWith('/');
    const entryName = isDirectory ? trimmed.slice(0, -1) : trimmed;
    if (!entryName) {
      continue;
    }

    if (isDirectory && IGNORED_DIRECTORY_NAMES.has(entryName)) {
      continue;
    }

    const relativePath = relativeBase ? `${relativeBase}/${entryName}` : entryName;
    const absoluteEntryPath = joinFileSystemPath(absolutePath, entryName);

    if (isDirectory) {
      files.push(...(await collectVaultMarkdownFiles(rootPath, absoluteEntryPath, relativePath)));
      continue;
    }

    if (!MARKDOWN_FILE_PATTERN.test(entryName)) {
      continue;
    }

    files.push({
      absolutePath: absoluteEntryPath,
      relativePath: normalizePath(relativePath),
    });
  }

  return files;
};

const sortNotes = (notes: KnowledgeNote[]) =>
  [...notes].sort((left, right) => {
    const leftPath = normalizePath(left.sourceUrl || left.id);
    const rightPath = normalizePath(right.sourceUrl || right.id);
    return leftPath.localeCompare(rightPath);
  });

const searchNotesByKeyword = (notes: KnowledgeNote[], keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return [];
  }

  return notes.filter((note) =>
    [note.title, note.bodyMarkdown, note.sourceUrl || '', ...(note.tags || []), ...(note.referenceTitles || [])]
      .join('\n')
      .toLowerCase()
      .includes(normalizedKeyword)
  );
};

const scoreNoteSimilarity = (sourceNote: KnowledgeNote, candidate: KnowledgeNote) => {
  const referenceOverlap = sourceNote.referenceTitles.filter((title) => candidate.referenceTitles.includes(title)).length;
  const tagOverlap = sourceNote.tags.filter((tag) => candidate.tags.includes(tag)).length;
  const kindBonus = sourceNote.kind && sourceNote.kind === candidate.kind ? 1 : 0;
  return referenceOverlap * 2 + tagOverlap + kindBonus;
};

export const useKnowledgeStore = create<KnowledgeStoreState>((set, get) => ({
  notes: [],
  searchResults: [],
  searchQuery: '',
  similarNotes: [],
  similarSourceNoteId: null,
  neighborhoodGraph: null,
  neighborhoodSourceNoteId: null,
  isLoading: false,
  isSyncing: false,
  isSearching: false,
  error: null,
  loadNotes: async (projectId) => {
    set({ isLoading: true, error: null });

    try {
      if (!isTauriRuntimeAvailable()) {
        set({ notes: [], isLoading: false, error: null });
        return;
      }

      const vaultPath = await resolveProjectVaultPath(projectId);
      if (!vaultPath) {
        set({ notes: [], isLoading: false, error: null });
        return;
      }

      const markdownFiles = await collectVaultMarkdownFiles(vaultPath);
      const notes = sortNotes(
        (
          await Promise.all(
            markdownFiles.map(async (file) => {
              const markdown = await readProjectTextFile(file.absolutePath);
              if (typeof markdown !== 'string') {
                return null;
              }

              return buildKnowledgeNoteFromFile(file, markdown);
            })
          )
        ).filter((note): note is KnowledgeNote => Boolean(note))
      );

      set({ notes, isLoading: false, error: null });
    } catch (error) {
      set({
        notes: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load vault notes.',
      });
    }
  },
  createProjectNote: async (_projectId, source) => {
    const fallbackId = source.filePath || `note:${Date.now()}`;
    const note = buildKnowledgeNoteFromSource(source, fallbackId);

    set((state) => {
      const nextNotes = sortNotes([note, ...state.notes.filter((item) => item.id !== note.id)]);
      return {
        notes: nextNotes,
        searchResults: state.searchQuery ? searchNotesByKeyword(nextNotes, state.searchQuery) : state.searchResults,
      };
    });

    return note;
  },
  deleteProjectNote: async (_projectId, noteId) => {
    set((state) => ({
      notes: state.notes.filter((item) => item.id !== noteId),
      searchResults: state.searchResults.filter((item) => item.id !== noteId),
      similarNotes: state.similarNotes.filter((item) => item.id !== noteId),
      neighborhoodGraph: state.neighborhoodGraph?.centerNoteId === noteId ? null : state.neighborhoodGraph,
      neighborhoodSourceNoteId:
        state.neighborhoodSourceNoteId === noteId ? null : state.neighborhoodSourceNoteId,
      similarSourceNoteId: state.similarSourceNoteId === noteId ? null : state.similarSourceNoteId,
    }));
  },
  searchNotes: async (_projectId, query) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      set({ searchResults: [], searchQuery: '', isSearching: false });
      return;
    }

    set({ searchQuery: normalizedQuery, isSearching: true, error: null });
    const notes = get().notes;
    set({
      searchResults: searchNotesByKeyword(notes, normalizedQuery),
      searchQuery: normalizedQuery,
      isSearching: false,
      error: null,
    });
  },
  loadSimilarNotes: async (_projectId, noteId) => {
    if (!noteId) {
      set({ similarNotes: [], similarSourceNoteId: null });
      return;
    }

    const notes = get().notes;
    const sourceNote = notes.find((note) => note.id === noteId) || null;
    if (!sourceNote) {
      set({ similarNotes: [], similarSourceNoteId: noteId });
      return;
    }

    const similarNotes = notes
      .filter((note) => note.id !== noteId)
      .map((note) => ({ note, score: scoreNoteSimilarity(sourceNote, note) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.note.title.localeCompare(right.note.title))
      .slice(0, 8)
      .map((item) => item.note);

    set({ similarNotes, similarSourceNoteId: noteId });
  },
  loadNeighborhoodGraph: async (_projectId, noteId) => {
    set({
      neighborhoodGraph: null,
      neighborhoodSourceNoteId: noteId,
    });
  },
  syncProjectNotes: async (_projectId, sources) => {
    set({ isSyncing: true, error: null });

    try {
      const syncedNotes = sortNotes(
        sources.map((source) => buildKnowledgeNoteFromSource(source, source.filePath || `note:${source.title}`))
      );
      set({ notes: syncedNotes, isSyncing: false, error: null });
      return syncedNotes;
    } catch (error) {
      set({
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Unable to sync vault notes.',
      });
      throw error;
    }
  },
  updateProjectNote: async (_projectId, noteId, source) => {
    const note = buildKnowledgeNoteFromSource(source, noteId, source.filePath || noteId);
    set((state) => {
      const nextNotes = sortNotes(state.notes.map((item) => (item.id === noteId ? note : item)));
      return {
        notes: nextNotes,
        searchResults: state.searchResults.map((item) => (item.id === noteId ? note : item)),
      };
    });
  },
}));
