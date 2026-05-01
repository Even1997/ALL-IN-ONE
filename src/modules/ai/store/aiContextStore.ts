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

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const useAIContextStore = create<AIContextStoreState>((set) => ({
  projects: {},

  setSceneContext: (projectId, updates) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      const next = {
        ...current,
        ...updates,
      };

      if (
        current.scene === next.scene &&
        current.selectedKnowledgeEntryId === next.selectedKnowledgeEntryId &&
        current.selectedPageId === next.selectedPageId &&
        current.knowledgeMode === next.knowledgeMode &&
        current.selectedReferenceDirectory === next.selectedReferenceDirectory &&
        current.referenceScopeMode === next.referenceScopeMode &&
        arraysEqual(current.openedKnowledgeEntryIds, next.openedKnowledgeEntryIds) &&
        arraysEqual(current.selectedReferenceFileIds, next.selectedReferenceFileIds)
      ) {
        return state;
      }

      return {
        projects: {
          ...state.projects,
          [projectId]: next,
        },
      };
    }),

  setKnowledgeMode: (projectId, mode) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      if (current.knowledgeMode === mode) {
        return state;
      }

      return {
        projects: {
          ...state.projects,
          [projectId]: {
            ...current,
            knowledgeMode: mode,
          },
        },
      };
    }),

  setSelectedReferenceFileIds: (projectId, ids) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      const nextIds = Array.from(new Set(ids.filter(Boolean)));
      if (arraysEqual(current.selectedReferenceFileIds, nextIds)) {
        return state;
      }

      return {
        projects: {
          ...state.projects,
          [projectId]: {
            ...current,
            selectedReferenceFileIds: nextIds,
          },
        },
      };
    }),

  setSelectedReferenceDirectory: (projectId, path) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      if (current.selectedReferenceDirectory === path) {
        return state;
      }

      return {
        projects: {
          ...state.projects,
          [projectId]: {
            ...current,
            selectedReferenceDirectory: path,
          },
        },
      };
    }),

  setReferenceScopeMode: (projectId, mode) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      if (current.referenceScopeMode === mode) {
        return state;
      }

      return {
        projects: {
          ...state.projects,
          [projectId]: {
            ...current,
            referenceScopeMode: mode,
          },
        },
      };
    }),
}));
