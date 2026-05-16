import { create } from 'zustand';
import type { ReferenceFile } from '../../../modules/knowledge/referenceFiles.ts';

type ProjectDocumentReferenceState = {
  files: ReferenceFile[];
};

type DocumentProjectionStoreState = {
  projects: Record<string, ProjectDocumentReferenceState>;
  upsertReferenceFile: (projectId: string, file: ReferenceFile) => void;
  upsertReferenceFiles: (projectId: string, files: ReferenceFile[]) => void;
};

const createProjectState = (): ProjectDocumentReferenceState => ({
  files: [],
});

export const useDocumentProjectionStore = create<DocumentProjectionStoreState>((set) => ({
  projects: {},
  upsertReferenceFile: (projectId, file) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      return {
        projects: {
          ...state.projects,
          [projectId]: {
            files: [file, ...current.files.filter((entry) => entry.id !== file.id)].slice(0, 200),
          },
        },
      };
    }),
  upsertReferenceFiles: (projectId, files) =>
    set((state) => {
      const current = state.projects[projectId] || createProjectState();
      const merged = [...files, ...current.files].reduce<ReferenceFile[]>((accumulator, file) => {
        if (accumulator.some((entry) => entry.id === file.id)) {
          return accumulator;
        }
        accumulator.push(file);
        return accumulator;
      }, []);

      return {
        projects: {
          ...state.projects,
          [projectId]: {
            files: merged.slice(0, 200),
          },
        },
      };
    }),
}));
