import type { ChatCardAction, ChatStructuredCard } from '../chat/chatCards';

type KnowledgeTruthConflict = {
  id: string;
  title: string;
  previousLabel: string;
  nextLabel: string;
  sourceTitles: string[];
};

type KnowledgeTruthTemporaryArtifact = {
  id: string;
  title: string;
  artifactType: 'impact-analysis' | 'candidate-summary' | 'candidate-structure' | 'prototype-draft' | 'design-draft';
  summary: string;
  body: string;
};

type BuildKnowledgeTruthReplyInput = {
  summary: string;
  conflicts: KnowledgeTruthConflict[];
  temporaryArtifacts: KnowledgeTruthTemporaryArtifact[];
  nextSteps: ChatCardAction[];
};

export const buildKnowledgeTruthReply = ({
  summary,
  conflicts,
  temporaryArtifacts,
  nextSteps,
}: BuildKnowledgeTruthReplyInput): { content: string; cards: ChatStructuredCard[] } => {
  const cards: ChatStructuredCard[] = [
    {
      type: 'summary',
      title: '本轮识别结果',
      body: summary,
    },
    ...conflicts.map((conflict) => ({
      type: 'conflict' as const,
      id: conflict.id,
      title: conflict.title,
      previousLabel: conflict.previousLabel,
      nextLabel: conflict.nextLabel,
      sourceTitles: conflict.sourceTitles,
      status: 'pending' as const,
    })),
    ...temporaryArtifacts.map((artifact) => ({
      type: 'temporary-content' as const,
      artifactId: artifact.id,
      title: artifact.title,
      artifactType: artifact.artifactType,
      summary: artifact.summary,
      body: artifact.body,
      status: 'session' as const,
    })),
  ];

  if (nextSteps.length > 0) {
    cards.push({
      type: 'next-step',
      title: '下一步建议',
      actions: nextSteps,
    });
  }

  return {
    content: summary,
    cards,
  };
};
