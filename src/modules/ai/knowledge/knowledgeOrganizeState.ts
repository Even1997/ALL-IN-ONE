import type { GeneratedFile, RequirementDoc } from '../../../types';
import type { KnowledgeOrganizeWorkflowState } from '../store/workflowStore';

export const KNOWLEDGE_ORGANIZE_DOC_TITLES = [
  'project-overview.md',
  'feature-inventory.md',
  'page-inventory.md',
  'terminology.md',
  'open-questions.md',
] as const;

const KNOWLEDGE_ORGANIZE_DOC_TITLE_SET = new Set<string>(KNOWLEDGE_ORGANIZE_DOC_TITLES);

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const hashKnowledgeContent = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const isKnowledgeOrganizeManagedTitle = (title: string) =>
  KNOWLEDGE_ORGANIZE_DOC_TITLE_SET.has(title.trim());

export const splitKnowledgeOrganizeDocs = (docs: RequirementDoc[]) => ({
  sourceDocs: docs.filter((doc) => !isKnowledgeOrganizeManagedTitle(doc.title)),
  existingWikiDocs: docs.filter((doc) => isKnowledgeOrganizeManagedTitle(doc.title)),
});

export const hasKnowledgeOrganizeSourceChanges = ({
  sourceDocs,
  generatedFiles,
  lastKnowledgeOrganizeAt,
}: {
  sourceDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  lastKnowledgeOrganizeAt: string | null;
}) => {
  if (!lastKnowledgeOrganizeAt) {
    return true;
  }

  const baseline = toTimestamp(lastKnowledgeOrganizeAt);
  if (baseline <= 0) {
    return true;
  }

  return [...sourceDocs, ...generatedFiles].some((item) => toTimestamp(item.updatedAt) > baseline);
};

export const detectKnowledgeOrganizeManualEdits = ({
  docs,
  workflowState,
}: {
  docs: RequirementDoc[];
  workflowState: KnowledgeOrganizeWorkflowState | null | undefined;
}) => {
  const snapshots = workflowState?.wikiSnapshots || {};

  return docs
    .filter((doc) => isKnowledgeOrganizeManagedTitle(doc.title))
    .filter((doc) => {
      const snapshot = snapshots[doc.title];
      if (!snapshot) {
        return false;
      }

      return hashKnowledgeContent(doc.content) !== snapshot.contentHash;
    })
    .map((doc) => doc.title);
};

export const buildKnowledgeOrganizeWorkflowState = ({
  docs,
  lastKnowledgeOrganizeAt,
}: {
  docs: RequirementDoc[];
  lastKnowledgeOrganizeAt: string;
}): KnowledgeOrganizeWorkflowState => ({
  lastKnowledgeOrganizeAt,
  wikiSnapshots: Object.fromEntries(
    docs
      .filter((doc) => isKnowledgeOrganizeManagedTitle(doc.title))
      .map((doc) => [
        doc.title,
        {
          noteId: doc.id,
          updatedAt: doc.updatedAt,
          contentHash: hashKnowledgeContent(doc.content),
        },
      ])
  ),
});

export type KnowledgeOrganizePlan =
  | {
      mode: 'no-change';
      message: string;
      sourceDocs: RequirementDoc[];
      existingWikiDocs: RequirementDoc[];
      manualEditedWikiTitles: string[];
    }
  | {
      mode: 'manual-review-only';
      message: string;
      sourceDocs: RequirementDoc[];
      existingWikiDocs: RequirementDoc[];
      manualEditedWikiTitles: string[];
    }
  | {
      mode: 'proceed';
      sourceDocs: RequirementDoc[];
      existingWikiDocs: RequirementDoc[];
      manualEditedWikiTitles: string[];
    };

export const planKnowledgeOrganizeRun = ({
  docs,
  generatedFiles,
  workflowState,
}: {
  docs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  workflowState: KnowledgeOrganizeWorkflowState | null | undefined;
}): KnowledgeOrganizePlan => {
  const { sourceDocs, existingWikiDocs } = splitKnowledgeOrganizeDocs(docs);
  const manualEditedWikiTitles = detectKnowledgeOrganizeManualEdits({
    docs: existingWikiDocs,
    workflowState,
  });
  const hasSourceChanges = hasKnowledgeOrganizeSourceChanges({
    sourceDocs,
    generatedFiles,
    lastKnowledgeOrganizeAt: workflowState?.lastKnowledgeOrganizeAt || null,
  });

  if (hasSourceChanges) {
    return {
      mode: 'proceed',
      sourceDocs,
      existingWikiDocs,
      manualEditedWikiTitles,
    };
  }

  if (manualEditedWikiTitles.length > 0) {
    return {
      mode: 'manual-review-only',
      message: `检测到现有 Wiki 已被手动修改，且源文档暂未发现变动。本次不自动改写：${manualEditedWikiTitles.join('、')}`,
      sourceDocs,
      existingWikiDocs,
      manualEditedWikiTitles,
    };
  }

  return {
    mode: 'no-change',
    message: '暂未发现变动',
    sourceDocs,
    existingWikiDocs,
    manualEditedWikiTitles,
  };
};
