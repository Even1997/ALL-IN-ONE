import type {
  ProjectFileOperation,
  ProjectFileOperationPlan,
  ProjectFileOperationMode,
  ProjectFileProposal,
} from '../../chat/projectFileOperations.ts';
import type { AgentTurnPlan } from '../session/agentSessionTypes.ts';
import { buildProjectFilePlanningPrompt } from '../../chat/projectFilePlanningPrompt.ts';
import {
  classifyProjectFileOperationsRisk,
  shouldAutoApproveRuntimeAction,
  shouldDenyRuntimeAction,
} from '../approval/riskPolicy.ts';
import type { ApprovalRiskLevel, SandboxPolicy } from '../approval/approvalTypes.ts';
import type { ApprovalRecord } from '../approval/approvalTypes.ts';
import { requestRuntimeApproval, type RuntimePendingApprovalAction } from './runtimeApprovalCoordinator.ts';

export const buildProjectFileApprovalActionType = (operations: ProjectFileOperation[]) => {
  if (operations.some((operation) => operation.type === 'delete_file')) {
    return 'tool_remove';
  }

  if (operations.some((operation) => operation.type === 'edit_file')) {
    return 'tool_edit';
  }

  return 'tool_write';
};

export const buildRuntimeProjectFileReadSystemPrompt = (projectName: string, projectRoot: string) => `你是 ${projectName} 的项目文件阅读助手。
当前项目根目录是 ${projectRoot}。
你可以使用 glob、grep、ls、view 这四个只读工具来帮助回答用户关于项目文件的问题。
不要尝试 write、edit、remove 之类的写工具。
先查看必要文件，再用简洁中文回答。`;

export const executeRuntimeProjectFileRead = async (input: {
  userInput: string;
  projectName: string;
  projectRoot: string;
  allowedTools: string[];
  readFiles: (payload: {
    prompt: string;
    systemPrompt: string;
    allowedTools: string[];
  }) => Promise<string>;
}) => {
  const response = await input.readFiles({
    prompt: input.userInput,
    systemPrompt: buildRuntimeProjectFileReadSystemPrompt(input.projectName, input.projectRoot),
    allowedTools: input.allowedTools,
  });

  return response.trim() || '已读取相关文件，但这次没有返回内容。';
};

export const buildRuntimeProjectFilePlanningSystemPrompt = (projectName: string, projectRoot: string) => `你是 ${projectName} 的项目文件助手。
你只能规划当前项目根目录内的文本文件操作，根目录是 ${projectRoot}。
你可以使用只读工具 glob、grep、ls、view 来查看目录和文件，但绝不能尝试 write、edit、remove。

你必须只返回合法 JSON，对象结构如下：
{
  "status": "ready" | "needs_clarification" | "reject",
  "assistantMessage": "string",
  "summary": "string",
  "operations": [
    {
      "type": "create_file" | "edit_file" | "delete_file",
      "targetPath": "相对路径，优先使用相对项目根目录的路径",
      "summary": "本次操作摘要",
      "content": "create_file 或全量 edit_file 时需要",
      "oldString": "局部替换 edit_file 时需要",
      "newString": "局部替换 edit_file 时需要"
    }
  ]
}

规则：
1. 查询和读取不属于这个 JSON 规划范围，只有写操作才返回 operations。
2. 如果信息不足，返回 status = "needs_clarification"。
3. 不要规划目录删除。
4. 不要规划二进制文件写改删。
5. create_file 不能把已存在文件静默当作新建覆盖。
6. 只返回 JSON，不要返回 Markdown。`;

export const buildProjectFileDecisionFeedback = (input: {
  decision: 'blocked' | 'approval-required';
  summary: string;
}) => ({
  timelineSummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
  replaySummary: `${input.decision === 'blocked' ? 'Sandbox denied' : 'Approval required'}: ${input.summary}`,
});

type RuntimeProjectFileDecisionState = ReturnType<typeof buildProjectFileDecisionState>;

export const resolveRuntimeProjectFileDecisionFeedback = (input: {
  decisionState: RuntimeProjectFileDecisionState;
  summary: string;
}) => ({
  timelineSummary: input.decisionState?.feedback.timelineSummary || input.summary,
  replaySummary: input.decisionState?.feedback.replaySummary || input.summary,
  blockedReason: input.decisionState?.blockedReason || input.summary,
  blockedActionLabel: input.decisionState?.blockedActionLabel || 'Revise file changes',
  deniedReason: input.decisionState?.deniedReason || 'Project file changes were denied.',
  deniedActionLabel: input.decisionState?.deniedActionLabel || 'Revise file changes',
});

