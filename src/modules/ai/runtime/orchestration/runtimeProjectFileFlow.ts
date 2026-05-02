import type {
  ProjectFileOperation,
  ProjectFileOperationMode,
  ProjectFileOperationPlan,
  ProjectFileProposal,
} from '../../chat/projectFileOperations.ts';
import {
  classifyProjectFileOperationsRisk,
  shouldAutoApproveRuntimeAction,
  shouldDenyRuntimeAction,
} from '../approval/riskPolicy.ts';
import type { ApprovalRiskLevel, SandboxPolicy } from '../approval/approvalTypes.ts';

export const buildProjectFileApprovalActionType = (operations: ProjectFileOperation[]) => {
  if (operations.some((operation) => operation.type === 'delete_file')) {
    return 'tool_remove';
  }

  if (operations.some((operation) => operation.type === 'edit_file')) {
    return 'tool_edit';
  }

  return 'tool_write';
};

export const buildProjectFileDecisionFeedback = (input: {
  decision: 'blocked' | 'approval-required';
  summary: string;
}) => ({
  timelineSummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
  replaySummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
});

export type PreparedProjectFileProposalFlow = {
  proposal: ProjectFileProposal;
  approvalActionType: string;
  riskLevel: ApprovalRiskLevel;
  decision: 'blocked' | 'approval-required' | 'auto-execute';
};

export const prepareProjectFileProposalFlow = (input: {
  proposalId: string;
  mode: ProjectFileOperationMode;
  plan: ProjectFileOperationPlan;
  sandboxPolicy: SandboxPolicy;
}): PreparedProjectFileProposalFlow => {
  const proposal: ProjectFileProposal = {
    id: input.proposalId,
    mode: input.mode,
    status: 'pending',
    summary: input.plan.summary.trim() || `计划执行 ${input.plan.operations.length} 项文件操作`,
    assistantMessage: input.plan.assistantMessage.trim() || input.plan.summary.trim() || '我已经整理好本次文件操作计划。',
    operations: input.plan.operations,
    executionMessage: '请确认后执行。',
  };
  const approvalActionType = buildProjectFileApprovalActionType(proposal.operations);
  const riskLevel = classifyProjectFileOperationsRisk(proposal.operations);
  const blockedBySandbox = shouldDenyRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy });
  const canAutoExecute =
    input.mode === 'auto' &&
    shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy });

  if (blockedBySandbox) {
    return {
      proposal: {
        ...proposal,
        status: 'cancelled',
        executionMessage: `当前 sandbox policy 为 ${input.sandboxPolicy}，已拦截这次高风险操作。`,
      },
      approvalActionType,
      riskLevel,
      decision: 'blocked',
    };
  }

  if (!canAutoExecute) {
    return {
      proposal: {
        ...proposal,
        status: 'pending',
        executionMessage: '需要审批后执行。',
      },
      approvalActionType,
      riskLevel,
      decision: 'approval-required',
    };
  }

  return {
    proposal: {
      ...proposal,
      status: 'executing',
      executionMessage: '系统已根据当前 sandbox policy 自动确认，正在执行。',
    },
    approvalActionType,
    riskLevel,
    decision: 'auto-execute',
  };
};
