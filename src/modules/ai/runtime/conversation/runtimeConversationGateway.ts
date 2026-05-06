import type { ActivityEntry } from '../../skills/activityLog.ts';
import type { ApprovalRecord } from '../approval/approvalTypes.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type {
  AgentBackgroundTaskRecord,
  AgentMemoryEntry,
  AgentReplayEvent,
  AgentThreadRecord,
} from '../agentRuntimeTypes.ts';
import type {
  AgentMemoryCandidate,
  AgentRuntimeLiveState,
  AgentRuntimeResumeRequest,
} from '../agentRuntimeStore.ts';
import type { AgentContextSnapshot } from '../context/agentContextTypes.ts';
import type { RuntimeMcpToolCall } from '../mcp/runtimeMcpTypes.ts';
import type { AgentReplayRecoveryState } from '../replay/runtimeReplayRecovery.ts';
import type { AgentTurnSession } from '../session/agentSessionTypes.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { AgentTeamRunRecord } from '../teams/teamTypes.ts';
import {
  createChatSession,
  type ChatProjectState,
  type ChatSession,
  type StoredChatMessage,
} from '../../store/aiChatStore.ts';

export type RuntimeConversationThreadIds = {
  approvalThreadId: string | null;
  checkpointThreadId: string | null;
  taskThreadId: string | null;
  liveThreadId: string | null;
};

export type RuntimeConversationSelection = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
};

export type RuntimeConversationProjection = RuntimeConversationSelection &
  RuntimeConversationThreadIds & {
    projectChatState: ChatProjectState | null;
    messages: StoredChatMessage[];
    activityEntries: ActivityEntry[];
    pendingApprovals: ApprovalRecord[];
    pendingApprovalCount: number;
    latestTurnSession: AgentTurnSession | null;
    replayResumeRequest: AgentRuntimeResumeRequest | null;
    liveState: AgentRuntimeLiveState | null;
    backgroundTasks: AgentBackgroundTaskRecord[];
    activeSkills: RuntimeSkillDefinition[];
    contextSnapshot: AgentContextSnapshot | null;
    toolCalls: RuntimeToolStep[];
    mcpToolCalls: RuntimeMcpToolCall[];
    memoryCandidates: AgentMemoryCandidate[];
    memoryEntries: AgentMemoryEntry[];
    recoveryState: AgentReplayRecoveryState | null;
    replayEvents: AgentReplayEvent[];
    teamRuns: AgentTeamRunRecord[];
    latestTeamRun: AgentTeamRunRecord | null;
  };

export const buildRuntimeConversationThreadIds = (
  activeSessionId: string | null,
  activeSession: ChatSession | null,
): RuntimeConversationThreadIds => ({
  approvalThreadId: activeSession?.runtimeThreadId || activeSessionId || null,
  checkpointThreadId: activeSession?.runtimeThreadId || activeSession?.id || null,
  taskThreadId: activeSession?.runtimeThreadId || null,
  liveThreadId: activeSessionId || null,
});

export const resolveActiveConversationSelection = (input: {
  sessions: ChatSession[];
  activeSessionId: string | null;
}): RuntimeConversationSelection => {
  const sessions = input.sessions || [];
  const activeSessionId = input.activeSessionId || sessions[0]?.id || null;
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) || sessions[0] || null;

  return {
    sessions,
    activeSessionId: activeSession?.id || activeSessionId || null,
    activeSession,
  };
};

export const reconcileRuntimeThreadsWithSessions = (input: {
  projectId: string;
  sessions: ChatSession[];
  runtimeThreads: AgentThreadRecord[];
}) => {
  const runtimeThreadIds = new Set(input.runtimeThreads.map((thread) => thread.id));
  let sessions = [...(input.sessions || [])].map((session) =>
    session.runtimeThreadId && !runtimeThreadIds.has(session.runtimeThreadId)
      ? {
          ...session,
          runtimeThreadId: null,
          eventLog: [],
        }
      : session
  );
  const bindings: Array<{ thread: AgentThreadRecord; session: ChatSession }> = [];

  input.runtimeThreads.forEach((thread) => {
    const existingSession =
      sessions.find((session) => session.runtimeThreadId === thread.id) || null;
    const baseSession =
      existingSession || createChatSession(input.projectId, thread.title || '新对话', thread.providerId);
    const syncedSession: ChatSession = {
      ...baseSession,
      title: thread.title || baseSession.title,
      providerId: thread.providerId,
      runtimeThreadId: thread.id,
      createdAt: existingSession?.createdAt || thread.createdAt,
      updatedAt: Math.max(thread.updatedAt, existingSession?.updatedAt || 0, baseSession.updatedAt),
    };

    sessions = [syncedSession, ...sessions.filter((session) => session.id !== syncedSession.id)];
    bindings.push({ thread, session: syncedSession });
  });

  return { sessions, bindings };
};

export const buildRuntimeConversationProjection = (input: {
  projectChatState?: ChatProjectState | null;
  sessions: ChatSession[];
  activeSessionId: string | null;
  activityEntries: ActivityEntry[];
  runtimeState: {
    latestTurnSession: AgentTurnSession | null;
    replayResumeRequest: AgentRuntimeResumeRequest | null;
    liveState: AgentRuntimeLiveState | null;
    backgroundTasks: AgentBackgroundTaskRecord[];
    activeSkills: RuntimeSkillDefinition[];
    contextSnapshot: AgentContextSnapshot | null;
    toolCalls: RuntimeToolStep[];
    mcpToolCalls: RuntimeMcpToolCall[];
    memoryCandidates: AgentMemoryCandidate[];
    memoryEntries: AgentMemoryEntry[];
    recoveryState?: AgentReplayRecoveryState | null;
    replayEvents?: AgentReplayEvent[];
    teamRuns?: AgentTeamRunRecord[];
  };
  pendingApprovals: ApprovalRecord[];
}): RuntimeConversationProjection => {
  const selection = resolveActiveConversationSelection({
    sessions: input.sessions,
    activeSessionId: input.activeSessionId,
  });
  const threadIds = buildRuntimeConversationThreadIds(
    selection.activeSessionId,
    selection.activeSession,
  );
  const pendingApprovals = (input.pendingApprovals || []).filter(
    (approval) => approval.status === 'pending',
  );
  const teamRuns = input.runtimeState.teamRuns || [];

  return {
    ...selection,
    ...threadIds,
    projectChatState: input.projectChatState || null,
    messages: selection.activeSession?.messages || [],
    activityEntries: input.activityEntries || [],
    pendingApprovals,
    pendingApprovalCount: pendingApprovals.length,
    latestTurnSession: input.runtimeState.latestTurnSession,
    replayResumeRequest: input.runtimeState.replayResumeRequest,
    liveState: input.runtimeState.liveState,
    backgroundTasks: input.runtimeState.backgroundTasks || [],
    activeSkills: input.runtimeState.activeSkills || [],
    contextSnapshot: input.runtimeState.contextSnapshot || null,
    toolCalls: input.runtimeState.toolCalls || [],
    mcpToolCalls: input.runtimeState.mcpToolCalls || [],
    memoryCandidates: input.runtimeState.memoryCandidates || [],
    memoryEntries: input.runtimeState.memoryEntries || [],
    recoveryState: input.runtimeState.recoveryState || null,
    replayEvents: input.runtimeState.replayEvents || [],
    teamRuns,
    latestTeamRun: teamRuns[0] || null,
  };
};
