// 文件作用：类型契约文件，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { ChatAgentId } from '../../chat/chatAgents.ts';
// 这个文件定义 runtime chat turn 协调层的输入输出合同。
// 包括请求体、结果体、外部 ports，以及等待审批/回答所需的交互接口。
// 如果你在排查“提交一轮 turn 需要准备哪些字段”，先看这里。
import type { AgentProviderId } from '../agentRuntimeTypes.ts';
import type { PermissionMode } from '../approval/approvalTypes.ts';
import type { RuntimeQuestionPayload } from '../../store/aiChatStore.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { RuntimePendingApprovalAction } from './runtimeApprovalCoordinator.ts';

// 这一组类型是 runtime chat turn 协调层的“输入/输出合同”。
// 读这份文件能先看清一次 turn 开始前需要哪些上下文，以及执行完成后会回传什么。
export type RuntimeChatTurnRequest = {
  projectId: string;
  projectName: string;
  targetSessionId: string;
  runtimeThreadId: string | null;
  providerId: AgentProviderId;
  rawUserInput: string;
  cleanedUserInput: string;
  selectedRuntimeConfigId: string | null;
  selectedRuntimeConfigName: string | null;
  contextWindowTokens: number;
  permissionMode: PermissionMode;
  selectedChatAgentId: ChatAgentId;
  fallbackToBuiltInMessage: string | null;
  activeSkills: RuntimeSkillDefinition[];
  createdAt?: number;
};

export type RuntimeChatTurnResult = {
  runId: string;
  assistantMessageId: string;
  runtimeStoreThreadId: string;
  runtimeThreadId: string;
  finalContent: string;
};

// ports 是协调器对外部世界的窄接口：
// 它不直接依赖具体实现，而是通过这些函数拿项目根、执行 prompt、持久化线程。
export type RuntimeChatTurnPorts = {
  resolveProjectRootById: (projectId: string) => Promise<string>;
  executeRuntimePrompt: (input: {
    providerId: AgentProviderId;
    sessionId: string;
    configId: string | null;
    modelOverride?: string | null;
    systemPrompt: string;
    prompt: string;
    signal?: AbortSignal;
    onEvent?: (event: { kind: 'thinking' | 'text'; delta: string }) => void;
  }) => Promise<string>;
  persistRuntimeThread: (input: {
    projectId: string;
    title: string;
    providerId: AgentProviderId;
  }) => Promise<{
    id: string;
    title: string;
    providerId: AgentProviderId;
    createdAt: number;
    updatedAt: number;
  }>;
};

export type RuntimeChatQuestionRequest = {
  assistantMessageId: string;
  question: RuntimeQuestionPayload;
};

// interactionPort 封装了“等待用户回答/审批”这类需要挂起 turn 的交互点。
export type RuntimeChatInteractionPort = {
  waitForQuestionAnswer: (input: RuntimeChatQuestionRequest) => Promise<Record<string, string>>;
  waitForApproval: (input: RuntimePendingApprovalAction) => Promise<boolean>;
};
