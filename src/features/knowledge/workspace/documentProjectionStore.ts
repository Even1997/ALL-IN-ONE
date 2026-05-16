// 文件作用：状态仓库，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
