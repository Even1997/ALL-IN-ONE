import { create } from 'zustand';
import type {
  KnowledgeSessionArtifactStatus,
  KnowledgeSessionArtifactType,
} from '../model/knowledgeSessionArtifact';

export type KnowledgeSessionArtifact = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  artifactType: KnowledgeSessionArtifactType;
  summary: string;
  body: string;
  status: KnowledgeSessionArtifactStatus;
  createdAt: number;
};

type KnowledgeSessionArtifactsState = {
  artifactsBySession: Record<string, KnowledgeSessionArtifact[]>;
  activeArtifactIdBySession: Record<string, string | null>;
  upsertArtifact: (artifact: KnowledgeSessionArtifact) => void;
  setActiveArtifact: (projectId: string, sessionId: string, artifactId: string | null) => void;
  setArtifactStatus: (
    projectId: string,
    sessionId: string,
    artifactId: string,
    status: KnowledgeSessionArtifact['status']
  ) => void;
  clearSessionArtifacts: (projectId: string, sessionId: string) => void;
};

const buildSessionKey = (projectId: string, sessionId: string) => `${projectId}:${sessionId}`;

export const useKnowledgeSessionArtifactsStore = create<KnowledgeSessionArtifactsState>((set) => ({
  artifactsBySession: {},
  activeArtifactIdBySession: {},
  upsertArtifact: (artifact) =>
    set((state) => {
      const key = buildSessionKey(artifact.projectId, artifact.sessionId);
      const existing = state.artifactsBySession[key] || [];
      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: [artifact, ...existing.filter((item) => item.id !== artifact.id)].sort(
            (left, right) => right.createdAt - left.createdAt
          ),
        },
      };
    }),
  setActiveArtifact: (projectId, sessionId, artifactId) =>
    set((state) => ({
      activeArtifactIdBySession: {
        ...state.activeArtifactIdBySession,
        [buildSessionKey(projectId, sessionId)]: artifactId,
      },
    })),
  setArtifactStatus: (projectId, sessionId, artifactId, status) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: (state.artifactsBySession[key] || []).map((artifact) =>
            artifact.id === artifactId ? { ...artifact, status } : artifact
          ),
        },
      };
    }),
  clearSessionArtifacts: (projectId, sessionId) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      const { [key]: _discard, ...restArtifacts } = state.artifactsBySession;
      const { [key]: _active, ...restActive } = state.activeArtifactIdBySession;
      return {
        artifactsBySession: restArtifacts,
        activeArtifactIdBySession: restActive,
      };
    }),
}));
