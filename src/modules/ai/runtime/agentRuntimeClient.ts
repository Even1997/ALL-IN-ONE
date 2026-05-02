import { invoke } from '@tauri-apps/api/core';
import { aiService, type AITextStreamEvent } from '../core/AIService';
import { ClaudeRuntime } from '../gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../gn-agent/runtime/codex/CodexRuntime';
import type { ApprovalRecord, SandboxPolicy } from './approval/approvalTypes';
import type { AIConfigEntry } from '../store/aiConfigState';
import { toRuntimeAIConfig } from '../store/aiConfigState';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence';
import type {
  AgentMemoryEntry,
  AgentProviderId,
  AgentThreadRecord,
  AgentTimelineEvent,
} from './agentRuntimeTypes';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();
export type AgentRuntimeSettings = {
  sandboxPolicy: SandboxPolicy;
  autoResumeOnLaunch: boolean;
  persistResumeDrafts: boolean;
};

let localRuntimeSettings: AgentRuntimeSettings = {
  sandboxPolicy: 'ask',
  autoResumeOnLaunch: false,
  persistResumeDrafts: true,
};

type CreateAgentThreadInput = {
  projectId: string;
  title: string;
  providerId: AgentProviderId;
};

type SaveProjectMemoryEntryInput = {
  id?: string;
  projectId: string;
  title: string;
  summary: string;
  content: string;
};

type AppendAgentTimelineEventInput = {
  threadId: string;
  providerId: AgentProviderId;
  summary: string;
  turnId?: string;
};

type EnqueueAgentApprovalInput = {
  threadId: string;
  actionType: string;
  riskLevel: ApprovalRecord['riskLevel'];
  summary: string;
  messageId?: string | null;
};

type ResolveAgentApprovalInput = {
  approvalId: string;
  status: ApprovalRecord['status'];
};

const createLocalId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createAgentThread = async (input: CreateAgentThreadInput): Promise<AgentThreadRecord> => {
  if (!isTauriRuntimeAvailable()) {
    const now = Date.now();
    return {
      id: createLocalId('thread'),
      providerId: input.providerId,
      title: input.title,
      createdAt: now,
      updatedAt: now,
    };
  }

  return invoke<AgentThreadRecord>('create_agent_thread', { input });
};

export const listAgentThreads = async (projectId: string): Promise<AgentThreadRecord[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  return invoke<AgentThreadRecord[]>('list_agent_threads', { projectId });
};

export const appendAgentTimelineEvent = async (
  input: AppendAgentTimelineEventInput
): Promise<AgentTimelineEvent> => {
  if (!isTauriRuntimeAvailable()) {
    return {
      id: createLocalId('event'),
      threadId: input.threadId,
      providerId: input.providerId,
      summary: input.summary,
      createdAt: Date.now(),
    };
  }

  const event = await invoke<{
    id: string;
    threadId: string;
    createdAt: number;
  }>('append_agent_timeline_event', {
    input: {
      threadId: input.threadId,
      turnId: input.turnId || input.threadId,
      kind: 'message',
      payload: input.summary,
    },
  });

  return {
    id: event.id,
    threadId: event.threadId,
    providerId: input.providerId,
    summary: input.summary,
    createdAt: event.createdAt,
  };
};

export const saveProjectMemoryEntry = async (
  input: SaveProjectMemoryEntryInput
): Promise<AgentMemoryEntry> => {
  if (!isTauriRuntimeAvailable()) {
    return {
      id: input.id || createLocalId('memory'),
      threadId: null,
      label: input.title,
      content: input.content,
      createdAt: Date.now(),
    };
  }

  const entry = await invoke<{
    id: string;
    title: string;
    content: string;
    updatedAt: number;
  }>('save_project_memory_entry', { input });

  return {
    id: entry.id,
    threadId: null,
    label: entry.title,
    content: entry.content,
    createdAt: entry.updatedAt,
  };
};

