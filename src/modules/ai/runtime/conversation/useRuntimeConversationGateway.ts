import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ActivityEntry } from '../../skills/activityLog.ts';
import type {
  AgentBackgroundTaskRecord,
  AgentMemoryEntry,
  AgentReplayEvent,
  AgentThreadRecord,
} from '../agentRuntimeTypes.ts';
import { useAgentRuntimeStore } from '../agentRuntimeStore.ts';
import type { AgentMemoryCandidate } from '../agentRuntimeStore.ts';
import { useRuntimeMcpStore } from '../mcp/runtimeMcpStore.ts';
import type { RuntimeMcpToolCall } from '../mcp/runtimeMcpTypes.ts';
import { getLatestTurnSession } from '../session/agentSessionSelectors.ts';
import { useApprovalStore } from '../approval/approvalStore.ts';
import type { ApprovalRecord } from '../approval/approvalTypes.ts';
import { useProjectStore } from '../../../../store/projectStore';
import { useAIChatStore } from '../../store/aiChatStore.ts';
import {
  buildRuntimeConversationProjection,
  buildRuntimeConversationThreadIds,
  resolveActiveConversationSelection,
  type RuntimeConversationProjection,
} from './runtimeConversationGateway.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { AgentTeamRunRecord } from '../teams/teamTypes.ts';
import type { ChatSession, StoredChatMessage } from '../../store/aiChatStore.ts';

const EMPTY_MESSAGES: StoredChatMessage[] = [];
const EMPTY_ACTIVITY_ENTRIES: ActivityEntry[] = [];
const EMPTY_SESSIONS: ChatSession[] = [];
const EMPTY_THREADS: AgentThreadRecord[] = [];
const EMPTY_MEMORY_ENTRIES: AgentMemoryEntry[] = [];
const EMPTY_BACKGROUND_TASKS: AgentBackgroundTaskRecord[] = [];
const EMPTY_ACTIVE_SKILLS: RuntimeSkillDefinition[] = [];
const EMPTY_TOOL_CALLS: RuntimeToolStep[] = [];
const EMPTY_MEMORY_CANDIDATES: AgentMemoryCandidate[] = [];
const EMPTY_REPLAY_EVENTS: AgentReplayEvent[] = [];
const EMPTY_TEAM_RUNS: AgentTeamRunRecord[] = [];
const EMPTY_MCP_TOOL_CALLS: RuntimeMcpToolCall[] = [];
const EMPTY_APPROVALS: ApprovalRecord[] = [];
const EMPTY_RUN_STATE_SIGNALS = {
  pendingQuestionSummary: null as string | null,
  statusVerb: '',
};

const useActiveConversationBase = (input?: {
  projectId?: string | null;
}) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectId = input?.projectId ?? currentProject?.id ?? null;
  const projectChatState = useAIChatStore(
    useShallow((state) => (projectId ? state.projects[projectId] || null : null)),
  );
  const sessions = projectChatState?.sessions || EMPTY_SESSIONS;
  const activityEntries = projectChatState?.activityEntries || EMPTY_ACTIVITY_ENTRIES;
  const selection = useMemo(
    () =>
      resolveActiveConversationSelection({
        sessions,
        activeSessionId: projectChatState?.activeSessionId || null,
      }),
    [projectChatState?.activeSessionId, sessions],
  );
  const threadIds = useMemo(
    () => buildRuntimeConversationThreadIds(selection.activeSessionId, selection.activeSession),
    [selection.activeSession, selection.activeSessionId],
  );

  return { projectId, projectChatState, sessions, activityEntries, selection, threadIds };
};

type ActiveConversationBase = ReturnType<typeof useActiveConversationBase>;

const useActiveConversationSelectionSlice = (base: ActiveConversationBase) => ({
  projectId: base.projectId,
  projectChatState: base.projectChatState,
  sessions: base.sessions,
  activeSessionId: base.selection.activeSessionId,
  activeSession: base.selection.activeSession,
  ...base.threadIds,
});

