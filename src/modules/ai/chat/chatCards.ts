import type {
  KnowledgeSessionArtifactStatus,
  KnowledgeSessionArtifactType,
} from '../../../features/knowledge/store/knowledgeSessionArtifactsStore';

export type ChatCardAction = {
  id: string;
  label: string;
  prompt: string;
  tone?: 'default' | 'primary' | 'danger';
};

export type ChatStructuredCard =
  | {
      type: 'summary';
      title: string;
      body: string;
    }
  | {
      type: 'conflict';
      id: string;
      title: string;
      previousLabel: string;
      nextLabel: string;
      sourceTitles: string[];
      status: 'pending' | 'confirmed' | 'dismissed';
    }
  | {
      type: 'temporary-content';
      artifactId: string;
      title: string;
      artifactType: KnowledgeSessionArtifactType;
      summary: string;
      body: string;
      status: KnowledgeSessionArtifactStatus;
    }
  | {
      type: 'next-step';
      title: string;
      actions: ChatCardAction[];
    };