export const listProjectMemoryEntries = async (projectId: string): Promise<AgentMemoryEntry[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  const entries = await invoke<Array<{ id: string; title: string; content: string; updatedAt: number }>>(
    'list_project_memory_entries',
    { projectId }
  );

  return entries.map((entry) => ({
    id: entry.id,
    threadId: null,
    label: entry.title,
    content: entry.content,
    createdAt: entry.updatedAt,
  }));
};

export const enqueueAgentApproval = async (
  input: EnqueueAgentApprovalInput
): Promise<ApprovalRecord> => {
  if (!isTauriRuntimeAvailable()) {
    return {
      id: createLocalId('approval'),
      threadId: input.threadId,
      actionType: input.actionType,
      riskLevel: input.riskLevel,
      summary: input.summary,
      status: 'pending',
      createdAt: Date.now(),
      messageId: input.messageId || null,
    };
  }

  return invoke<ApprovalRecord>('enqueue_agent_approval', { input });
};

export const resolveAgentApproval = async (
  input: ResolveAgentApprovalInput
): Promise<ApprovalRecord> => {
  if (!isTauriRuntimeAvailable()) {
    return {
      id: input.approvalId,
      threadId: '',
      actionType: 'local_only',
      riskLevel: 'low',
      summary: '',
      status: input.status,
      createdAt: Date.now(),
      messageId: null,
    };
  }

  return invoke<ApprovalRecord>('resolve_agent_approval', { input });
};

export const listAgentApprovals = async (threadId: string): Promise<ApprovalRecord[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  return invoke<ApprovalRecord[]>('list_agent_approvals', { threadId });
};

export const getAgentSandboxPolicy = async (): Promise<SandboxPolicy> => {
  return (await getAgentRuntimeSettings()).sandboxPolicy;
};

export const setAgentSandboxPolicy = async (policy: SandboxPolicy): Promise<SandboxPolicy> => {
  return (await updateAgentRuntimeSettings({ sandboxPolicy: policy })).sandboxPolicy;
};

export const getAgentRuntimeSettings = async (): Promise<AgentRuntimeSettings> => {
  if (!isTauriRuntimeAvailable()) {
    return localRuntimeSettings;
  }

  return invoke<AgentRuntimeSettings>('get_agent_runtime_settings');
};

export const updateAgentRuntimeSettings = async (
  input: Partial<AgentRuntimeSettings>
): Promise<AgentRuntimeSettings> => {
  if (!isTauriRuntimeAvailable()) {
    localRuntimeSettings = {
      ...localRuntimeSettings,
      ...input,
    };
    return localRuntimeSettings;
  }

  return invoke<AgentRuntimeSettings>('update_agent_runtime_settings', { input });
};

export const executePrompt = async (options: {
  providerId: AgentProviderId;
  sessionId: string;
  config: AIConfigEntry | null;
  systemPrompt: string;
  prompt: string;
  onChunk?: (text: string) => void;
  onEvent?: (event: AITextStreamEvent) => void;
}) => {
  const { providerId, sessionId, config, systemPrompt, prompt, onChunk, onEvent } = options;

  if (providerId === 'claude' && config) {
    return claudeRuntime.executePrompt({
      sessionId,
      config,
      systemPrompt,
      prompt,
      onChunk,
      onEvent,
    });
  }

  if (providerId === 'codex' && config) {
    return codexRuntime.executePrompt({
      sessionId,
      config,
      systemPrompt,
      prompt,
      onChunk,
      onEvent,
    });
  }

  const previousConfig = aiService.getConfig();
  if (config) {
    aiService.setConfig(toRuntimeAIConfig(config));
  }

  try {
    return await aiService.completeText({
      systemPrompt,
      prompt,
      onChunk,
      onEvent,
    });
  } finally {
    if (config) {
      aiService.setConfig(previousConfig);
    }
  }
};
