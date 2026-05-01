import type { RequirementDoc } from '../../../types';
import { buildKnowledgeProposal } from './buildKnowledgeProposal.ts';

type BuildChangeSyncProposalInput = {
  projectId: string;
  docs: RequirementDoc[];
  summaryText?: string;
  reasonText?: string;
};

const DEFAULT_SUMMARY_TEXT = (count: number) =>
  `AI 已基于最新确认知识整理出 ${count} 份待确认同步内容，请确认后再写入正式知识。`;

const DEFAULT_REASON_TEXT = 'AI 已根据当前产品差异整理出一份待确认的变更同步材料。';

export const buildChangeSyncProposal = ({
  projectId,
  docs,
  summaryText,
  reasonText,
}: BuildChangeSyncProposalInput) =>
  buildKnowledgeProposal({
    projectId,
    trigger: 'change-sync',
    summary: summaryText || DEFAULT_SUMMARY_TEXT(docs.length),
    operations: docs.map((doc) => ({
      type: 'create_note',
      targetTitle: doc.title,
      reason: reasonText || DEFAULT_REASON_TEXT,
      evidence: [doc.summary || doc.title],
      draftContent: doc.content,
      riskLevel: 'low',
    })),
  });
