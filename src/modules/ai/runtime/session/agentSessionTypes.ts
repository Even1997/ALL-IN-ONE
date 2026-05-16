// 文件作用：类型契约文件，位于session 生命周期层。
// 所在链路：负责 turn session 的模式判定、状态迁移与只读查询。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件定义 agent turn session 的完整结构，是 session 子系统的基础契约。
// 它描述一轮用户请求在 runtime 里的状态机快照、计划步骤、执行进度和可恢复信息，供 store、selector、UI 共同依赖。
// 如果你在排查“某轮状态为什么卡在 planning / blocked / resumable”或字段含义不清，优先从这里确认。
import type { AgentProviderId } from '../agentRuntimeTypes';

// AgentTurnSession 描述“一次用户回合”在 runtime 里的结构化状态：
// 它比普通消息更偏执行视角，适合承载计划、执行步骤和可恢复快照。
export type AgentTurnSessionStatus =
  | 'idle'
  | 'classifying'
  | 'planning'
  | 'waiting_approval'
  | 'executing'
  | 'blocked'
  | 'resumable'
  | 'completed'
  | 'failed';

export type AgentTurnSessionMode = 'direct' | 'plan_then_execute';

export type AgentPlanStep = {
  id: string;
  title: string;
  kind: 'analysis' | 'tool' | 'file' | 'approval' | 'reply';
  summary: string;
  needsApproval: boolean;
  expectedResult: string;
};

export type AgentExecutionStep = {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  toolName: string | null;
  resultSummary: string;
  userVisibleDetail: string;
  startedAt: number | null;
  finishedAt: number | null;
};

export type AgentResumeSnapshot = {
  turnId: string;
  resumeFromStepId: string | null;
  resumeReason: string;
  blockingRequirement: string | null;
  resumeActionLabel: string | null;
  lastStableOutput: string;
};

export type AgentTurnPlan = {
  summary: string;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  approvalStatus: 'not-required' | 'pending' | 'approved' | 'denied';
  affectedPaths: string[];
  steps: AgentPlanStep[];
};

export type AgentTurnSession = {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  userPrompt: string;
  status: AgentTurnSessionStatus;
  mode: AgentTurnSessionMode;
  plan: AgentTurnPlan | null;
  executionSteps: AgentExecutionStep[];
  resumeSnapshot: AgentResumeSnapshot | null;
  createdAt: number;
  updatedAt: number;
};

// 新 turn session 先用一个最小可运行的空壳初始化，
// 后续再逐步补 plan、executionSteps 和 resumeSnapshot。
export const createEmptyAgentTurnSession = (input: {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  userPrompt: string;
}): AgentTurnSession => {
  const now = Date.now();

  return {
    id: input.id,
    threadId: input.threadId,
    providerId: input.providerId,
    userPrompt: input.userPrompt,
    status: 'idle',
    mode: 'direct',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
};
