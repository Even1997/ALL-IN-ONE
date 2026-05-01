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
    summary: `AI 已基于最新确认知识整理出 ${docs.length} 份待确认同步内容，请确认后再写入正式知识。`,
    operations: docs.map((doc) => ({
      type: 'create_note',
      targetTitle: doc.title,
      reason: 'AI 已根据当前产品差异整理出一份待确认的变更同步材料。',
      evidence: [doc.summary || doc.title],
      draftContent: doc.content,
      riskLevel: 'low',
    })),
  });