export const executeRuntimeProjectFilePlanning = async (input: {
  userInput: string;
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  projectName: string;
  projectRoot: string;
  allowedTools: string[];
  executePlanning: (payload: {
    prompt: string;
    systemPrompt: string;
    allowedTools: string[];
  }) => Promise<string>;
  parsePlan: (raw: string) => ProjectFileOperationPlan;
}) => {
  const planResponse = await input.executePlanning({
    prompt: buildProjectFilePlanningPrompt({
      userInput: input.userInput,
      conversationHistory: input.conversationHistory,
    }),
    systemPrompt: buildRuntimeProjectFilePlanningSystemPrompt(input.projectName, input.projectRoot),
    allowedTools: input.allowedTools,
  });
  const plan = input.parsePlan(planResponse);

  if (plan.status !== 'ready' || plan.operations.length === 0) {
    return {
      status: 'needs_clarification' as const,
      message:
        plan.assistantMessage.trim() || plan.summary.trim() || '这次还不能安全执行文件操作，请补充更明确的路径和内容。',
      plan,
    };
  }

  return {
    status: 'ready' as const,
    plan,
  };
};

export const buildProjectFileDecisionState = (input: {
  decision: PreparedProjectFileProposalFlow['decision'];
  summary: string;
}) => {
  if (input.decision === 'blocked') {
    return {
      approvalStatus: 'denied' as const,
      feedback: buildProjectFileDecisionFeedback({
        decision: 'blocked',
        summary: input.summary,
      }),
      blockedReason: input.summary,
      blockedActionLabel: 'Revise file changes',
    };
  }

  if (input.decision === 'approval-required') {
    return {
      approvalStatus: 'pending' as const,
      feedback: buildProjectFileDecisionFeedback({
        decision: 'approval-required',
        summary: input.summary,
      }),
      deniedReason: 'Project file changes were denied.',
      deniedActionLabel: 'Revise file changes',
    };
  }

  return null;
};

export type PreparedProjectFileProposalFlow = {
  proposal: ProjectFileProposal;
  approvalActionType: string;
  riskLevel: ApprovalRiskLevel;
  decision: 'blocked' | 'approval-required' | 'auto-execute';
};

export const denyRuntimeProjectFileApproval = async (input: {
  threadId: string;
  actionType: string;
  riskLevel: ApprovalRiskLevel;
  summary: string;
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
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    summary: input.summary,
    messageId: input.messageId || null,
  });

  input.enqueueApproval(approval);
  input.resolveStoredApproval(approval.id, 'denied');
  await input.resolveAgentApproval({ approvalId: approval.id, status: 'denied' });

  return approval;
};

export const requestRuntimeProjectFileApproval = async (input: {
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
}) =>
  requestRuntimeApproval({
    threadId: input.threadId,
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    summary: input.summary,
    messageId: input.messageId,
    onApprove: input.onApprove,
    onDeny: input.onDeny,
    enqueueAgentApproval: input.enqueueAgentApproval,
    enqueueApproval: input.enqueueApproval,
    pendingApprovalActions: input.pendingApprovalActions,
  });

export const handleRuntimeProjectFileDecision = async (input: {
  decision: PreparedProjectFileProposalFlow['decision'];
  onBlocked: () => Promise<void>;
  onApprovalRequired: () => Promise<void>;
  onAutoExecute: () => Promise<void>;
}) => {
  if (input.decision === 'blocked') {
    await input.onBlocked();
    return 'blocked' as const;
  }

  if (input.decision === 'approval-required') {
    await input.onApprovalRequired();
    return 'approval-required' as const;
  }

  await input.onAutoExecute();
  return 'auto-execute' as const;
};

export const buildRuntimeProjectFilePlan = (input: {
  turnId: string;
  operationMode: ProjectFileOperationMode;
  summary: string;
}): AgentTurnPlan => ({
  summary: input.summary,
  reason: 'project-file-flow',
  riskLevel: input.operationMode === 'auto' ? 'high' : 'medium',
  approvalStatus: input.operationMode === 'auto' ? 'approved' : 'pending',
  affectedPaths: [],
  steps: [
    {
      id: `${input.turnId}_file-plan`,
      title: 'Plan file changes',
      kind: 'file',
      summary: 'Generate a structured file-change proposal before writing files.',
      needsApproval: false,
      expectedResult: 'A safe file operation proposal.',
    },
    {
      id: `${input.turnId}_file-apply`,
      title: 'Apply file changes',
      kind: 'approval',
      summary: 'Wait for approval when required, then apply the planned changes.',
      needsApproval: input.operationMode !== 'auto',
      expectedResult: 'Updated project files or a resumable block.',
    },
  ],
});

export const applyRuntimeProjectFileProposalToPlan = (input: {
  plan: AgentTurnPlan | null;
  proposal: ProjectFileProposal;
  riskLevel: ApprovalRiskLevel;
  approvalStatus?: AgentTurnPlan['approvalStatus'] | null;
}) =>
  input.plan
    ? {
        ...input.plan,
        summary: input.proposal.summary,
        riskLevel: input.riskLevel,
        approvalStatus: input.approvalStatus || input.plan.approvalStatus,
        affectedPaths: input.proposal.operations.map((operation) => operation.targetPath),
      }
    : input.plan;

export const updateRuntimeProjectFilePlanApprovalStatus = (
  plan: AgentTurnPlan | null,
  approvalStatus: AgentTurnPlan['approvalStatus']
) =>
  plan
    ? {
        ...plan,
        approvalStatus,
      }
    : plan;

export const buildRuntimeProjectFileAutoExecuteSummary = (requestSummary: string) =>
  `File operation flow completed: ${requestSummary}`;

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
