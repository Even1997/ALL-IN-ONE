// 文件作用：状态仓库，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { create } from 'zustand';
// 这是 runtime 侧的主状态仓库，保存线程、运行、会话、任务、工具、记忆等执行态数据。
// 它偏“运行事实存储”，和 aiChatStore 的聊天展示状态分工不同。
// 如果你在排查“某轮执行在 runtime 里到底发生了什么”，通常先看这里的状态结构。
import type {
  AgentBackgroundTaskRecord,
  AgentExecutionAgentRunRecord,
  AgentExecutionRunRecord,
  AgentExecutionTaskRecord,
  AgentMemoryEntry,
  AgentProviderId,
  AgentReplayEvent,
  AgentThreadRecord,
  AgentTimelineEvent,
  AgentTurnRecord,
} from './agentRuntimeTypes';
import type { AgentContextSnapshot } from './context/agentContextTypes';
import type { RuntimeToolStep } from './agent-kernel/agentKernelTypes';
import type { RuntimeSkillDefinition } from './skills/runtimeSkillTypes';
import { canResumeFromRecovery, type AgentReplayRecoveryState } from './replay/runtimeReplayRecovery.ts';
import type { RuntimeReplayTurnStartPayload } from './replay/runtimeReplayPayload.ts';
import type { AgentTurnSession } from './session/agentSessionTypes';
import type { AgentTeamRunRecord } from './teams/teamTypes.ts';
import type { StreamingLatencyTrace } from './streamingLatencyTrace.ts';
import { areStreamingLatencyTracesEqual } from './streamingLatencyTrace.ts';

// agentRuntimeStore 保存 runtime 侧的运行真相：
// - thread / turn / session / timeline / replay / liveState 都在这里。
// - chat store 更偏“聊天持久化视角”，这里更偏“执行现场视角”。
// - 如果问题是“线程当前正在跑什么、工具执行到哪、回放恢复状态是什么”，优先看这里。
export type AgentRuntimeBinding = {
  providerId: AgentProviderId;
  configId: string | null;
  externalThreadId: string | null;
};

export type AgentRuntimeRunState = {
  status: 'idle' | 'running' | 'error';
  draft: string;
  error: string | null;
};

export type AgentRuntimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type AgentRuntimeTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AgentRuntimeLiveState = {
  connectionState: AgentRuntimeConnectionState;
  statusVerb: string;
  elapsedSeconds: number;
  startedAt: number | null;
  activeToolName: string | null;
  streamingToolInput: string;
  pendingApprovalSummary: string | null;
  pendingQuestionSummary: string | null;
  activeThinking: boolean;
  streamingText: string;
  pendingPermissionCount: number;
  tokenUsage: AgentRuntimeTokenUsage;
  streamingLatencyTrace: StreamingLatencyTrace | null;
};

export type AgentRuntimeResumeRequest = {
  threadId: string;
  prompt: string;
  resumeKind: AgentReplayRecoveryState['resumeKind'];
  actionLabel: string | null;
  skillSnapshot?: RuntimeReplayTurnStartPayload | null;
  requestedAt: number;
};

export type AgentMemoryCandidate = {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  status: 'pending' | 'saved' | 'dismissed';
  createdAt: number;
};

