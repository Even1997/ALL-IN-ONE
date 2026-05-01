import type { KnowledgeProposal } from '../../../features/knowledge/model/knowledgeProposal';
import type {
  KnowledgeSessionArtifact,
  KnowledgeSessionArtifactStatus,
} from '../../../features/knowledge/store/knowledgeSessionArtifactsStore';
import type { ChatStructuredCard } from '../chat/chatCards';
import type { StoredChatMessage } from '../store/aiChatStore';
import { buildChangeSyncProposal } from './buildChangeSyncProposal.ts';
import { buildKnowledgeTruthReply } from './buildKnowledgeTruthReply.ts';
import type { RequirementDoc } from '../../../types';

const TEMPORARY_ARTIFACT_PROMOTION_SUMMARY_PREFIX = '已从会话临时内容生成待确认知识：';
const CHANGE_SYNC_TEMPORARY_ARTIFACT_TYPE: KnowledgeSessionArtifact['artifactType'] = 'candidate-summary';

const buildChangeSyncArtifactId = (sessionId: string, createdAt: number, docId: string, index: number) =>
  `change-sync-artifact:${sessionId}:${createdAt}:${index}:${docId}`;

export const buildTemporaryArtifactPromotionSummary = (title: string) =>
  `${TEMPORARY_ARTIFACT_PROMOTION_SUMMARY_PREFIX}${title}`;

const isLegacyTemporaryArtifactPromotionProposal = (
  proposal: Pick<KnowledgeProposal, 'summary' | 'operations'>,
  artifact: Pick<KnowledgeSessionArtifact, 'title'>
) =>
  proposal.summary === buildTemporaryArtifactPromotionSummary(artifact.title) &&
  proposal.operations.some((operation) => operation.type === 'create_note' && operation.targetTitle === artifact.title);

const proposalTargetsTemporaryArtifact = (
  proposal: Pick<KnowledgeProposal, 'sourceArtifactId' | 'summary' | 'operations'>,
  artifact: Pick<KnowledgeSessionArtifact, 'id' | 'title'>
) => {
  if (proposal.sourceArtifactId) {
    return proposal.sourceArtifactId === artifact.id;
  }

  return isLegacyTemporaryArtifactPromotionProposal(proposal, artifact);
};

export const buildChangeSyncSessionArtifacts = ({
  projectId,
  sessionId,
  docs,
  createdAt = Date.now(),
}: {
  projectId: string;
  sessionId: string;
  docs: RequirementDoc[];
  createdAt?: number;
}): KnowledgeSessionArtifact[] =>
  docs.map((doc, index) => ({
    id: buildChangeSyncArtifactId(sessionId, createdAt, doc.id, index),
    projectId,
    sessionId,
    title: doc.title,
    artifactType: CHANGE_SYNC_TEMPORARY_ARTIFACT_TYPE,
    summary: doc.summary || doc.title,
    body: doc.content,
    status: 'session',
    createdAt: createdAt + index,
  }));

export const buildChangeSyncTemporaryReply = (artifacts: KnowledgeSessionArtifact[]) =>
  buildKnowledgeTruthReply({
    summary: `已生成 ${artifacts.length} 份会话临时内容，请先预览或采纳为正式内容。`,
    conflicts: [],
    temporaryArtifacts: artifacts,
    nextSteps: [],
  });

export const buildTemporaryArtifactPromotionProposal = ({
  projectId,
  artifact,
}: {
  projectId: string;
  artifact: Pick<KnowledgeSessionArtifact, 'id' | 'title' | 'summary' | 'body'>;
}) =>
  buildChangeSyncProposal({
    projectId,
    sourceArtifactId: artifact.id,
    summaryText: buildTemporaryArtifactPromotionSummary(artifact.title),
    reasonText: artifact.summary,
    docs: [
      {
        id: `temporary-artifact-${artifact.id}`,
        title: artifact.title,
        summary: artifact.title,
        content: artifact.body,
        authorRole: '产品',
        updatedAt: new Date().toISOString(),
        status: 'draft',
      },
    ],
  });

