// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ChatAgentId } from '../../chat/chatAgents.ts';

export type AgentTeamRole =
  | 'coordinator'
  | 'product_architect'
  | 'ui_interaction_designer'
  | 'implementer'
  | 'qa_reviewer';

export type AgentTeamPhaseId = 'product_architecture' | 'ui_interaction' | 'implementation' | 'qa_review';

export type AgentTeamTask = {
  id: string;
  phaseId: AgentTeamPhaseId;
  title: string;
  prompt: string;
  role: AgentTeamRole;
  dependsOn: string[];
};

export type AgentTeamPhasePlan = {
  id: AgentTeamPhaseId;
  title: string;
  summary: string;
  goal: string;
  tasks: AgentTeamTask[];
};

export type AgentTeamPlan = {
  summary: string;
  strategy: string;
  phases: AgentTeamPhasePlan[];
};

export type AgentTeamMemberStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AgentTeamPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentTeamMemberRecord = {
  id: string;
  threadId: string;
  parentTurnId: string;
  taskId: string;
  phaseId: AgentTeamPhaseId;
  role: AgentTeamRole;
  agentId: Exclude<ChatAgentId, 'built-in' | 'team'>;
  title: string;
  prompt: string;
  status: AgentTeamMemberStatus;
  startedAt: number | null;
  completedAt: number | null;
  result: string;
  error: string | null;
  dependsOn: string[];
  changedPaths: string[];
};

export type AgentTeamPhaseRecord = {
  id: AgentTeamPhaseId;
  title: string;
  summary: string;
  goal: string;
  status: AgentTeamPhaseStatus;
  startedAt: number | null;
  completedAt: number | null;
  taskIds: string[];
};

export type AgentTeamRunStatus = 'planning' | 'running' | 'completed' | 'failed';

export type AgentTeamRunRecord = {
  id: string;
  threadId: string;
  turnId: string;
  providerId: 'team';
  summary: string;
  strategy: string;
  status: AgentTeamRunStatus;
  phases: AgentTeamPhaseRecord[];
  members: AgentTeamMemberRecord[];
  finalSummary: string;
  changedPaths: string[];
  createdAt: number;
  updatedAt: number;
};
