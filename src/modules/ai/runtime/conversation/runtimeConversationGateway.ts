import type { CanonicalEvent } from '@goodnight/runtime-protocol';
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
import { createTimelineComposer } from '../composer/timelineComposer.ts';
import type { TimelineProjection } from '../composer/timelineComposerTypes.ts';

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
    canonicalEvents: CanonicalEvent[];
    timelineProjectionByRunId: Record<string, TimelineProjection>;
    timelineProjectionByMessageId: Record<string, TimelineProjection>;
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

export type RuntimeConversationBootstrapAction =
  | { type: 'select-existing-session'; sessionId: string }
  | { type: 'noop' };

const preferSessionForRuntimeThread = (left: ChatSession, right: ChatSession) => {
  if (left.messages.length !== right.messages.length) {
    return left.messages.length > right.messages.length ? left : right;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt > right.updatedAt ? left : right;
  }

  return left.createdAt <= right.createdAt ? left : right;
};

const isLegacyEmptyDraftSession = (session: ChatSession) =>
  !session.runtimeThreadId && session.title === '新对话' && session.messages.length === 0;

const isPlaceholderWelcomeSession = (session: ChatSession) =>
  !session.runtimeThreadId &&
  session.title === '新对话' &&
  session.messages.length <= 1 &&
  session.messages.every((message) => message.role === 'assistant');

const isLegacyEmptyRuntimeThread = (thread: AgentThreadRecord) =>
  thread.title === '新对话' && thread.createdAt === thread.updatedAt;

const dedupeSessionsByRuntimeThreadId = (sessions: ChatSession[]) => {
  const sessionsByRuntimeThread = new Map<string, ChatSession>();
  const placeholderSessionsByProvider = new Map<string, ChatSession>();
  const dedupedSessions: ChatSession[] = [];
  const removedSessionIds: string[] = [];

  sessions.forEach((session) => {
    if (isLegacyEmptyDraftSession(session)) {
      removedSessionIds.push(session.id);
      return;
    }

    if (isPlaceholderWelcomeSession(session)) {
      const placeholderKey = `placeholder:${session.providerId}`;
      const existingPlaceholder = placeholderSessionsByProvider.get(placeholderKey);
      if (!existingPlaceholder) {
        placeholderSessionsByProvider.set(placeholderKey, session);
        dedupedSessions.push(session);
        return;
      }

      const preferred = preferSessionForRuntimeThread(existingPlaceholder, session);
      if (preferred !== existingPlaceholder) {
        removedSessionIds.push(existingPlaceholder.id);
        placeholderSessionsByProvider.set(placeholderKey, preferred);
        const existingIndex = dedupedSessions.findIndex((item) => item.id === existingPlaceholder.id);
        if (existingIndex >= 0) {
          dedupedSessions.splice(existingIndex, 1, preferred);
        }
        return;
      }

      removedSessionIds.push(session.id);
      return;
    }

    if (!session.runtimeThreadId) {
      dedupedSessions.push(session);
      return;
    }

    const existing = sessionsByRuntimeThread.get(session.runtimeThreadId);
    if (!existing) {
      sessionsByRuntimeThread.set(session.runtimeThreadId, session);
      dedupedSessions.push(session);
      return;
    }

    const preferred = preferSessionForRuntimeThread(existing, session);
    if (preferred !== existing) {
      removedSessionIds.push(existing.id);
      sessionsByRuntimeThread.set(session.runtimeThreadId, preferred);
      const existingIndex = dedupedSessions.findIndex((item) => item.id === existing.id);
      if (existingIndex >= 0) {
        dedupedSessions.splice(existingIndex, 1, preferred);
      }
      return;
    }

    removedSessionIds.push(session.id);
  });

  return {
    sessions: dedupedSessions,
    removedSessionIds,
  };
};

const sortCanonicalEvents = (events: CanonicalEvent[]) =>
  [...events].sort((left, right) =>
    left.runId === right.runId
      ? left.seq === right.seq
        ? left.ts - right.ts
        : left.seq - right.seq
      : left.ts - right.ts,
  );

const buildTimelineProjectionByRunId = (events: CanonicalEvent[]) => {
  const composers = new Map<string, ReturnType<typeof createTimelineComposer>>();

  for (const event of sortCanonicalEvents(events)) {
    const existing = composers.get(event.runId) || createTimelineComposer({ runId: event.runId });
    existing.append(event);
    composers.set(event.runId, existing);
  }

  return Object.fromEntries(
    Array.from(composers.entries()).map(([runId, composer]) => [runId, composer.getProjection()]),
  ) as Record<string, TimelineProjection>;
};

const buildTimelineProjectionByMessageId = (
  events: CanonicalEvent[],
  timelineProjectionByRunId: Record<string, TimelineProjection>,
) => {
  const runIdByMessageId = new Map<string, string>();

  for (const event of events) {
    if (!event.messageId) {
      continue;
    }

    if (!runIdByMessageId.has(event.messageId)) {
      runIdByMessageId.set(event.messageId, event.runId);
    }
  }

  return Object.fromEntries(
    Array.from(runIdByMessageId.entries())
      .map(([messageId, runId]) => [messageId, timelineProjectionByRunId[runId] || null] as const)
      .filter((entry): entry is [string, TimelineProjection] => Boolean(entry[1])),
  ) as Record<string, TimelineProjection>;
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
  const runtimeThreads = input.runtimeThreads.filter((thread) => !isLegacyEmptyRuntimeThread(thread));
  const runtimeThreadIds = new Set(runtimeThreads.map((thread) => thread.id));
  const initiallyDeduped = dedupeSessionsByRuntimeThreadId([...(input.sessions || [])]);
  const sessionsWithClearedStaleBindings = initiallyDeduped.sessions.map((session) =>
    session.runtimeThreadId && !runtimeThreadIds.has(session.runtimeThreadId)
      ? {
          ...session,
          runtimeThreadId: null,
          eventLog: [],
        }
      : session
  );
  const deduped = dedupeSessionsByRuntimeThreadId(sessionsWithClearedStaleBindings);
  let sessions = deduped.sessions;
  const removedSessionIds = Array.from(
    new Set([...initiallyDeduped.removedSessionIds, ...deduped.removedSessionIds]),
  );
  const bindings: Array<{ thread: AgentThreadRecord; session: ChatSession }> = [];

  runtimeThreads.forEach((thread) => {
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

  return { sessions, bindings, removedSessionIds };
};

export const resolveRuntimeConversationBootstrapAction = (input: {
  sessions: ChatSession[];
  activeSessionId: string | null;
}): RuntimeConversationBootstrapAction => {
  if (!input.activeSessionId && input.sessions[0]) {
    return {
      type: 'select-existing-session',
      sessionId: input.sessions[0].id,
    };
  }

  return { type: 'noop' };
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
  const canonicalEvents = selection.activeSession?.canonicalEvents || [];
  const timelineProjectionByRunId = buildTimelineProjectionByRunId(canonicalEvents);

  return {
    ...selection,
    ...threadIds,
    projectChatState: input.projectChatState || null,
    messages: selection.activeSession?.messages || [],
    canonicalEvents,
    timelineProjectionByRunId,
    timelineProjectionByMessageId: buildTimelineProjectionByMessageId(canonicalEvents, timelineProjectionByRunId),
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
