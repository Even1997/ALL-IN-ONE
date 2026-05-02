import {
  classifyRuntimeActionRisk,
  shouldAutoApproveRuntimeAction,
  shouldDenyRuntimeAction,
} from '../approval/riskPolicy.ts';
import type { ApprovalRiskLevel, SandboxPolicy } from '../approval/approvalTypes.ts';

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
  `允许 ${agentId} 本地 Agent 在当前项目内执行任务`;

export const buildRuntimeLocalAgentDecisionFeedback = (input: {
  decision: Extract<RuntimeLocalAgentDecision, 'blocked' | 'approval-required'>;
  summary: string;
}) => ({
  timelineSummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
  replaySummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
});

export const buildRuntimeLocalAgentPrompt = (input: {
  systemPrompt?: string | null;
  prompt: string;
}) =>
  [input.systemPrompt ? `<system>\n${input.systemPrompt}\n</system>` : null, input.prompt]
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
      denialMessage: `当前 sandbox policy 为 ${input.sandboxPolicy}，已阻止本地 Agent 执行。`,
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
      pendingMessage: '需要审批后才能启动本地 Agent。',
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

  return result.content.trim() || '本地 Agent 已执行，但没有返回内容。';
};
