import { reduceAgentTurnSession } from '../session/agentSessionStateMachine.ts';
import type { AgentTurnPlan, AgentTurnSession } from '../session/agentSessionTypes.ts';

const buildRuntimeTurnExecutionStep = (input: {
  turnId: string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  userVisibleDetail: string;
  resultSummary: string;
  toolName?: string | null;
  startedAt?: number | null;
}) => ({
  id: `${input.turnId}_primary`,
  title: input.title,
  status: input.status,
  toolName: input.toolName ?? null,
  resultSummary: input.resultSummary,
  userVisibleDetail: input.userVisibleDetail,
  startedAt: input.startedAt ?? Date.now(),
  finishedAt: input.status === 'running' ? null : Date.now(),
});

const withRuntimeTurnExecutionStep = (
  session: AgentTurnSession,
  step: ReturnType<typeof buildRuntimeTurnExecutionStep>,
): AgentTurnSession => ({
  ...session,
  executionSteps: [step],
  updatedAt: Date.now(),
});

export const applyRuntimeTurnClassifying = (session: AgentTurnSession) =>
  reduceAgentTurnSession(session, { type: 'start_classifying' });

export const buildRuntimeTurnReviewPlan = (input: {
  turnId: string;
  summary: string;
  reason: string;
  riskLevel: AgentTurnPlan['riskLevel'];
  executeKind: 'tool' | 'file' | 'reply';
  needsApproval: boolean;
}): AgentTurnPlan => ({
  summary: input.summary,
  reason: input.reason,
  riskLevel: input.riskLevel,
  approvalStatus: 'not-required',
  affectedPaths: [],
  steps: [
    {
      id: `${input.turnId}_review`,
      title: 'Review request',
      kind: 'analysis',
      summary: 'Inspect the requested work and confirm the execution path.',
      needsApproval: false,
      expectedResult: 'A clear execution plan.',
    },
    {
      id: `${input.turnId}_execute`,
      title: 'Execute request',
      kind: input.executeKind,
      summary: 'Run the chosen path and report the result back in chat.',
      needsApproval: input.needsApproval,
      expectedResult: 'A completed turn or a resumable block.',
    },
  ],
});

export const applyRuntimeTurnExecuting = (input: {
  session: AgentTurnSession;
  turnId: string;
  title: string;
  detail: string;
  toolName?: string | null;
}) => {
  const nextSession = reduceAgentTurnSession(input.session, { type: 'approval_granted' });
  const approvedPlan =
    nextSession.plan && nextSession.plan.approvalStatus === 'pending'
      ? {
          ...nextSession.plan,
          approvalStatus: 'approved' as const,
        }
      : nextSession.plan;

  return withRuntimeTurnExecutionStep(
    {
      ...nextSession,
      plan: approvedPlan,
    },
    buildRuntimeTurnExecutionStep({
      turnId: input.turnId,
      title: input.title,
      status: 'running',
      userVisibleDetail: input.detail,
      resultSummary: input.detail,
      toolName: input.toolName,
      startedAt: input.session.executionSteps[0]?.startedAt,
    }),
  );
};

export const applyRuntimeTurnCompleted = (input: {
  session: AgentTurnSession;
  turnId: string;
  finalContent: string;
}) =>
  withRuntimeTurnExecutionStep(
    reduceAgentTurnSession(input.session, { type: 'execution_completed' }),
    buildRuntimeTurnExecutionStep({
      turnId: input.turnId,
      title: 'Completed turn',
      status: 'completed',
      userVisibleDetail: input.finalContent,
      resultSummary: input.finalContent,
      startedAt: input.session.executionSteps[0]?.startedAt,
    }),
  );

export const applyRuntimeTurnFailed = (input: {
  session: AgentTurnSession;
  turnId: string;
  message: string;
}) =>
  withRuntimeTurnExecutionStep(
    reduceAgentTurnSession(input.session, { type: 'execution_failed', reason: input.message }),
    buildRuntimeTurnExecutionStep({
      turnId: input.turnId,
      title: 'Failed turn',
      status: 'failed',
      userVisibleDetail: input.message,
      resultSummary: input.message,
      startedAt: input.session.executionSteps[0]?.startedAt,
    }),
  );

export const applyRuntimeTurnBlocked = (input: {
  session: AgentTurnSession;
  turnId: string;
  reason: string;
  actionLabel?: string | null;
}) => {
  const nextSession = reduceAgentTurnSession(input.session, {
    type: 'execution_blocked',
    reason: input.reason,
    actionLabel: input.actionLabel || null,
  });

  const deniedPlan =
    input.session.plan && input.session.plan.approvalStatus === 'pending'
      ? {
          ...input.session.plan,
          approvalStatus: 'denied' as const,
        }
      : input.session.plan;

  return withRuntimeTurnExecutionStep(
    {
      ...nextSession,
      plan: deniedPlan,
    },
    buildRuntimeTurnExecutionStep({
      turnId: input.turnId,
      title: 'Blocked turn',
      status: 'blocked',
      userVisibleDetail: input.reason,
      resultSummary: input.reason,
      startedAt: input.session.executionSteps[0]?.startedAt,
    }),
  );
};