export const findTemporaryArtifactForProposal = (
  artifacts: Pick<KnowledgeSessionArtifact, 'id' | 'title'>[],
  proposal: Pick<KnowledgeProposal, 'sourceArtifactId' | 'summary' | 'operations'>
) => {
  return artifacts.find((artifact) => proposalTargetsTemporaryArtifact(proposal, artifact)) || null;
};

export const findExistingTemporaryArtifactProposal = (
  messages: Pick<StoredChatMessage, 'knowledgeProposal'>[],
  artifact: Pick<KnowledgeSessionArtifact, 'id' | 'title'>
) => {
  for (const message of messages) {
    const proposal = message.knowledgeProposal;
    if (!proposal || proposal.status === 'dismissed' || !proposalTargetsTemporaryArtifact(proposal, artifact)) {
      continue;
    }

    return proposal;
  }

  return null;
};

export const collectPendingTemporaryArtifactIds = (
  artifacts: Pick<KnowledgeSessionArtifact, 'id' | 'title' | 'status'>[],
  proposals: Pick<KnowledgeProposal, 'status' | 'sourceArtifactId' | 'summary' | 'operations'>[]
) => {
  const ids = new Set<string>();

  for (const artifact of artifacts) {
    if (artifact.status !== 'session') {
      continue;
    }

    const hasPendingProposal = proposals.some(
      (proposal) =>
        (proposal.status === 'pending' || proposal.status === 'executing') &&
        proposalTargetsTemporaryArtifact(proposal, artifact)
    );
    if (hasPendingProposal) {
      ids.add(artifact.id);
    }
  }

  return ids;
};

export const buildSessionArtifactsFromStoredMessages = ({
  projectId,
  sessionId,
  messages,
}: {
  projectId: string;
  sessionId: string;
  messages: Pick<StoredChatMessage, 'createdAt' | 'structuredCards' | 'knowledgeProposal'>[];
}): KnowledgeSessionArtifact[] => {
  const artifactsById = new Map<string, KnowledgeSessionArtifact>();

  for (const message of messages) {
    for (const card of message.structuredCards || []) {
      if (card.type !== 'temporary-content') {
        continue;
      }

      const existingArtifact = artifactsById.get(card.artifactId);
      if (existingArtifact && existingArtifact.createdAt >= message.createdAt) {
        continue;
      }

      artifactsById.set(card.artifactId, {
        id: card.artifactId,
        projectId,
        sessionId,
        title: card.title,
        artifactType: card.artifactType,
        summary: card.summary,
        body: card.body,
        status: 'session',
        createdAt: message.createdAt,
      });
    }
  }

  for (const message of messages) {
    const proposal = message.knowledgeProposal;
    if (!proposal || proposal.status !== 'executed') {
      continue;
    }

    const matchedArtifact = findTemporaryArtifactForProposal([...artifactsById.values()], proposal);
    if (!matchedArtifact) {
      continue;
    }

    artifactsById.set(matchedArtifact.id, {
      ...artifactsById.get(matchedArtifact.id),
      status: 'promoted',
    } as KnowledgeSessionArtifact);
  }

  return [...artifactsById.values()].sort((left, right) => right.createdAt - left.createdAt);
};

export const syncTemporaryArtifactCardStatuses = (
  cards: ChatStructuredCard[],
  artifacts: Pick<KnowledgeSessionArtifact, 'id' | 'status'>[]
): ChatStructuredCard[] => {
  const statusByArtifactId = new Map<string, KnowledgeSessionArtifactStatus>(
    artifacts.map((artifact) => [artifact.id, artifact.status])
  );

  return cards.map((card) => {
    if (card.type !== 'temporary-content') {
      return card;
    }

    const status = statusByArtifactId.get(card.artifactId);
    return status && status !== card.status ? { ...card, status } : card;
  });
};
