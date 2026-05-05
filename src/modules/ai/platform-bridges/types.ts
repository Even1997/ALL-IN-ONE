import type {
  AgentExecutionAgentRunRecord,
  AgentExecutionRunRecord,
  AgentExecutionTaskRecord,
  AgentMemoryEntry,
  AgentPromptContext,
  AgentProviderId,
  AgentReplayEvent,
  AgentThreadRecord,
} from '../runtime/agentRuntimeTypes';

export type PlatformPromptContext = AgentPromptContext;

export type WorkspaceSnapshot = {
  projectId: string | null;
  projectName: string | null;
  threadId: string | null;
  providerId: AgentProviderId | null;
  thread: AgentThreadRecord | null;
  activeTask: AgentExecutionTaskRecord | null;
  activeRuns: AgentExecutionRunRecord[];
  activeAgentRuns: AgentExecutionAgentRunRecord[];
  replayEvents: AgentReplayEvent[];
  memoryEntries: AgentMemoryEntry[];
};

export type ActivityRecord = {
  id: string;
  threadId: string | null;
  providerId: AgentProviderId;
  kind: 'timeline' | 'task' | 'run' | 'artifact';
  summary: string;
  createdAt: number;
};
