// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
