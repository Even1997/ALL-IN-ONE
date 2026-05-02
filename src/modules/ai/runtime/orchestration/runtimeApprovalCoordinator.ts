import type { ApprovalRecord, ApprovalRiskLevel, ApprovalStatus } from '../approval/approvalTypes.ts';

export type RuntimePendingApprovalAction = {
  onApprove: () => Promise<void>;
  onDeny?: () => void | Promise<void>;
};

export const requestRuntimeApproval = async (input: {
  threadId: string;
  actionType: string;
  riskLevel: ApprovalRiskLevel;
  summary: string;
  messageId?: string | null;
  onApprove: () => Promise<void>;
  onDeny?: () => void | Promise<void>;
  enqueueAgentApproval: (payload: {
    threadId: string;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: string;
    messageId: string | null;
  }) => Promise<ApprovalRecord>;
  enqueueApproval: (approval: ApprovalRecord) => void;
  pendingApprovalActions: Record<string, RuntimePendingApprovalAction>;
}) => {
  const approval = await input.enqueueAgentApproval({
    threadId: input.threadId,
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    summary: input.summary,
    messageId: input.messageId || null,
  });

  input.enqueueApproval(approval);
  input.pendingApprovalActions[approval.id] = {
    onApprove: input.onApprove,
    onDeny: input.onDeny,
  };

  return approval;
};

export const resolveRuntimeApproval = async (input: {
  approvalId: string;
  status: ApprovalStatus;
  pendingApprovalActions: Record<string, RuntimePendingApprovalAction>;
  resolveStoredApproval: (approvalId: string, status: ApprovalStatus) => void;
  resolveAgentApproval: (payload: { approvalId: string; status: ApprovalStatus }) => Promise<unknown>;
}) => {
  const pendingAction = input.pendingApprovalActions[input.approvalId];

  input.resolveStoredApproval(input.approvalId, input.status);
  delete input.pendingApprovalActions[input.approvalId];
  await input.resolveAgentApproval({
    approvalId: input.approvalId,
    status: input.status,
  });

  return pendingAction || null;
};
