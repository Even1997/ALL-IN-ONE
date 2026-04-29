import { buildKnowledgeProposal } from './buildKnowledgeProposal.ts';
import type { RequirementDoc } from '../../../types';

type ExistingKnowledgeWikiTarget = {
  id: string;
  title: string;
  manualEdited?: boolean;
};

type BuildKnowledgeOrganizeProposalInput = {
  projectId: string;
  sourceTitles: string[];
  docs: RequirementDoc[];
  existingWikiTargetsByTitle?: Record<string, ExistingKnowledgeWikiTarget>;
};

const normalizeReferenceTitles = (titles: string[]) =>
  Array.from(
    new Set(
      titles
        .map((title) => title.trim())
        .filter(Boolean)
    )
  );

export const buildKnowledgeOrganizeProposal = ({
  projectId,
  sourceTitles,
  docs,
  existingWikiTargetsByTitle = {},
}: BuildKnowledgeOrganizeProposalInput) =>
  buildKnowledgeProposal({
    projectId,
    trigger: 'knowledge-organize',
    summary: `已生成 ${docs.length} 份 Wiki 更新建议，请确认后再写入知识库。`,
    operations: docs.map((doc) => {
      const existingWikiTarget = existingWikiTargetsByTitle[doc.title];

      return {
        type: existingWikiTarget ? 'update_wiki' : 'create_wiki',
        targetId: existingWikiTarget?.id,
        targetTitle: existingWikiTarget?.title || doc.title,
        reason: existingWikiTarget
          ? existingWikiTarget.manualEdited
            ? '检测到该 Wiki 在上次整理后被手动修改，本次先生成合并建议，请确认后再覆盖。'
            : 'AI 已根据最新来源内容整理出该 Wiki 的更新建议。'
          : 'AI 已根据当前知识和产物整理出一份候选 Wiki。',
        evidence: [doc.summary || doc.title],
        draftContent: doc.content,
        referenceTitles: normalizeReferenceTitles(sourceTitles),
        riskLevel: 'low',
      };
    }),
  });