const useActiveConversationMessagesSlice = (base: ActiveConversationBase) => ({
  messages: base.selection.activeSession?.messages || EMPTY_MESSAGES,
  activityEntries: base.activityEntries,
});

const useActiveConversationLiveStateSlice = (base: ActiveConversationBase) => {
  const latestTurnSession = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? getLatestTurnSession(state.sessionsByThread[base.selection.activeSessionId]) || null
      : null,
  );
  const liveState = useAgentRuntimeStore((state) =>
    base.threadIds.liveThreadId ? state.liveStateByThread[base.threadIds.liveThreadId] || null : null,
  );
  const replayResumeRequest = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? state.resumeRequestsByThread[base.selection.activeSessionId] || null
      : null,
  );

  return {
    liveThreadId: base.threadIds.liveThreadId,
    latestTurnSession,
    liveState,
    replayResumeRequest,
  };
};

const useActiveConversationRunStateSignalsSlice = (base: ActiveConversationBase) =>
  useAgentRuntimeStore(
    useShallow((state) => {
      const liveState =
        base.threadIds.liveThreadId ? state.liveStateByThread[base.threadIds.liveThreadId] || null : null;

      return liveState
        ? {
            pendingQuestionSummary: liveState.pendingQuestionSummary,
            statusVerb: liveState.statusVerb,
          }
        : EMPTY_RUN_STATE_SIGNALS;
    }),
  );

const useActiveConversationApprovalsSlice = (base: ActiveConversationBase) => {
  const approvalThreadId = base.threadIds.approvalThreadId;
  const selectApprovals = (state: ReturnType<typeof useApprovalStore.getState>) =>
    approvalThreadId ? state.approvalsByThread[approvalThreadId] || EMPTY_APPROVALS : EMPTY_APPROVALS;
  const approvals = useApprovalStore(selectApprovals);
  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === 'pending'),
    [approvals],
  );

  return {
    approvalThreadId,
    pendingApprovals,
    pendingApprovalCount: pendingApprovals.length,
  };
};

const useActiveConversationTasksSlice = (base: ActiveConversationBase) => {
  const backgroundTasks = useAgentRuntimeStore((state) =>
    base.threadIds.liveThreadId
      ? state.backgroundTasksByThread[base.threadIds.liveThreadId] || EMPTY_BACKGROUND_TASKS
      : EMPTY_BACKGROUND_TASKS,
  );
  const teamRuns = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? state.teamRunsByThread[base.selection.activeSessionId] || EMPTY_TEAM_RUNS
      : EMPTY_TEAM_RUNS,
  );

  return {
    taskThreadId: base.threadIds.taskThreadId,
    backgroundTasks,
    teamRuns,
    latestTeamRun: teamRuns[0] || null,
  };
};

const useActiveConversationSkillsAndRecoverySlice = (base: ActiveConversationBase) => {
  const activeSkills = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? state.activeSkillsByThread[base.selection.activeSessionId] || EMPTY_ACTIVE_SKILLS
      : EMPTY_ACTIVE_SKILLS,
  );
  const recoveryState = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId ? state.recoveryByThread[base.selection.activeSessionId] || null : null,
  );
  const replayEvents = useAgentRuntimeStore((state) =>
    base.selection.activeSession?.runtimeThreadId
      ? state.replayEventsByThread[base.selection.activeSession.runtimeThreadId] || EMPTY_REPLAY_EVENTS
      : EMPTY_REPLAY_EVENTS,
  );

  return {
    activeSkills,
    recoveryState,
    replayEvents,
  };
};

export const useActiveConversationSelection = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationSelectionSlice(base);
};

export const useActiveConversationMessages = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationMessagesSlice(base);
};

export const useActiveConversationLiveState = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationLiveStateSlice(base);
};

export const useActiveConversationRunStateSignals = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationRunStateSignalsSlice(base);
};

export const useActiveConversationApprovals = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationApprovalsSlice(base);
};

export const useActiveConversationTasks = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationTasksSlice(base);
};