type AgentRuntimeState = {
  threadsByProject: Record<string, AgentThreadRecord[]>;
  timelineByThread: Record<string, AgentTimelineEvent[]>;
  turnsByThread: Record<string, AgentTurnRecord[]>;
  sessionsByThread: Record<string, AgentTurnSession[]>;
  tasksByThread: Record<string, AgentExecutionTaskRecord[]>;
  runsByThread: Record<string, AgentExecutionRunRecord[]>;
  agentRunsByThread: Record<string, AgentExecutionAgentRunRecord[]>;
  memoryByProject: Record<string, AgentMemoryEntry[]>;
  memoryCandidatesByThread: Record<string, AgentMemoryCandidate[]>;
  replayEventsByThread: Record<string, AgentReplayEvent[]>;
  recoveryByThread: Record<string, AgentReplayRecoveryState>;
  resumeRequestsByThread: Record<string, AgentRuntimeResumeRequest>;
  activeSkillsByThread: Record<string, RuntimeSkillDefinition[]>;
  contextByThread: Record<string, AgentContextSnapshot>;
  toolCallsByThread: Record<string, RuntimeToolStep[]>;
  bindingByThread: Record<string, AgentRuntimeBinding>;
  runStateByThread: Record<string, AgentRuntimeRunState>;
  liveStateByThread: Record<string, AgentRuntimeLiveState>;
  backgroundTasksByThread: Record<string, AgentBackgroundTaskRecord[]>;
  teamRunsByThread: Record<string, AgentTeamRunRecord[]>;
  isHydrating: boolean;
  createThread: (projectId: string, thread: AgentThreadRecord) => void;
  appendTimelineEvent: (threadId: string, event: AgentTimelineEvent) => void;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  upsertTurnSession: (threadId: string, session: AgentTurnSession) => void;
  upsertExecutionTask: (threadId: string, task: AgentExecutionTaskRecord) => void;
  upsertExecutionRun: (threadId: string, run: AgentExecutionRunRecord) => void;
  setExecutionRuns: (threadId: string, runs: AgentExecutionRunRecord[]) => void;
  upsertExecutionAgentRun: (threadId: string, agentRun: AgentExecutionAgentRunRecord) => void;
  setExecutionAgentRuns: (threadId: string, agentRuns: AgentExecutionAgentRunRecord[]) => void;
  patchTurnSession: (
    threadId: string,
    turnId: string,
    updater: (session: AgentTurnSession) => AgentTurnSession,
  ) => void;
  setMemoryEntries: (projectId: string, entries: AgentMemoryEntry[]) => void;
  setThreadMemoryCandidates: (threadId: string, candidates: AgentMemoryCandidate[]) => void;
  resolveMemoryCandidate: (
    threadId: string,
    candidateId: string,
    status: AgentMemoryCandidate['status'],
  ) => void;
  setReplayEvents: (threadId: string, events: AgentReplayEvent[]) => void;
  appendReplayEvent: (threadId: string, event: AgentReplayEvent) => void;
  setRecoveryState: (threadId: string, recoveryState: AgentReplayRecoveryState) => void;
  requestReplayResume: (threadId: string, prompt: string) => void;
  requestReplayResumeFromRecovery: (
    threadId: string,
    recoveryState: AgentReplayRecoveryState | null | undefined,
  ) => void;
  clearReplayResumeRequest: (threadId: string) => void;
  setActiveSkills: (threadId: string, skills: RuntimeSkillDefinition[]) => void;
  setThreadContext: (threadId: string, context: AgentContextSnapshot) => void;
  setThreadToolCalls: (threadId: string, toolCalls: RuntimeToolStep[]) => void;
  setRuntimeBinding: (threadId: string, binding: AgentRuntimeBinding) => void;
  setThreadBackgroundTasks: (threadId: string, tasks: AgentBackgroundTaskRecord[]) => void;
  removeThreadState: (projectId: string, threadId: string) => void;
  upsertBackgroundTask: (threadId: string, task: AgentBackgroundTaskRecord) => void;
  upsertTeamRun: (threadId: string, teamRun: AgentTeamRunRecord) => void;
  pruneThreadHistorySince: (threadId: string, createdAt: number) => void;
  startRun: (threadId: string) => void;
  appendStreamDelta: (threadId: string, delta: string) => void;
  finishRun: (threadId: string) => void;
  failRun: (threadId: string, error: string) => void;
  patchLiveState: (
    threadId: string,
    updater: Partial<AgentRuntimeLiveState> | ((state: AgentRuntimeLiveState) => AgentRuntimeLiveState),
  ) => void;
  resetLiveState: (threadId: string) => void;
  setHydrating: (value: boolean) => void;
};

