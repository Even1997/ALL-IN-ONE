import type { AgentProviderId } from '../agentRuntimeTypes';

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
