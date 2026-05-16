// 文件作用：状态仓库，位于runtime 审批层。
// 所在链路：负责审批记录、权限模式和审批状态事实。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个 store 负责保存 runtime 审批记录以及当前权限模式。
// UI 会从这里读取待审批项，而真正的审批编排和副作用由 orchestration 层处理。
// 如果你在排查“审批状态为什么和界面不同步”，先看这里。
import { create } from 'zustand';
import type { ApprovalRecord, ApprovalStatus, PermissionMode, SandboxPolicy } from './approvalTypes';

// approvalStore 负责管理“按线程分组的审批记录”和全局权限模式。
// 它是 UI 查询待审批项的直接来源，不负责真正的批准/拒绝副作用编排。
const sortApprovals = (approvals: ApprovalRecord[]) =>
  [...approvals].sort((left, right) => right.createdAt - left.createdAt);

type ApprovalStoreState = {
  approvalsByThread: Record<string, ApprovalRecord[]>;
  sandboxPolicy: SandboxPolicy;
  permissionMode: PermissionMode;
  setThreadApprovals: (threadId: string, approvals: ApprovalRecord[]) => void;
  clearThreadApprovals: (threadId: string) => void;
  enqueueApproval: (approval: ApprovalRecord) => void;
  resolveApproval: (approvalId: string, status: ApprovalStatus, resolvedAt?: number) => void;
  setSandboxPolicy: (policy: SandboxPolicy) => void;
  setPermissionMode: (mode: PermissionMode) => void;
};

export const useApprovalStore = create<ApprovalStoreState>((set) => ({
  approvalsByThread: {},
  sandboxPolicy: 'ask',
  permissionMode: 'ask',

  // 用 sidecar / snapshot 全量同步某个线程的审批列表时，走这个入口。
  setThreadApprovals: (threadId, approvals) =>
    set((state) => ({
      approvalsByThread: {
        ...state.approvalsByThread,
        [threadId]: sortApprovals(approvals),
      },
    })),

  clearThreadApprovals: (threadId) =>
    set((state) => ({
      approvalsByThread: Object.fromEntries(
        Object.entries(state.approvalsByThread).filter(([key]) => key !== threadId),
      ),
    })),

  // 新审批通常是增量插入，而且要按 createdAt 倒序稳定展示。
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

  // resolve 只更新状态和时间戳；
  // 真正的“批准后继续执行什么”在 orchestration 层完成。
  resolveApproval: (approvalId, status, resolvedAt) =>
    set((state) => ({
      approvalsByThread: Object.fromEntries(
        Object.entries(state.approvalsByThread).map(([threadId, approvals]) => [
          threadId,
          approvals.map((approval) =>
            approval.id === approvalId
              ? { ...approval, status, resolvedAt: resolvedAt ?? approval.resolvedAt ?? Date.now() }
              : approval,
          ),
        ]),
      ),
    })),

  setSandboxPolicy: (policy) => set({ sandboxPolicy: policy }),
  setPermissionMode: (mode) => set({ permissionMode: mode }),
}));
