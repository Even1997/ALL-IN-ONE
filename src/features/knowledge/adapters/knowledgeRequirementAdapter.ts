// 文件作用：适配器，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { RequirementDoc } from '../../../types';
import type { KnowledgeNote } from '../model/knowledge';

const summarizeKnowledgeBody = (value: string) =>
  value.replace(/\s+/g, ' ').trim().slice(0, 96);

const mapKnowledgeKindToRequirementKind = (
  kind: KnowledgeNote['kind']
): RequirementDoc['kind'] => {
  if (kind === 'sketch') {
    return 'sketch';
  }

  if (kind === 'design') {
    return 'spec';
  }

  return 'note';
};

export const projectKnowledgeNoteToRequirementDoc = (
  note: KnowledgeNote
): RequirementDoc => ({
  id: note.id,
  title: note.title,
  content: note.bodyMarkdown,
  summary: summarizeKnowledgeBody(note.bodyMarkdown),
  filePath: note.sourceUrl || undefined,
  kind: mapKnowledgeKindToRequirementKind(note.kind),
  docType: note.docType,
  tags: note.tags,
  relatedIds: [],
  authorRole: '产品',
  sourceType: 'manual',
  updatedAt: note.updatedAt,
  status: 'ready',
});

export const projectKnowledgeNotesToRequirementDocs = (
  notes: KnowledgeNote[]
) => notes.map(projectKnowledgeNoteToRequirementDoc);
