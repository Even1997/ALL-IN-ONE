import type { ChatAgentId } from '../../chat/chatAgents.ts';
import type { AgentProviderId } from '../agentRuntimeTypes.ts';
import type { PermissionMode } from '../approval/approvalTypes.ts';
import type { RuntimeQuestionPayload } from '../../store/aiChatStore.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { RuntimePendingApprovalAction } from './runtimeApprovalCoordinator.ts';

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

export type RuntimeChatInteractionPort = {
  waitForQuestionAnswer: (input: RuntimeChatQuestionRequest) => Promise<Record<string, string>>;
  waitForApproval: (input: RuntimePendingApprovalAction) => Promise<boolean>;
};
