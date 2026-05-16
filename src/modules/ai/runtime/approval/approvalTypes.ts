// 文件作用：类型契约文件，位于runtime 审批层。
// 所在链路：负责审批记录、权限模式和审批状态事实。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// approvalTypes 定义的是聊天 runtime 内部的“审批语义模型”：
// - riskLevel 描述风险等级
// - status 描述审批当前所处状态
// - PermissionMode / SandboxPolicy 则是更偏运行策略配置
// 这个文件定义 AI runtime 的审批领域模型，是“审批事实层”的基础类型集合。
// 它只回答两件事：审批记录长什么样、审批状态如何表达；不负责具体审批流程。
// 如果你在排查“某个动作为什么一直待审批 / 审批状态显示不对”，通常先从这里确认字段语义是否对齐。
export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export type SandboxPolicy = 'allow' | 'ask' | 'deny' | 'bypass';
export type PermissionMode = 'ask' | 'plan' | 'auto' | 'bypass';

export type ApprovalRecord = {
  id: string;
  threadId: string;
  actionType: string;
  riskLevel: ApprovalRiskLevel;
  summary: string;
  status: ApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
  messageId?: string | null;
};
