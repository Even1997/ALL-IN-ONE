export const KNOWLEDGE_FILESYSTEM_CHANGED_EVENT = 'goodnight:knowledge-filesystem-changed';

export type KnowledgeFilesystemChangedDetail = {
  projectId: string;
  changedPaths: string[];
};

export const emitKnowledgeFilesystemChanged = (detail: KnowledgeFilesystemChangedDetail) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<KnowledgeFilesystemChangedDetail>(KNOWLEDGE_FILESYSTEM_CHANGED_EVENT, {
      detail,
    })
  );
};
