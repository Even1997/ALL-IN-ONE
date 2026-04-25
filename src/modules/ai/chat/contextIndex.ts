import type { ReferenceFile } from '../../knowledge/referenceFiles.ts';

export type ContextIndex = {
  version: 1;
  updatedAt: string;
  groups: Array<{ id: ReferenceFile['group']; label: string }>;
  files: Array<{
    id: string;
    path: string;
    title: string;
    type: ReferenceFile['type'];
    group: ReferenceFile['group'];
    source: ReferenceFile['source'];
    summary: string;
    tags: string[];
    relatedIds: string[];
    updatedAt: string;
    readableByAI: boolean;
    sizeHint: number;
  }>;
};

export const buildContextIndex = (files: ReferenceFile[]): ContextIndex => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  groups: [
    { id: 'project', label: '项目' },
    { id: 'sketch', label: '草图' },
    { id: 'design', label: '设计' },
  ],
  files: files
    .filter((file) => file.readableByAI)
    .map((file) => ({
      id: file.id,
      path: file.path,
      title: file.title,
      type: file.type,
      group: file.group,
      source: file.source,
      summary: file.summary,
      tags: file.tags,
      relatedIds: file.relatedIds,
      updatedAt: file.updatedAt,
      readableByAI: file.readableByAI,
      sizeHint: file.content.length,
    })),
});