const sortThreads = (threads: AgentThreadRecord[]) =>
  [...threads].sort((left, right) => right.updatedAt - left.updatedAt);

const sortTimeline = (events: AgentTimelineEvent[]) =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

const sortTurns = (turns: AgentTurnRecord[]) =>
  [...turns].sort((left, right) => left.createdAt - right.createdAt);

const sortSessions = (sessions: AgentTurnSession[]) =>
  [...sessions].sort((left, right) => left.createdAt - right.createdAt);

const sortExecutionTasks = (tasks: AgentExecutionTaskRecord[]) =>
  [...tasks].sort((left, right) => right.updatedAt - left.updatedAt);

const sortExecutionRuns = (runs: AgentExecutionRunRecord[]) =>
  [...runs].sort((left, right) => right.updatedAt - left.updatedAt);

const sortExecutionAgentRuns = (agentRuns: AgentExecutionAgentRunRecord[]) =>
  [...agentRuns].sort((left, right) => right.updatedAt - left.updatedAt);

const sortReplayEvents = (events: AgentReplayEvent[]) =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

const sortTeamRuns = (teamRuns: AgentTeamRunRecord[]) =>
  [...teamRuns].sort((left, right) => right.updatedAt - left.updatedAt);

const sortBackgroundTasks = (tasks: AgentBackgroundTaskRecord[]) =>
  [...tasks].sort((left, right) => right.updatedAt - left.updatedAt);

const createIdleRunState = (): AgentRuntimeRunState => ({
  status: 'idle',
  draft: '',
  error: null,
});

const createIdleLiveState = (): AgentRuntimeLiveState => ({
  connectionState: 'disconnected',
  statusVerb: '',
  elapsedSeconds: 0,
  startedAt: null,
  activeToolName: null,
  streamingToolInput: '',
  pendingApprovalSummary: null,
  pendingQuestionSummary: null,
  activeThinking: false,
  streamingText: '',
  pendingPermissionCount: 0,
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
  },
  streamingLatencyTrace: null,
});

// liveState 更新频繁，所以这里专门做了结构比较。
// 相同状态不重复写入，避免流式阶段把 React / Zustand 订阅刷爆。
const areTokenUsageEqual = (
  left: AgentRuntimeTokenUsage,
  right: AgentRuntimeTokenUsage,
) => left.inputTokens === right.inputTokens && left.outputTokens === right.outputTokens;

const areLiveStatesEqual = (
  left: AgentRuntimeLiveState,
  right: AgentRuntimeLiveState,
) =>
  left.connectionState === right.connectionState
  && left.statusVerb === right.statusVerb
  && left.elapsedSeconds === right.elapsedSeconds
  && left.startedAt === right.startedAt
  && left.activeToolName === right.activeToolName
  && left.streamingToolInput === right.streamingToolInput
  && left.pendingApprovalSummary === right.pendingApprovalSummary
  && left.pendingQuestionSummary === right.pendingQuestionSummary
  && left.activeThinking === right.activeThinking
  && left.streamingText === right.streamingText
  && left.pendingPermissionCount === right.pendingPermissionCount
  && areTokenUsageEqual(left.tokenUsage, right.tokenUsage)
  && areStreamingLatencyTracesEqual(left.streamingLatencyTrace, right.streamingLatencyTrace);