export const useActiveConversationSkillsAndRecovery = (input?: {
  projectId?: string | null;
}) => {
  const base = useActiveConversationBase(input);

  return useActiveConversationSkillsAndRecoverySlice(base);
};

export const useRuntimeConversationGateway = (input?: {
  projectId?: string | null;
}): RuntimeConversationProjection & {
  projectId: string | null;
  threads: AgentThreadRecord[];
  recoveryByThread: ReturnType<typeof useAgentRuntimeStore.getState>['recoveryByThread'];
} => {
  const base = useActiveConversationBase(input);
  const threads = useAgentRuntimeStore((state) =>
    base.projectId ? state.threadsByProject[base.projectId] || EMPTY_THREADS : EMPTY_THREADS,
  );
  const memoryEntries = useAgentRuntimeStore((state) =>
    base.projectId ? state.memoryByProject[base.projectId] || EMPTY_MEMORY_ENTRIES : EMPTY_MEMORY_ENTRIES,
  );
  const selection = useActiveConversationSelectionSlice(base);
  const messageSlice = useActiveConversationMessagesSlice(base);
  const liveSlice = useActiveConversationLiveStateSlice(base);
  const approvalSlice = useActiveConversationApprovalsSlice(base);
  const taskSlice = useActiveConversationTasksSlice(base);
  const skillSlice = useActiveConversationSkillsAndRecoverySlice(base);
  const contextSnapshot = useAgentRuntimeStore((state) =>
    selection.activeSessionId ? state.contextByThread[selection.activeSessionId] || null : null,
  );
  const toolCalls = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? state.toolCallsByThread[selection.activeSessionId] || EMPTY_TOOL_CALLS
      : EMPTY_TOOL_CALLS,
  );
  const memoryCandidates = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? state.memoryCandidatesByThread[selection.activeSessionId] || EMPTY_MEMORY_CANDIDATES
      : EMPTY_MEMORY_CANDIDATES,
  );
  const recoveryState = useAgentRuntimeStore((state) =>
    selection.activeSessionId ? state.recoveryByThread[selection.activeSessionId] || null : null,
  );
  const recoveryByThread = useAgentRuntimeStore((state) => state.recoveryByThread);
  const mcpToolCalls = useRuntimeMcpStore((state) =>
    selection.activeSessionId
      ? state.toolCallsByThread[selection.activeSessionId] || EMPTY_MCP_TOOL_CALLS
      : EMPTY_MCP_TOOL_CALLS,
  );

  return useMemo(
    () => ({
      ...buildRuntimeConversationProjection({
        projectChatState: base.projectChatState,
        sessions: selection.sessions,
        activeSessionId: selection.activeSessionId,
        activityEntries: messageSlice.activityEntries,
        runtimeState: {
          latestTurnSession: liveSlice.latestTurnSession,
          replayResumeRequest: liveSlice.replayResumeRequest,
          liveState: liveSlice.liveState,
          backgroundTasks: taskSlice.backgroundTasks,
          activeSkills: skillSlice.activeSkills,
          contextSnapshot,
          toolCalls,
          mcpToolCalls,
          memoryCandidates,
          memoryEntries,
          recoveryState: skillSlice.recoveryState || recoveryState,
          replayEvents: skillSlice.replayEvents,
          teamRuns: taskSlice.teamRuns,
        },
        pendingApprovals: approvalSlice.pendingApprovals,
      }),
      projectId: base.projectId,
      threads,
      recoveryByThread,
    }),
    [
      approvalSlice.pendingApprovals,
      base.projectChatState,
      base.projectId,
      contextSnapshot,
      liveSlice.liveState,
      liveSlice.latestTurnSession,
      liveSlice.replayResumeRequest,
      mcpToolCalls,
      memoryCandidates,
      memoryEntries,
      messageSlice.activityEntries,
      recoveryByThread,
      recoveryState,
      selection.activeSessionId,
      selection.sessions,
      skillSlice.activeSkills,
      skillSlice.recoveryState,
      skillSlice.replayEvents,
      taskSlice.backgroundTasks,
      taskSlice.teamRuns,
      threads,
      toolCalls,
    ],
  );
};
