import type { KnowledgeProposal, KnowledgeProposalOperation } from '../../../features/knowledge/model/knowledgeProposal';
import { upsertKnowledgeReferenceSection } from '../../../features/knowledge/workspace/knowledgeNoteMarkdown.ts';

type KnowledgeProposalExecutor = {
  createNote: (input: { title: string; content: string; tags: string[] }) => Promise<void>;
  updateNote: (input: { noteId: string; title: string; content?: string; tags: string[] }) => Promise<void>;
};

const EXECUTABLE_OPERATION_TYPES = new Set([
  'create_note',
  'update_note',
  'create_wiki',
  'update_wiki',
  'merge_candidate',
  'archive_candidate',
  'mark_stale',
]);

export const isExecutableKnowledgeProposalOperation = (operation: { type: string }) =>
  EXECUTABLE_OPERATION_TYPES.has(operation.type);

const buildOperationTags = (operation: KnowledgeProposalOperation) => {
  if (operation.type === 'create_wiki' || operation.type === 'update_wiki') {
    return ['kind/wiki'];
  }

  if (operation.type === 'archive_candidate') {
    return ['status/archived'];
  }

  if (operation.type === 'merge_candidate') {
    return ['candidate/merge'];
  }

  if (operation.type === 'mark_stale') {
    return ['status/stale'];
  }

  return ['kind/note'];
};

const buildOperationContent = (operation: KnowledgeProposalOperation) =>
  operation.type === 'create_wiki' || operation.type === 'update_wiki'
    ? upsertKnowledgeReferenceSection(operation.draftContent, operation.referenceTitles || [])
    : operation.draftContent;

export const executeKnowledgeProposal = async (
  proposal: KnowledgeProposal,
  executor: KnowledgeProposalExecutor
) => {
  for (const operation of proposal.operations) {
    if (!operation.selected || !isExecutableKnowledgeProposalOperation(operation)) {
      continue;
    }

    const tags = buildOperationTags(operation);
    if (operation.type === 'create_note' || operation.type === 'create_wiki') {
      await executor.createNote({
        title: operation.targetTitle,
        content: buildOperationContent(operation),
        tags,
      });
      continue;
    }

    if (!operation.targetId) {
      continue;
    }

    await executor.updateNote({
      noteId: operation.targetId,
      title: operation.targetTitle,
      content: operation.draftContent.trim() ? buildOperationContent(operation) : undefined,
      tags,
    });
  }
};
