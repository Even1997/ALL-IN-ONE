import type {
  KnowledgeProposal,
  KnowledgeProposalDraft,
  KnowledgeProposalDraftOperation,
} from '../../../features/knowledge/model/knowledgeProposal';

const createProposalId = () => `knowledge_proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createOperationId = () => `proposal_operation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const materializeOperation = (operation: KnowledgeProposalDraftOperation) => ({
  id: createOperationId(),
  selected: true,
  riskLevel: operation.riskLevel || 'low',
  ...operation,
});

export const buildKnowledgeProposal = (draft: KnowledgeProposalDraft): KnowledgeProposal => ({
  id: createProposalId(),
  projectId: draft.projectId,
  sourceArtifactId: draft.sourceArtifactId ?? null,
  summary: draft.summary,
  trigger: draft.trigger,
  operations: draft.operations.map(materializeOperation),
  createdAt: Date.now(),
  status: 'pending',
});
