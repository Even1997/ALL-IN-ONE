import type { RequirementDoc } from '../../../types';
import { buildKnowledgeProposal } from './buildKnowledgeProposal.ts';

type BuildChangeSyncProposalInput = {
  projectId: string;
  docs: RequirementDoc[];
};

export const buildChangeSyncProposal = ({ projectId, docs }: BuildChangeSyncProposalInput) =>
  buildKnowledgeProposal({
    projectId,
    trigger: 'change-sync',
    summary: `已生成 ${docs.length} 份变更同步提案建议，请确认后再写入知识库。`,
    operations: docs.map((doc) => ({
      type: 'create_note',
      targetTitle: doc.title,
      reason: 'AI 已根据当前产物差异整理出一份待确认的变更同步材料。',
      evidence: [doc.summary || doc.title],
      draftContent: doc.content,
      riskLevel: 'low',
    })),
  });
