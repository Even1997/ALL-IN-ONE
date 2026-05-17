// 文件作用：总协调入口，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把“需要审批的运行时动作”接到审批 store 上，是审批编排层的协调器。
// 它位于纯类型 / store 之上、具体执行动作之下，专门处理 request、pending、resolve 这一段生命周期。
// 如果你在排查“审批弹出来了但后续动作没继续”或“批准后没有真正执行”，优先从这里往下看。
import type { ApprovalRecord, ApprovalRiskLevel, ApprovalStatus } from '../approval/approvalTypes.ts';

// runtimeApprovalCoordinator 是审批动作的编排薄层：
// - request 阶段负责创建审批记录，并把回调和上下文挂到 pending map。
// - resolve 阶段负责把审批状态写回 store，再触发真正的批准/拒绝后续逻辑。
export type RuntimePendingApprovalAction = {
  threadId?: string;
  runtimeStoreThreadId?: string;
  replayThreadId?: string;
  providerId?: string;
  actionType?: string;
  riskLevel?: ApprovalRiskLevel;
  summary?: string;
  toolCallId?: string | null;
  messageId?: string | null;
  onApprove: () => Promise<void>;
  onDeny?: () => void | Promise<void>;
  display?: {
    toolName?: string | null;
    command?: string | null;
    filePath?: string | null;
    oldString?: string | null;
    newString?: string | null;
    content?: string | null;
    inputJson?: string | null;
  };
};

export const requestRuntimeApproval = async (input: {
  threadId: string;
  runtimeStoreThreadId?: string;
  replayThreadId?: string;
  providerId?: string;
  actionType: string;
  riskLevel: ApprovalRiskLevel;
  summary: string;
  messageId?: string | null;
  toolCallId?: string | null;
  onApprove: () => Promise<void>;
  onDeny?: () => void | Promise<void>;
  display?: RuntimePendingApprovalAction['display'];
  enqueueAgentApproval: (payload: {
    threadId: string;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: string;
    messageId: string | null;
    toolCallId?: string | null;
  }) => Promise<ApprovalRecord>;
  enqueueApproval: (approval: ApprovalRecord) => void;
  pendingApprovalActions: Record<string, RuntimePendingApprovalAction>;
}) => {
  // 这里先向审批系统申请一个 approvalId，
  // 再把与这次审批有关的线程、消息、工具调用、展示信息都挂到内存 map 中，
  // 方便后续用户点击“批准/拒绝”时能找回完整上下文。
  const approval = await input.enqueueAgentApproval({
    threadId: input.threadId,
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    summary: input.summary,
    messageId: input.messageId || null,
    toolCallId: input.toolCallId || null,
  });

  input.enqueueApproval(approval);
  input.pendingApprovalActions[approval.id] = {
    threadId: input.threadId,
    runtimeStoreThreadId: input.runtimeStoreThreadId || input.threadId,
    replayThreadId: input.replayThreadId || input.threadId,
    providerId: input.providerId || 'built-in',
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    summary: input.summary,
    toolCallId: input.toolCallId || null,
    messageId: input.messageId || null,
    onApprove: input.onApprove,
    onDeny: input.onDeny,
    display: input.display,
  };

  return approval;
};

export const resolveRuntimeApproval = async (input: {
  approvalId: string;
  status: ApprovalStatus;
  pendingApprovalActions: Record<string, RuntimePendingApprovalAction>;
  resolveStoredApproval: (approvalId: string, status: ApprovalStatus) => void;
  resolveAgentApproval: (payload: {
    approvalId: string;
    status: ApprovalStatus;
    toolCallId?: string | null;
  }) => Promise<unknown>;
}) => {
  // resolve 顺序很重要：
  // 1. 先从 pending map 里取出上下文。
  // 2. 更新本地审批 store。
  // 3. 再通知 agent/runtime 审批结果，避免重复处理。
  const pendingAction = input.pendingApprovalActions[input.approvalId];

  input.resolveStoredApproval(input.approvalId, input.status);
  delete input.pendingApprovalActions[input.approvalId];
  const resolvePayload: {
    approvalId: string;
    status: ApprovalStatus;
    toolCallId?: string | null;
  } = {
    approvalId: input.approvalId,
    status: input.status,
  };
  if (pendingAction?.toolCallId) {
    // 审批回执继续带上 toolCallId，后续执行和投影都用结构化关联，不再反推正文。
    resolvePayload.toolCallId = pendingAction.toolCallId;
  }
  await input.resolveAgentApproval(resolvePayload);

  return pendingAction || null;
};
