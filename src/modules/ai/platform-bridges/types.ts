import type { AgentPromptContext, AgentProviderId } from '../runtime/agentRuntimeTypes';

export type PlatformSkillSummary = {
  id: string;
  name: string;
};

export type PlatformSkillExecutionResult = {
  summary: string;
};

export type PlatformPromptContext = AgentPromptContext;

export type WorkspaceSnapshot = {
  projectId: string | null;
  projectName: string | null;
  selectedFilePath: string | null;
  threadId: string | null;
};

export type ActivityRecord = {
  id: string;
  providerId: AgentProviderId;
  summary: string;
  createdAt: number;
};
