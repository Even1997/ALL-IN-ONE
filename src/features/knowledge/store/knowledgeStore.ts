import { create } from 'zustand';
import {
  createProjectKnowledgeNote,
  deleteProjectKnowledgeNote,
  getKnowledgeNeighborhood,
  listKnowledgeNotes,
  listSimilarKnowledgeNotes,
  searchKnowledgeNotes,
  syncProjectKnowledgeNotes,
  updateProjectKnowledgeNote,
} from '../api/knowledgeClient';
import type { KnowledgeNeighborhoodGraph, KnowledgeNote, ProjectKnowledgeSource } from '../model/knowledge';

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
  syncProjectNotes: (projectId: string, sources: ProjectKnowledgeSource[]) => Promise<void>;
  updateProjectNote: (projectId: string, noteId: string, source: ProjectKnowledgeSource) => Promise<void>;
};

export const useKnowledgeStore = create<KnowledgeStoreState>((set) => ({
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
      const notes = await listKnowledgeNotes(projectId);
      set({ notes, isLoading: false, error: null });
    } catch (error) {
      set({
        notes: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Knowledge sidecar failed to load.',
      });
    }
  },
  createProjectNote: async (projectId, source) => {
    const note = await createProjectKnowledgeNote(projectId, source);
    set((state) => ({
      notes: [note, ...state.notes],
      searchResults: state.searchQuery ? state.searchResults : state.searchResults,
    }));
    return note;
  },
  deleteProjectNote: async (projectId, noteId) => {
    await deleteProjectKnowledgeNote(projectId, noteId);
    set((state) => ({
      notes: state.notes.filter((item) => item.id !== noteId),
      searchResults: state.searchResults.filter((item) => item.id !== noteId),
      similarNotes: state.similarNotes.filter((item) => item.id !== noteId),
      neighborhoodGraph:
        state.neighborhoodGraph?.centerNoteId === noteId ? null : state.neighborhoodGraph,
      neighborhoodSourceNoteId:
        state.neighborhoodSourceNoteId === noteId ? null : state.neighborhoodSourceNoteId,
      similarSourceNoteId:
        state.similarSourceNoteId === noteId ? null : state.similarSourceNoteId,
    }));
  },
  searchNotes: async (projectId, query) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      set({ searchResults: [], searchQuery: '', isSearching: false });
      return;
    }

    set({ searchQuery: normalizedQuery, isSearching: true, error: null });

    try {
      const searchResults = await searchKnowledgeNotes(projectId, normalizedQuery);
      set({ searchResults, searchQuery: normalizedQuery, isSearching: false, error: null });
    } catch (error) {
      set({
        searchResults: [],
        searchQuery: '',
        isSearching: false,
        error: error instanceof Error ? error.message : 'Knowledge sidecar search failed.',
      });
    }
  },
  loadSimilarNotes: async (projectId, noteId) => {
    if (!noteId) {
      set({ similarNotes: [], similarSourceNoteId: null });
      return;
    }

    set({ similarSourceNoteId: noteId });

    try {
      const similarNotes = await listSimilarKnowledgeNotes(projectId, noteId);
      set({ similarNotes, similarSourceNoteId: noteId });
    } catch {
      set({ similarNotes: [], similarSourceNoteId: noteId });
    }
  },
  loadNeighborhoodGraph: async (projectId, noteId) => {
    if (!noteId) {
      set({ neighborhoodGraph: null, neighborhoodSourceNoteId: null });
      return;
    }

    set({ neighborhoodSourceNoteId: noteId });

    try {
      const neighborhoodGraph = await getKnowledgeNeighborhood(projectId, noteId);
      set({ neighborhoodGraph, neighborhoodSourceNoteId: noteId });
    } catch {
      set({ neighborhoodGraph: null, neighborhoodSourceNoteId: noteId });
    }
  },
  syncProjectNotes: async (projectId, sources) => {
    set({ isSyncing: true, error: null });

    try {
      const notes = await syncProjectKnowledgeNotes(projectId, sources);
      set({ notes, isSyncing: false, error: null });
    } catch (error) {
      set({
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Knowledge sidecar failed to sync.',
      });
      throw error;
    }
  },
  updateProjectNote: async (projectId, noteId, source) => {
    const note = await updateProjectKnowledgeNote(projectId, noteId, source);
    set((state) => ({
      notes: state.notes.map((item) => (item.id === note.id ? note : item)),
      searchResults: state.searchResults.map((item) => (item.id === note.id ? note : item)),
    }));
  },
}));
