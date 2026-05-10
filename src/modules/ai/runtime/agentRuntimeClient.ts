import { invoke } from '@tauri-apps/api/core';
import { aiService, type AITextStreamEvent } from '../core/AIService';
import { ClaudeRuntime } from '../gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../gn-agent/runtime/codex/CodexRuntime';
import type { ApprovalRecord, PermissionMode, SandboxPolicy } from './approval/approvalTypes';
import { permissionModeToSandboxPolicy } from './approval/permissionMode';
import { ensureDesktopRuntimeSidecar } from '../../runtime-sidecar/desktopRuntimeSidecar.ts';
import type { AIConfigEntry } from '../store/aiConfigState';
import { toRuntimeAIConfig } from '../store/aiConfigState';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence';
import type {
  AgentBackgroundTaskRecord,
  AgentMemoryEntry,
  AgentProviderId,
  AgentTurnCheckpointDiff,
  AgentTurnCheckpointRecord,
  AgentTurnRewindResult,
  AgentThreadRecord,
  AgentTimelineEvent,
} from './agentRuntimeTypes';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();
export type AgentRuntimeSettings = {
  sandboxPolicy: SandboxPolicy;
  permissionMode: PermissionMode;
  autoResumeOnLaunch: boolean;
  persistResumeDrafts: boolean;
};

let localRuntimeSettings: AgentRuntimeSettings = {
  sandboxPolicy: 'ask',
  permissionMode: 'ask',
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

type SaveAgentTurnCheckpointInput = {
  threadId: string;
  runId: string;
  messageId?: string | null;
  summary: string;
  files: Array<{
    path: string;
    beforeContent?: string | null;
    afterContent?: string | null;
  }>;
};

type RewindAgentTurnInput = {
  threadId: string;
  runId: string;
  projectRoot: string;
};

type UpsertAgentBackgroundTaskInput = {
  id?: string;
  threadId: string;
  runKind: string;
  title: string;
  status: string;
  summary: string;
  payloadJson: string;
  createdAt?: number;
};

const createLocalId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const buildLocalTimelineEvent = (input: AppendAgentTimelineEventInput): AgentTimelineEvent => ({
  id: createLocalId('event'),
  threadId: input.threadId,
  providerId: input.providerId,
  summary: input.summary,
  createdAt: Date.now(),
});

const shouldBypassLegacyTimelinePersistence = (
  threadId: string,
  error: unknown,
) => threadId.startsWith('session_') && String(error).includes('Agent thread not found');

const mapRuntimeSidecarCheckpoint = (checkpoint: {
  id: string;
  sessionId: string;
  runId: string;
  messageId: string | null;
  summary: string;
  filesChanged: AgentTurnCheckpointRecord['filesChanged'];
  insertions: number;
  deletions: number;
  createdAt: number;
  updatedAt: number;
}): AgentTurnCheckpointRecord => ({
  id: checkpoint.id,
  threadId: checkpoint.sessionId,
  runId: checkpoint.runId,
  messageId: checkpoint.messageId,
  summary: checkpoint.summary,
  filesChanged: checkpoint.filesChanged,
  insertions: checkpoint.insertions,
  deletions: checkpoint.deletions,
  createdAt: checkpoint.createdAt,
  updatedAt: checkpoint.updatedAt,
});

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
    return buildLocalTimelineEvent(input);
  }

  try {
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
  } catch (error) {
    if (shouldBypassLegacyTimelinePersistence(input.threadId, error)) {
      return buildLocalTimelineEvent(input);
    }

    throw error;
  }
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

export const setAgentPermissionMode = async (mode: PermissionMode): Promise<PermissionMode> => {
  return (
    await updateAgentRuntimeSettings({
      permissionMode: mode,
      sandboxPolicy: permissionModeToSandboxPolicy(mode),
    })
  ).permissionMode;
};

export const getAgentRuntimeSettings = async (): Promise<AgentRuntimeSettings> => {
  if (!isTauriRuntimeAvailable()) {
    return localRuntimeSettings;
  }

  return invoke<AgentRuntimeSettings>('get_agent_runtime_settings');
};

