export type KnowledgeProposalSignalState = {
  hasGap: boolean;
  hasStaleWiki: boolean;
  hasDuplicates: boolean;
  canDistill: boolean;
};

export const shouldSuggestKnowledgeProposal = (signals: KnowledgeProposalSignalState) =>
  signals.hasGap || signals.hasStaleWiki || signals.hasDuplicates || signals.canDistill;
