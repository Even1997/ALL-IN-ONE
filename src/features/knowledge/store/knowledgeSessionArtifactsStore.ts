import { create } from 'zustand';

export type KnowledgeSessionArtifactType =
  | 'impact-analysis'
  | 'candidate-summary'
  | 'candidate-structure'
  | 'prototype-draft'
  | 'design-draft';

export type KnowledgeSessionArtifactStatus = 'session' | 'promoted' | 'discarded';

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

const hasSameArtifact = (left: KnowledgeSessionArtifact, right: KnowledgeSessionArtifact) =>
  left.id === right.id &&
  left.projectId === right.projectId &&
  left.sessionId === right.sessionId &&
  left.title === right.title &&
  left.artifactType === right.artifactType &&
  left.summary === right.summary &&
  left.body === right.body &&
  left.status === right.status &&
  left.createdAt === right.createdAt;

const hasSameArtifacts = (left: KnowledgeSessionArtifact[], right: KnowledgeSessionArtifact[]) =>
  left.length === right.length && left.every((artifact, index) => hasSameArtifact(artifact, right[index]));

export const useKnowledgeSessionArtifactsStore = create<KnowledgeSessionArtifactsState>((set) => ({
  artifactsBySession: {},
  activeArtifactIdBySession: {},
  upsertArtifact: (artifact) =>
    set((state) => {
      const key = buildSessionKey(artifact.projectId, artifact.sessionId);
      const existing = state.artifactsBySession[key] || [];
      const nextArtifacts = [artifact, ...existing.filter((item) => item.id !== artifact.id)].sort(
        (left, right) => right.createdAt - left.createdAt
      );
      if (hasSameArtifacts(existing, nextArtifacts)) {
        return state;
      }

      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: nextArtifacts,
        },
      };
    }),
  setActiveArtifact: (projectId, sessionId, artifactId) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      if ((state.activeArtifactIdBySession[key] || null) === artifactId) {
        return state;
      }

      return {
        activeArtifactIdBySession: {
          ...state.activeArtifactIdBySession,
          [key]: artifactId,
        },
      };
    }),
  setArtifactStatus: (projectId, sessionId, artifactId, status) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      const existing = state.artifactsBySession[key] || [];
      let changed = false;
      const nextArtifacts = existing.map((artifact) => {
        if (artifact.id !== artifactId || artifact.status === status) {
          return artifact;
        }

        changed = true;
        return { ...artifact, status };
      });
      if (!changed) {
        return state;
      }

      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: nextArtifacts,
        },
      };
    }),
  clearSessionArtifacts: (projectId, sessionId) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      if (!(key in state.artifactsBySession) && !(key in state.activeArtifactIdBySession)) {
        return state;
      }

      const { [key]: _discard, ...restArtifacts } = state.artifactsBySession;
      const { [key]: _active, ...restActive } = state.activeArtifactIdBySession;
      return {
        artifactsBySession: restArtifacts,
        activeArtifactIdBySession: restActive,
      };
    }),
}));
