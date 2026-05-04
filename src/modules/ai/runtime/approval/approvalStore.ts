import { create } from 'zustand';
import type { ApprovalRecord, ApprovalStatus, PermissionMode, SandboxPolicy } from './approvalTypes';

const sortApprovals = (approvals: ApprovalRecord[]) =>
  [...approvals].sort((left, right) => right.createdAt - left.createdAt);

type ApprovalStoreState = {
  approvalsByThread: Record<string, ApprovalRecord[]>;
  sandboxPolicy: SandboxPolicy;
  permissionMode: PermissionMode;
  setThreadApprovals: (threadId: string, approvals: ApprovalRecord[]) => void;
  enqueueApproval: (approval: ApprovalRecord) => void;
  resolveApproval: (approvalId: string, status: ApprovalStatus) => void;
  setSandboxPolicy: (policy: SandboxPolicy) => void;
  setPermissionMode: (mode: PermissionMode) => void;
};

export const useApprovalStore = create<ApprovalStoreState>((set) => ({
  approvalsByThread: {},
  sandboxPolicy: 'ask',
  permissionMode: 'ask',

  setThreadApprovals: (threadId, approvals) =>
    set((state) => ({
      approvalsByThread: {
        ...state.approvalsByThread,
        [threadId]: sortApprovals(approvals),
      },
    })),

  enqueueApproval: (approval) =>
    set((state) => ({
      approvalsByThread: {
        ...state.approvalsByThread,
        [approval.threadId]: sortApprovals([
          approval,
          ...(state.approvalsByThread[approval.threadId] || []).filter(
            (existing) => existing.id !== approval.id,
          ),
        ]),
      },
    })),

  resolveApproval: (approvalId, status) =>
    set((state) => ({
      approvalsByThread: Object.fromEntries(
        Object.entries(state.approvalsByThread).map(([threadId, approvals]) => [
          threadId,
          approvals.map((approval) =>
            approval.id === approvalId ? { ...approval, status } : approval,
          ),
        ]),
      ),
    })),

  setSandboxPolicy: (policy) => set({ sandboxPolicy: policy }),
  setPermissionMode: (mode) => set({ permissionMode: mode }),
}));
