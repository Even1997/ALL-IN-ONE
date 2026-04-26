import type { AIReferenceScopeMode } from '../chat/chatContext.ts';
import { create } from 'zustand';

export type AIContextScene = 'knowledge' | 'page';
export type AIKnowledgeMode = 'off' | 'all';

type AIContextProjectState = {
  scene: AIContextScene;
  selectedKnowledgeEntryId: string | null;
  selectedPageId: string | null;
  openedKnowledgeEntryIds: string[];
  knowledgeMode: AIKnowledgeMode;
  selectedReferenceFileIds: string[];
  selectedReferenceDirectory: string | null;
  referenceScopeMode: AIReferenceScopeMode;
};

type AIContextStoreState = {
  projects: Record<string, AIContextProjectState>;
  setSceneContext: (
    projectId: string,
    updates: Partial<AIContextProjectState> & Pick<AIContextProjectState, 'scene'>
  ) => void;
  setKnowledgeMode: (projectId: string, mode: AIKnowledgeMode) => void;
  setSelectedReferenceFileIds: (projectId: string, ids: string[]) => void;
  setSelectedReferenceDirectory: (projectId: string, path: string | null) => void;
  setReferenceScopeMode: (projectId: string, mode: AIReferenceScopeMode) => void;
};

const createProjectState = (): AIContextProjectState => ({
  scene: 'knowledge',
  selectedKnowledgeEntryId: null,
  selectedPageId: null,
  openedKnowledgeEntryIds: [],
  knowledgeMode: 'off',
  selectedReferenceFileIds: [],
  selectedReferenceDirectory: null,
  referenceScopeMode: 'current',
});

export const useAIContextStore = create<AIContextStoreState>((set) => ({
  projects: {},

  setSceneContext: (projectId, updates) =>
    set((state) => ({
      projects: {
        ...state.projects,
        [projectId]: {
          ...(state.projects[projectId] || createProjectState()),
          ...updates,
        },
      },
    })),

  setKnowledgeMode: (projectId, mode) =>
    set((state) => ({
      projects: {
        ...state.projects,
        [projectId]: {
          ...(state.projects[projectId] || createProjectState()),
          knowledgeMode: mode,
        },
      },
    })),

  setSelectedReferenceFileIds: (projectId, ids) =>
    set((state) => ({
      projects: {
        ...state.projects,
        [projectId]: {
          ...(state.projects[projectId] || createProjectState()),
          selectedReferenceFileIds: Array.from(new Set(ids.filter(Boolean))),
        },
      },
    })),

  setSelectedReferenceDirectory: (projectId, path) =>
    set((state) => ({
      projects: {
        ...state.projects,
        [projectId]: {
          ...(state.projects[projectId] || createProjectState()),
          selectedReferenceDirectory: path,
        },
      },
    })),

  setReferenceScopeMode: (projectId, mode) =>
    set((state) => ({
      projects: {
        ...state.projects,
        [projectId]: {
          ...(state.projects[projectId] || createProjectState()),
          referenceScopeMode: mode,
        },
      },
    })),
}));
