import {
  classifyRuntimeActionRisk,
  shouldAutoApproveRuntimeAction,
  shouldDenyRuntimeAction,
} from '../approval/riskPolicy.ts';
import type { ApprovalRecord, ApprovalRiskLevel, SandboxPolicy } from '../approval/approvalTypes.ts';
import type { AgentTurnPlan } from '../session/agentSessionTypes.ts';
import { requestRuntimeApproval, type RuntimePendingApprovalAction } from './runtimeApprovalCoordinator.ts';

export type RuntimeLocalAgentDecision = 'blocked' | 'approval-required' | 'auto-execute';

export type PreparedRuntimeLocalAgentFlow = {
  actionType: 'run_local_agent_prompt';
  riskLevel: ApprovalRiskLevel;
  summary: string;
  decision: RuntimeLocalAgentDecision;
  denialMessage: string | null;
  pendingMessage: string | null;
};

export const buildRuntimeLocalAgentSummary = (agentId: string) =>
  `Allow ${agentId} local agent execution inside the current project`;

export const buildRuntimeLocalAgentDecisionFeedback = (input: {
  decision: Extract<RuntimeLocalAgentDecision, 'blocked' | 'approval-required'>;
  summary: string;
}) => ({
  timelineSummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
  replaySummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
});

export const buildRuntimeLocalAgentDecisionState = (flow: PreparedRuntimeLocalAgentFlow) => {
  if (flow.decision === 'blocked') {
    return {
      messageContent: flow.denialMessage || 'The local agent run was blocked.',
      approvalStatus: 'denied' as const,
      feedback: buildRuntimeLocalAgentDecisionFeedback({
        decision: 'blocked',
        summary: flow.summary,
      }),
      blockedReason: flow.summary,
      blockedActionLabel: 'Adjust local agent request',
    };
  }

  return {
    messageContent: flow.pendingMessage || 'Approval is required before the local agent can run.',
    approvalStatus: 'pending' as const,
    feedback: buildRuntimeLocalAgentDecisionFeedback({
      decision: 'approval-required',
      summary: flow.summary,
    }),
    deniedMessageContent: 'The local agent request was denied.',
    deniedReason: 'Local agent execution was denied.',
    deniedActionLabel: 'Retry with a safer request',
  };
};

type RuntimeLocalAgentDecisionState = ReturnType<typeof buildRuntimeLocalAgentDecisionState> | null;

export const resolveRuntimeLocalAgentDecisionFeedback = (input: {
  decisionState: RuntimeLocalAgentDecisionState;
  summary: string;
}) => ({
  messageContent: input.decisionState?.messageContent || 'Approval is required before the local agent can run.',
  timelineSummary: input.decisionState?.feedback.timelineSummary || input.summary,
  replaySummary: input.decisionState?.feedback.replaySummary || input.summary,
  blockedReason: input.decisionState?.blockedReason || input.summary,
  blockedActionLabel: input.decisionState?.blockedActionLabel || 'Adjust local agent request',
  deniedMessageContent: input.decisionState?.deniedMessageContent || 'The local agent request was denied.',
  deniedReason: input.decisionState?.deniedReason || 'Local agent execution was denied.',
  deniedActionLabel: input.decisionState?.deniedActionLabel || 'Retry with a safer request',
  approvalStatus: input.decisionState?.approvalStatus || 'pending',
});

export const updateRuntimeLocalAgentPlanApprovalStatus = (
  plan: AgentTurnPlan | null,
  approvalStatus: AgentTurnPlan['approvalStatus']
) =>
  plan
    ? {
        ...plan,
        approvalStatus,
      }
    : plan;

export const denyRuntimeLocalAgentApproval = async (input: {
  flow: PreparedRuntimeLocalAgentFlow;
  threadId: string;
  messageId?: string | null;
  enqueueAgentApproval: (payload: {
    threadId: string;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: string;
    messageId: string | null;
  }) => Promise<ApprovalRecord>;
  enqueueApproval: (approval: ApprovalRecord) => void;
  resolveStoredApproval: (approvalId: string, status: ApprovalRecord['status']) => void;
  resolveAgentApproval: (payload: { approvalId: string; status: ApprovalRecord['status'] }) => Promise<unknown>;
}) => {
  const approval = await input.enqueueAgentApproval({
    threadId: input.threadId,
    actionType: input.flow.actionType,
    riskLevel: input.flow.riskLevel,
    summary: input.flow.summary,
    messageId: input.messageId || null,
  });

  input.enqueueApproval(approval);
  input.resolveStoredApproval(approval.id, 'denied');
  await input.resolveAgentApproval({ approvalId: approval.id, status: 'denied' });

  return approval;
};