const updateAgentRuntimeSettings = async (
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

export const saveAgentTurnCheckpoint = async (
  input: SaveAgentTurnCheckpointInput
): Promise<AgentTurnCheckpointRecord | null> => {
  if (!isTauriRuntimeAvailable() || input.files.length === 0) {
    return null;
  }

  return invoke<AgentTurnCheckpointRecord>('save_agent_turn_checkpoint', { input });
};

export const listAgentTurnCheckpoints = async (
  threadId: string
): Promise<AgentTurnCheckpointRecord[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  const sidecar = await ensureDesktopRuntimeSidecar();
  if (sidecar) {
    return (await sidecar.listCheckpoints(threadId)).map(mapRuntimeSidecarCheckpoint);
  }

  return invoke<AgentTurnCheckpointRecord[]>('list_agent_turn_checkpoints', { threadId });
};

export const getAgentTurnCheckpointDiff = async (input: {
  threadId: string;
  runId: string;
  path: string;
}): Promise<AgentTurnCheckpointDiff> => {
  const sidecar = isTauriRuntimeAvailable() ? await ensureDesktopRuntimeSidecar() : null;
  if (sidecar) {
    const diff = await sidecar.getCheckpointDiff({
      sessionId: input.threadId,
      runId: input.runId,
      path: input.path,
    });
    return {
      checkpointId: diff.checkpointId,
      threadId: diff.sessionId,
      runId: diff.runId,
      path: diff.path,
      changeType: diff.changeType,
      beforeContent: diff.beforeContent,
      afterContent: diff.afterContent,
      diff: diff.diff,
      insertions: diff.insertions,
      deletions: diff.deletions,
      createdAt: diff.createdAt,
    };
  }

  return invoke<AgentTurnCheckpointDiff>('get_agent_turn_checkpoint_diff', input);
};

export const rewindAgentTurn = async (
  input: RewindAgentTurnInput
): Promise<AgentTurnRewindResult> => {
  const sidecar = isTauriRuntimeAvailable() ? await ensureDesktopRuntimeSidecar() : null;
  if (sidecar) {
    const checkpoints = await sidecar.listCheckpoints(input.threadId);
    const checkpoint = checkpoints.find((entry) => entry.runId === input.runId) || null;
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for run ${input.runId}`);
    }

    const result = await sidecar.rewindCheckpoint({
      sessionId: input.threadId,
      checkpointId: checkpoint.id,
    });
    return {
      threadId: result.sessionId,
      runId: result.runId,
      restoredPaths: result.restoredPaths,
      removedRunIds: result.removedRunIds,
      checkpointCount: result.checkpointCount,
      rewoundAt: result.rewoundAt,
    };
  }

  return invoke<AgentTurnRewindResult>('rewind_agent_turn', { input });
};

export const upsertAgentBackgroundTask = async (
  input: UpsertAgentBackgroundTaskInput
): Promise<AgentBackgroundTaskRecord> => {
  if (!isTauriRuntimeAvailable()) {
    const now = Date.now();
    return {
      id: input.id || createLocalId('task'),
      threadId: input.threadId,
      runKind: input.runKind,
      title: input.title,
      status: input.status,
      summary: input.summary,
      payloadJson: input.payloadJson,
      createdAt: input.createdAt || now,
      updatedAt: now,
    };
  }

  return invoke<AgentBackgroundTaskRecord>('upsert_agent_background_task', { input });
};

export const listAgentBackgroundTasks = async (
  threadId: string
): Promise<AgentBackgroundTaskRecord[]> => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  return invoke<AgentBackgroundTaskRecord[]>('list_agent_background_tasks', { threadId });
};

export const executePrompt = async (options: {
  providerId: AgentProviderId;
  sessionId: string;
  config: AIConfigEntry | null;
  systemPrompt: string;
  prompt: string;
  onChunk?: (text: string) => void;
  onEvent?: (event: AITextStreamEvent) => void;
  signal?: AbortSignal;
}) => {
  const { providerId, sessionId, config, systemPrompt, prompt, onChunk, onEvent, signal } = options;

  if (providerId === 'claude' && config) {
    return claudeRuntime.executePrompt({
      sessionId,
      config,
      systemPrompt,
      prompt,
      onChunk,
      onEvent,
      signal,
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
      signal,
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
      signal,
    });
  } finally {
    if (config) {
      aiService.setConfig(previousConfig);
    }
  }
};
