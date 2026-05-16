// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { RuntimeSkillDefinition } from './skills/runtimeSkillTypes';

export type AgentProviderId = 'built-in' | 'claude' | 'codex' | 'team';

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

export type AgentTurnCheckpointFile = {
  path: string;
  changeType: 'created' | 'updated' | 'deleted';
  insertions: number;
  deletions: number;
};

export type AgentTurnCheckpointRecord = {
  id: string;
  threadId: string;
  runId: string;
  messageId: string | null;
  summary: string;
  filesChanged: AgentTurnCheckpointFile[];
  insertions: number;
  deletions: number;
  createdAt: number;
  updatedAt: number;
};

export type AgentTurnCheckpointDiff = {
  checkpointId: string;
  threadId: string;
  runId: string;
  path: string;
  changeType: 'created' | 'updated' | 'deleted';
  beforeContent: string | null;
  afterContent: string | null;
  diff: string;
  insertions: number;
  deletions: number;
  createdAt: number;
};

export type AgentTurnRewindResult = {
  threadId: string;
  runId: string;
  restoredPaths: string[];
  removedRunIds: string[];
  checkpointCount: number;
  rewoundAt: number;
};

export type AgentBackgroundTaskRecord = {
  id: string;
  threadId: string;
  runKind: string;
  title: string;
  status: string;
  summary: string;
  payloadJson: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentExecutionTaskStatus = 'queued' | 'planning' | 'running' | 'completed' | 'failed' | 'blocked';

export type AgentExecutionRunStatus = AgentExecutionTaskStatus;

export type AgentExecutionAgentRunStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked';

export type AgentExecutionRunKind =
  | 'turn'
  | 'local_agent'
  | 'team'
  | 'team_phase';

export type AgentExecutionAgentRunKind =
  | 'local_agent'
  | 'team_member';

export type AgentExecutionTaskRecord = {
  id: string;
  threadId: string;
  turnId: string;
  providerId: AgentProviderId;
  title: string;
  prompt: string;
  summary: string;
  status: AgentExecutionTaskStatus;
  rootRunId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type AgentExecutionRunRecord = {
  id: string;
  threadId: string;
  taskId: string;
  turnId: string;
  parentRunId: string | null;
  providerId: AgentProviderId;
  kind: AgentExecutionRunKind;
  title: string;
  summary: string;
  status: AgentExecutionRunStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type AgentExecutionAgentRunRecord = {
  id: string;
  threadId: string;
  taskId: string;
  runId: string;
  parentAgentRunId: string | null;
  kind: AgentExecutionAgentRunKind;
  agentId: string;
  role: string;
  title: string;
  summary: string;
  status: AgentExecutionAgentRunStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};