export const requestRuntimeLocalAgentApproval = async (input: {
  flow: PreparedRuntimeLocalAgentFlow;
  threadId: string;
  messageId?: string | null;
  onApprove: () => Promise<void>;
  onDeny?: () => void | Promise<void>;
  display?: RuntimePendingApprovalAction['display'];
  enqueueAgentApproval: (payload: {
    threadId: string;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: string;
    messageId: string | null;
  }) => Promise<ApprovalRecord>;
  enqueueApproval: (approval: ApprovalRecord) => void;
  pendingApprovalActions: Record<string, RuntimePendingApprovalAction>;
}) =>
  requestRuntimeApproval({
    threadId: input.threadId,
    actionType: input.flow.actionType,
    riskLevel: input.flow.riskLevel,
    summary: input.flow.summary,
    messageId: input.messageId,
    onApprove: input.onApprove,
    onDeny: input.onDeny,
    display: input.display,
    enqueueAgentApproval: input.enqueueAgentApproval,
    enqueueApproval: input.enqueueApproval,
    pendingApprovalActions: input.pendingApprovalActions,
  });

export const handleRuntimeLocalAgentDecision = async (input: {
  flow: PreparedRuntimeLocalAgentFlow;
  onBlocked: () => Promise<void>;
  onApprovalRequired: () => Promise<void>;
  onAutoExecute: () => Promise<void>;
}) => {
  if (input.flow.decision === 'blocked') {
    await input.onBlocked();
    return 'blocked' as const;
  }

  if (input.flow.decision === 'approval-required') {
    await input.onApprovalRequired();
    return 'approval-required' as const;
  }

  await input.onAutoExecute();
  return 'auto-execute' as const;
};

export const buildRuntimeLocalAgentPlan = (input: {
  turnId: string | null;
  flow: PreparedRuntimeLocalAgentFlow;
}): AgentTurnPlan => ({
  summary: input.flow.summary,
  reason: 'local-agent-flow',
  riskLevel: input.flow.riskLevel,
  approvalStatus:
    input.flow.decision === 'approval-required'
      ? 'pending'
      : input.flow.decision === 'blocked'
        ? 'denied'
        : 'approved',
  affectedPaths: [],
  steps: [
    {
      id: `${input.turnId || 'local-agent'}_local-review`,
      title: 'Review local agent request',
      kind: 'analysis',
      summary: 'Validate the request before launching the desktop agent.',
      needsApproval: false,
      expectedResult: 'A safe local-agent execution plan.',
    },
    {
      id: `${input.turnId || 'local-agent'}_local-run`,
      title: 'Run local agent',
      kind: 'tool',
      summary: 'Start the local agent and stream the result back into chat.',
      needsApproval: input.flow.decision === 'approval-required',
      expectedResult: 'A completed local-agent run or a resumable block.',
    },
  ],
});

export const buildRuntimeLocalAgentPrompt = (input: {
  systemPrompt?: string | null;
  prompt: string;
  allowedTools?: string[] | null;
}) =>
  [
    input.systemPrompt ? `<system>\n${input.systemPrompt}\n</system>` : null,
    input.allowedTools && input.allowedTools.length > 0
      ? `<tool_constraints>\nOnly use these tools if tool use is needed: ${input.allowedTools.join(', ')}.\nDo not use any other tools.\n</tool_constraints>`
      : null,
    input.prompt,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');

export const prepareRuntimeLocalAgentFlow = (input: {
  agentId: string;
  sandboxPolicy: SandboxPolicy;
}): PreparedRuntimeLocalAgentFlow => {
  const actionType = 'run_local_agent_prompt' as const;
  const riskLevel = classifyRuntimeActionRisk(actionType);
  const summary = buildRuntimeLocalAgentSummary(input.agentId);

  if (shouldDenyRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy })) {
    return {
      actionType,
      riskLevel,
      summary,
      decision: 'blocked',
      denialMessage: `The current sandbox policy (${input.sandboxPolicy}) blocks local agent execution.`,
      pendingMessage: null,
    };
  }

  if (!shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy })) {
    return {
      actionType,
      riskLevel,
      summary,
      decision: 'approval-required',
      denialMessage: null,
      pendingMessage: 'Approval is required before the local agent can run.',
    };
  }

  return {
    actionType,
    riskLevel,
    summary,
    decision: 'auto-execute',
    denialMessage: null,
    pendingMessage: null,
  };
};

export type RuntimeLocalAgentCommandResult = {
  success: boolean;
  content: string;
  error?: string | null;
  changedPaths?: string[] | null;
};

export const executeRuntimeLocalAgentPrompt = async (input: {
  agentId: string;
  projectRoot: string;
  prompt: string;
  runPrompt: (payload: {
    agent: string;
    projectRoot: string;
    prompt: string;
  }) => Promise<RuntimeLocalAgentCommandResult>;
}) => {
  const result = await input.runPrompt({
    agent: input.agentId,
    projectRoot: input.projectRoot,
    prompt: input.prompt,
  });

  if (!result.success) {
    throw new Error(result.error || 'Local agent execution failed.');
  }

  return {
    content: result.content.trim() || 'Local agent completed, but no content was returned.',
    changedPaths: Array.isArray(result.changedPaths) ? result.changedPaths : [],
  };
};