export const useAgentRuntimeStore = create<AgentRuntimeState>((set) => ({
  threadsByProject: {},
  timelineByThread: {},
  turnsByThread: {},
  sessionsByThread: {},
  tasksByThread: {},
  runsByThread: {},
  agentRunsByThread: {},
  memoryByProject: {},
  memoryCandidatesByThread: {},
  replayEventsByThread: {},
  recoveryByThread: {},
  resumeRequestsByThread: {},
  activeSkillsByThread: {},
  contextByThread: {},
  toolCallsByThread: {},
  bindingByThread: {},
  runStateByThread: {},
  liveStateByThread: {},
  backgroundTasksByThread: {},
  teamRunsByThread: {},
  isHydrating: false,

  // createThread / appendTimelineEvent / submitTurn 这一组 action
  // 是 runtime 线程从“创建 -> 记录过程 -> 累积执行历史”的主入口。
  createThread: (projectId, thread) =>
    set((state) => ({
      threadsByProject: {
        ...state.threadsByProject,
        [projectId]: sortThreads([
          thread,
          ...(state.threadsByProject[projectId] || []).filter((item) => item.id !== thread.id),
        ]),
      },
    })),

  appendTimelineEvent: (threadId, event) =>
    set((state) => ({
      timelineByThread: {
        ...state.timelineByThread,
        [threadId]: sortTimeline([
          ...(state.timelineByThread[threadId] || []).filter((item) => item.id !== event.id),
          event,
        ]),
      },
    })),

  submitTurn: (threadId, turn) =>
    set((state) => ({
      turnsByThread: {
        ...state.turnsByThread,
        [threadId]: sortTurns([
          ...(state.turnsByThread[threadId] || []).filter((item) => item.id !== turn.id),
          turn,
        ]),
      },
    })),

  upsertTurnSession: (threadId, session) =>
    set((state) => ({
      sessionsByThread: {
        ...state.sessionsByThread,
        [threadId]: sortSessions([
          session,
          ...(state.sessionsByThread[threadId] || []).filter((item) => item.id !== session.id),
        ]),
      },
    })),

  upsertExecutionTask: (threadId, task) =>
    set((state) => ({
      tasksByThread: {
        ...state.tasksByThread,
        [threadId]: sortExecutionTasks([
          task,
          ...(state.tasksByThread[threadId] || []).filter((item) => item.id !== task.id),
        ]),
      },
    })),

  upsertExecutionRun: (threadId, run) =>
    set((state) => ({
      runsByThread: {
        ...state.runsByThread,
        [threadId]: sortExecutionRuns([
          run,
          ...(state.runsByThread[threadId] || []).filter((item) => item.id !== run.id),
        ]),
      },
    })),

  setExecutionRuns: (threadId, runs) =>
    set((state) => ({
      runsByThread: {
        ...state.runsByThread,
        [threadId]: sortExecutionRuns([...runs]),
      },
    })),

  upsertExecutionAgentRun: (threadId, agentRun) =>
    set((state) => ({
      agentRunsByThread: {
        ...state.agentRunsByThread,
        [threadId]: sortExecutionAgentRuns([
          agentRun,
          ...(state.agentRunsByThread[threadId] || []).filter((item) => item.id !== agentRun.id),
        ]),
      },
    })),

  setExecutionAgentRuns: (threadId, agentRuns) =>
    set((state) => ({
      agentRunsByThread: {
        ...state.agentRunsByThread,
        [threadId]: sortExecutionAgentRuns([...agentRuns]),
      },
    })),

  patchTurnSession: (threadId, turnId, updater) =>
    set((state) => {
      const updatedAt = Date.now();

      return {
        sessionsByThread: {
          ...state.sessionsByThread,
          [threadId]: (state.sessionsByThread[threadId] || []).map((item) =>
            item.id === turnId ? { ...updater(item), updatedAt } : item
          ),
        },
      };
    }),

  setMemoryEntries: (projectId, entries) =>
    set((state) => ({
      memoryByProject: {
        ...state.memoryByProject,
        [projectId]: [...entries],
      },
    })),

  setThreadMemoryCandidates: (threadId, candidates) =>
    set((state) => {
      const candidatesById = new Map(
        (state.memoryCandidatesByThread[threadId] || []).map((candidate) => [candidate.id, candidate])
      );

      for (const candidate of candidates) {
        const existingCandidate = candidatesById.get(candidate.id);
        candidatesById.set(candidate.id, {
          ...candidate,
          status: existingCandidate?.status || candidate.status,
        });
      }

      return {
        memoryCandidatesByThread: {
          ...state.memoryCandidatesByThread,
          [threadId]: Array.from(candidatesById.values()),
        },
      };
    }),

  resolveMemoryCandidate: (threadId, candidateId, status) =>
    set((state) => ({
      memoryCandidatesByThread: {
        ...state.memoryCandidatesByThread,
        [threadId]: (state.memoryCandidatesByThread[threadId] || []).map((candidate) =>
          candidate.id === candidateId ? { ...candidate, status } : candidate
        ),
      },
    })),

  setReplayEvents: (threadId, events) =>
    set((state) => ({
      replayEventsByThread: {
        ...state.replayEventsByThread,
        [threadId]: sortReplayEvents([...events]),
      },
    })),

  appendReplayEvent: (threadId, event) =>
    set((state) => ({
      replayEventsByThread: {
        ...state.replayEventsByThread,
        [threadId]: sortReplayEvents([
          ...(state.replayEventsByThread[threadId] || []).filter((item) => item.id !== event.id),
          event,
        ]),
      },
    })),

  setRecoveryState: (threadId, recoveryState) =>
    set((state) => ({
      recoveryByThread: {
        ...state.recoveryByThread,
        [threadId]: recoveryState,
      },
    })),

  requestReplayResume: (threadId, prompt) =>
    set((state) => ({
      resumeRequestsByThread: {
        ...state.resumeRequestsByThread,
        [threadId]: {
          threadId,
          prompt,
          resumeKind: 'resume-latest-prompt',
          actionLabel: null,
          requestedAt: Date.now(),
        },
      },
    })),

  requestReplayResumeFromRecovery: (threadId, recoveryState) =>
    set((state) => {
      if (
        !recoveryState ||
        recoveryState.resumeState !== 'ready' ||
        !recoveryState.resumePrompt ||
        !canResumeFromRecovery(recoveryState)
      ) {
        return state;
      }

      const readyRecoveryState = recoveryState;

      return {
        resumeRequestsByThread: {
          ...state.resumeRequestsByThread,
          [threadId]: {
            threadId,
            prompt: readyRecoveryState.resumePrompt || '',
            resumeKind: readyRecoveryState.resumeKind,
            actionLabel: readyRecoveryState.resumeActionLabel,
            skillSnapshot: readyRecoveryState.resumeSkillSnapshot,
            requestedAt: Date.now(),
          },
        },
      };
    }),

  clearReplayResumeRequest: (threadId) =>
    set((state) => {
      const resumeRequestsByThread = { ...state.resumeRequestsByThread };
      delete resumeRequestsByThread[threadId];

      return { resumeRequestsByThread };
    }),

  setActiveSkills: (threadId, skills) =>
    set((state) => ({
      activeSkillsByThread: {
        ...state.activeSkillsByThread,
        [threadId]: [...skills],
      },
    })),

  setThreadContext: (threadId, context) =>
    set((state) => ({
      contextByThread: {
        ...state.contextByThread,
        [threadId]: context,
      },
    })),

  setThreadToolCalls: (threadId, toolCalls) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...toolCalls],
      },
    })),

  setRuntimeBinding: (threadId, binding) =>
    set((state) => ({
      bindingByThread: {
        ...state.bindingByThread,
        [threadId]: binding,
      },
    })),

  setThreadBackgroundTasks: (threadId, tasks) =>
    set((state) => ({
      backgroundTasksByThread: {
        ...state.backgroundTasksByThread,
        [threadId]: sortBackgroundTasks([...tasks]),
      },
    })),

  removeThreadState: (projectId, threadId) =>
    set((state) => ({
      threadsByProject: {
        ...state.threadsByProject,
        [projectId]: (state.threadsByProject[projectId] || []).filter((thread) => thread.id !== threadId),
      },
      timelineByThread: Object.fromEntries(
        Object.entries(state.timelineByThread).filter(([key]) => key !== threadId),
      ),
      turnsByThread: Object.fromEntries(
        Object.entries(state.turnsByThread).filter(([key]) => key !== threadId),
      ),
      sessionsByThread: Object.fromEntries(
        Object.entries(state.sessionsByThread).filter(([key]) => key !== threadId),
      ),
      tasksByThread: Object.fromEntries(
        Object.entries(state.tasksByThread).filter(([key]) => key !== threadId),
      ),
      runsByThread: Object.fromEntries(
        Object.entries(state.runsByThread).filter(([key]) => key !== threadId),
      ),
      agentRunsByThread: Object.fromEntries(
        Object.entries(state.agentRunsByThread).filter(([key]) => key !== threadId),
      ),
      memoryCandidatesByThread: Object.fromEntries(
        Object.entries(state.memoryCandidatesByThread).filter(([key]) => key !== threadId),
      ),
      replayEventsByThread: Object.fromEntries(
        Object.entries(state.replayEventsByThread).filter(([key]) => key !== threadId),
      ),
      recoveryByThread: Object.fromEntries(
        Object.entries(state.recoveryByThread).filter(([key]) => key !== threadId),
      ),
      resumeRequestsByThread: Object.fromEntries(
        Object.entries(state.resumeRequestsByThread).filter(([key]) => key !== threadId),
      ),
      activeSkillsByThread: Object.fromEntries(
        Object.entries(state.activeSkillsByThread).filter(([key]) => key !== threadId),
      ),
      contextByThread: Object.fromEntries(
        Object.entries(state.contextByThread).filter(([key]) => key !== threadId),
      ),
      toolCallsByThread: Object.fromEntries(
        Object.entries(state.toolCallsByThread).filter(([key]) => key !== threadId),
      ),
      bindingByThread: Object.fromEntries(
        Object.entries(state.bindingByThread).filter(([key]) => key !== threadId),
      ),
      runStateByThread: Object.fromEntries(
        Object.entries(state.runStateByThread).filter(([key]) => key !== threadId),
      ),
      liveStateByThread: Object.fromEntries(
        Object.entries(state.liveStateByThread).filter(([key]) => key !== threadId),
      ),
      backgroundTasksByThread: Object.fromEntries(
        Object.entries(state.backgroundTasksByThread).filter(([key]) => key !== threadId),
      ),
      teamRunsByThread: Object.fromEntries(
        Object.entries(state.teamRunsByThread).filter(([key]) => key !== threadId),
      ),
    })),

  upsertBackgroundTask: (threadId, task) =>
    set((state) => ({
      backgroundTasksByThread: {
        ...state.backgroundTasksByThread,
        [threadId]: sortBackgroundTasks([
          task,
          ...(state.backgroundTasksByThread[threadId] || []).filter((item) => item.id !== task.id),
        ]),
      },
    })),

  upsertTeamRun: (threadId, teamRun) =>
    set((state) => ({
      teamRunsByThread: {
        ...state.teamRunsByThread,
        [threadId]: sortTeamRuns([
          teamRun,
          ...(state.teamRunsByThread[threadId] || []).filter((item) => item.id !== teamRun.id),
        ]),
      },
    })),

  pruneThreadHistorySince: (threadId, createdAt) =>
    set((state) => {
      const nextReplayEvents = (state.replayEventsByThread[threadId] || []).filter(
        (event) => event.createdAt < createdAt,
      );

      return {
        timelineByThread: {
          ...state.timelineByThread,
          [threadId]: (state.timelineByThread[threadId] || []).filter((event) => event.createdAt < createdAt),
        },
        turnsByThread: {
          ...state.turnsByThread,
          [threadId]: (state.turnsByThread[threadId] || []).filter((turn) => turn.createdAt < createdAt),
        },
        sessionsByThread: {
          ...state.sessionsByThread,
          [threadId]: (state.sessionsByThread[threadId] || []).filter((session) => session.createdAt < createdAt),
        },
        tasksByThread: {
          ...state.tasksByThread,
          [threadId]: (state.tasksByThread[threadId] || []).filter((task) => task.createdAt < createdAt),
        },
        runsByThread: {
          ...state.runsByThread,
          [threadId]: (state.runsByThread[threadId] || []).filter((run) => run.createdAt < createdAt),
        },
        agentRunsByThread: {
          ...state.agentRunsByThread,
          [threadId]: (state.agentRunsByThread[threadId] || []).filter((run) => run.createdAt < createdAt),
        },
        replayEventsByThread: {
          ...state.replayEventsByThread,
          [threadId]: nextReplayEvents,
        },
        teamRunsByThread: {
          ...state.teamRunsByThread,
          [threadId]: (state.teamRunsByThread[threadId] || []).filter((teamRun) => teamRun.updatedAt < createdAt),
        },
        toolCallsByThread: {
          ...state.toolCallsByThread,
          [threadId]: [],
        },
        backgroundTasksByThread: {
          ...state.backgroundTasksByThread,
          [threadId]: (state.backgroundTasksByThread[threadId] || []).filter((task) => task.updatedAt < createdAt),
        },
        recoveryByThread: nextReplayEvents.length
          ? state.recoveryByThread
          : Object.fromEntries(
              Object.entries(state.recoveryByThread).filter(([key]) => key !== threadId),
            ),
        resumeRequestsByThread: Object.fromEntries(
          Object.entries(state.resumeRequestsByThread).filter(([key]) => key !== threadId),
        ),
      };
    }),

  startRun: (threadId) =>
    set((state) => ({
      runStateByThread: {
        ...state.runStateByThread,
        [threadId]: {
          ...(state.runStateByThread[threadId] || createIdleRunState()),
          status: 'running',
          draft: '',
          error: null,
        },
      },
    })),

  appendStreamDelta: (threadId, delta) =>
    set((state) => {
      if (!delta) {
        return state;
      }

      return {
        runStateByThread: {
          ...state.runStateByThread,
          [threadId]: {
            ...(state.runStateByThread[threadId] || createIdleRunState()),
            draft: `${state.runStateByThread[threadId]?.draft || ''}${delta}`,
          },
        },
      };
    }),

  finishRun: (threadId) =>
    set((state) => ({
      runStateByThread: {
        ...state.runStateByThread,
        [threadId]: {
          ...(state.runStateByThread[threadId] || createIdleRunState()),
          status: 'idle',
          error: null,
        },
      },
    })),

  failRun: (threadId, error) =>
    set((state) => ({
      runStateByThread: {
        ...state.runStateByThread,
        [threadId]: {
          ...(state.runStateByThread[threadId] || createIdleRunState()),
          status: 'error',
          error,
        },
      },
    })),

  patchLiveState: (threadId, updater) =>
    set((state) => {
      // liveState 是最频繁变化的一层：
      // 连接状态、流式文本、token 使用、审批摘要等都会从这里进入 UI。
      const current = state.liveStateByThread[threadId] || createIdleLiveState();
      const next =
        typeof updater === 'function'
          ? updater(current)
          : {
              ...current,
              ...updater,
              tokenUsage: updater.tokenUsage
                ? { ...current.tokenUsage, ...updater.tokenUsage }
                : current.tokenUsage,
            };

      if (next === current || areLiveStatesEqual(current, next)) {
        return state;
      }

      return {
        liveStateByThread: {
          ...state.liveStateByThread,
          [threadId]: next,
        },
      };
    }),

  resetLiveState: (threadId) =>
    set((state) => ({
      liveStateByThread: {
        ...state.liveStateByThread,
        [threadId]: createIdleLiveState(),
      },
    })),

  setHydrating: (value) => set({ isHydrating: value }),
}));
