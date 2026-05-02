export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export type SandboxPolicy = 'allow' | 'ask' | 'deny';

export type ApprovalRecord = {
  id: string;
  threadId: string;
  actionType: string;
  riskLevel: ApprovalRiskLevel;
  summary: string;
  status: ApprovalStatus;
  createdAt: number;
  messageId?: string | null;
};
