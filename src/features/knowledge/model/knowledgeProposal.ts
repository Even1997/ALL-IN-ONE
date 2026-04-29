export type KnowledgeProposalTrigger =
  | 'answer-gap'
  | 'wiki-stale'
  | 'duplicate-notes'
  | 'knowledge-organize'
  | 'change-sync';

export type KnowledgeProposalStatus = 'pending' | 'executing' | 'executed' | 'dismissed';

export type KnowledgeProposalOperationType =
  | 'create_note'
  | 'update_note'
  | 'create_wiki'
  | 'update_wiki'
  | 'link_notes'
  | 'merge_candidate'
  | 'archive_candidate'
  | 'mark_stale';

export type KnowledgeProposalOperation = {
  id: string;
  type: KnowledgeProposalOperationType;
  targetId?: string | null;
  targetTitle: string;
  reason: string;
  evidence: string[];
  draftContent: string;
  referenceTitles?: string[];
  riskLevel: 'low' | 'medium' | 'high';
  selected: boolean;
};

export type KnowledgeProposal = {
  id: string;
  projectId: string;
  summary: string;
  trigger: KnowledgeProposalTrigger;
  operations: KnowledgeProposalOperation[];
  createdAt: number;
  status: KnowledgeProposalStatus;
};

export type KnowledgeProposalDraftOperation = Omit<KnowledgeProposalOperation, 'id' | 'selected' | 'riskLevel'> & {
  riskLevel?: KnowledgeProposalOperation['riskLevel'];
};

export type KnowledgeProposalDraft = Omit<KnowledgeProposal, 'id' | 'createdAt' | 'status' | 'operations'> & {
  operations: KnowledgeProposalDraftOperation[];
};
