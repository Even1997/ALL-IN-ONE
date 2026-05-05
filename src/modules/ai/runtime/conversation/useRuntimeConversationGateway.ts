import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
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

export const useRuntimeConversationGateway = (input?: {
  projectId?: string | null;
}): RuntimeConversationProjection & {
  projectId: string | null;
  threads: AgentThreadRecord[];
  recoveryByThread: ReturnType<typeof useAgentRuntimeStore.getState>['recoveryByThread'];
} => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectId = input?.projectId ?? currentProject?.id ?? null;
  const projectChatState = useAIChatStore(
    useShallow((state) => (projectId ? state.projects[projectId] || null : null)),
  );
  const threads = useAgentRuntimeStore((state) =>
    projectId ? state.threadsByProject[projectId] || EMPTY_THREADS : EMPTY_THREADS,
  );
  const memoryEntries = useAgentRuntimeStore((state) =>
    projectId ? state.memoryByProject[projectId] || EMPTY_MEMORY_ENTRIES : EMPTY_MEMORY_ENTRIES,
  );
  const sessions = projectChatState?.sessions || [];
  const activityEntries = projectChatState?.activityEntries || [];
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
  const latestTurnSession = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? getLatestTurnSession(state.sessionsByThread[selection.activeSessionId]) || null
      : null,
  );
  const replayResumeRequest = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? state.resumeRequestsByThread[selection.activeSessionId] || null
      : null,
  );
  const liveState = useAgentRuntimeStore((state) =>
    threadIds.liveThreadId ? state.liveStateByThread[threadIds.liveThreadId] || null : null,
  );
  const backgroundTasks = useAgentRuntimeStore((state) =>
    threadIds.liveThreadId
      ? state.backgroundTasksByThread[threadIds.liveThreadId] || EMPTY_BACKGROUND_TASKS
      : EMPTY_BACKGROUND_TASKS,
  );
  const activeSkills = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? state.activeSkillsByThread[selection.activeSessionId] || EMPTY_ACTIVE_SKILLS
      : EMPTY_ACTIVE_SKILLS,
  );
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
  const replayEvents = useAgentRuntimeStore((state) =>
    selection.activeSession?.runtimeThreadId
      ? state.replayEventsByThread[selection.activeSession.runtimeThreadId] || EMPTY_REPLAY_EVENTS
      : EMPTY_REPLAY_EVENTS,
  );
  const teamRuns = useAgentRuntimeStore((state) =>
    selection.activeSessionId
      ? state.teamRunsByThread[selection.activeSessionId] || EMPTY_TEAM_RUNS
      : EMPTY_TEAM_RUNS,
  );
  const mcpToolCalls = useRuntimeMcpStore((state) =>
    selection.activeSessionId
      ? state.toolCallsByThread[selection.activeSessionId] || EMPTY_MCP_TOOL_CALLS
      : EMPTY_MCP_TOOL_CALLS,
  );
  const approvals = useApprovalStore((state) =>
    threadIds.approvalThreadId
      ? state.approvalsByThread[threadIds.approvalThreadId] || EMPTY_APPROVALS
      : EMPTY_APPROVALS,
  );

  return useMemo(
    () => ({
      ...buildRuntimeConversationProjection({
        projectChatState,
        sessions,
        activeSessionId: selection.activeSessionId,
        activityEntries,
        runtimeState: {
          latestTurnSession,
          replayResumeRequest,
          liveState,
          backgroundTasks,
          activeSkills,
          contextSnapshot,
          toolCalls,
          mcpToolCalls,
          memoryCandidates,
          memoryEntries,
          recoveryState,
          replayEvents,
          teamRuns,
        },
        pendingApprovals: approvals,
      }),
      projectId,
      threads,
      recoveryByThread,
    }),
    [
      activeSkills,
      activityEntries,
      backgroundTasks,
      contextSnapshot,
      latestTurnSession,
      liveState,
      mcpToolCalls,
      memoryCandidates,
      memoryEntries,
      approvals,
      projectChatState,
      projectId,
      recoveryByThread,
      recoveryState,
      replayEvents,
      replayResumeRequest,
      selection.activeSessionId,
      sessions,
      teamRuns,
      threads,
      toolCalls,
    ],
  );
};
