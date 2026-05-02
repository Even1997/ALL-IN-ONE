import type { RuntimeSkillDefinition } from './skills/runtimeSkillTypes';

export type AgentProviderId = 'built-in' | 'claude' | 'codex';

export type AgentTimelineEvent = {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  summary: string;
  createdAt: number;
};

export type AgentThreadRecord = {
  id: string;
  providerId: AgentProviderId;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentTurnRecord = {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt: string;
  createdAt: number;
  completedAt: number | null;
};

export type AgentReferenceFile = {
  path: string;
  summary: string;
  content: string;
};

export type AgentPromptContext = {
  projectId: string | null;
  projectName: string | null;
  threadId: string | null;
  labels: string[];
  memoryLabels: string[];
  content: string;
  instructions: string[];
  referenceFiles: AgentReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
};

export type AgentContextBundle = AgentPromptContext;

export type AgentMemoryEntry = {
  id: string;
  threadId: string | null;
  label: string;
  content: string;
  createdAt: number;
  title?: string;
  summary?: string;
  updatedAt?: number;
  kind?: 'projectFact' | 'userPreference';
};

export type AgentReplayEvent = {
  id: string;
  threadId: string;
  eventType: string;
  payload: string;
  createdAt: number;
};
