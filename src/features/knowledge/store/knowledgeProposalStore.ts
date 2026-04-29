import { create } from 'zustand';
import type { KnowledgeProposal } from '../model/knowledgeProposal';

type KnowledgeProposalStoreState = {
  proposalsByProject: Record<string, KnowledgeProposal[]>;
  upsertProposal: (proposal: KnowledgeProposal) => void;
  dismissProposal: (projectId: string, proposalId: string) => void;
  setOperationSelected: (projectId: string, proposalId: string, operationId: string, selected: boolean) => void;
  setProposalStatus: (projectId: string, proposalId: string, status: KnowledgeProposal['status']) => void;
};

const sortProposals = (proposals: KnowledgeProposal[]) => [...proposals].sort((left, right) => right.createdAt - left.createdAt);

export const useKnowledgeProposalStore = create<KnowledgeProposalStoreState>((set) => ({
  proposalsByProject: {},
  upsertProposal: (proposal) =>
    set((state) => ({
      proposalsByProject: {
        ...state.proposalsByProject,
        [proposal.projectId]: sortProposals([
          proposal,
          ...(state.proposalsByProject[proposal.projectId] || []).filter((item) => item.id !== proposal.id),
        ]),
      },
    })),
  dismissProposal: (projectId, proposalId) =>
    set((state) => ({
      proposalsByProject: {
        ...state.proposalsByProject,
        [projectId]: (state.proposalsByProject[projectId] || []).map((proposal) =>
          proposal.id === proposalId ? { ...proposal, status: 'dismissed' } : proposal
        ),
      },
    })),
  setOperationSelected: (projectId, proposalId, operationId, selected) =>
    set((state) => ({
      proposalsByProject: {
        ...state.proposalsByProject,
        [projectId]: (state.proposalsByProject[projectId] || []).map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                operations: proposal.operations.map((operation) =>
                  operation.id === operationId ? { ...operation, selected } : operation
                ),
              }
            : proposal
        ),
      },
    })),
  setProposalStatus: (projectId, proposalId, status) =>
    set((state) => ({
      proposalsByProject: {
        ...state.proposalsByProject,
        [projectId]: (state.proposalsByProject[projectId] || []).map((proposal) =>
          proposal.id === proposalId ? { ...proposal, status } : proposal
        ),
      },
    })),
}));
