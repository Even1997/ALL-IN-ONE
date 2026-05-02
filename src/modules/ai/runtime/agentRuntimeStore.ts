import { create } from 'zustand';
import type {
  AgentMemoryEntry,
  AgentProviderId,
  AgentReplayEvent,
  AgentThreadRecord,
  AgentTimelineEvent,
  AgentTurnRecord,
} from './agentRuntimeTypes';
import type { RuntimeSkillDefinition } from './skills/runtimeSkillTypes';
import { canResumeFromRecovery, type AgentReplayRecoveryState } from './replay/runtimeReplayRecovery.ts';

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

export type AgentRuntimeResumeRequest = {
  threadId: string;
  prompt: string;
  resumeKind: AgentReplayRecoveryState['resumeKind'];
  actionLabel: string | null;
  requestedAt: number;
};

type AgentRuntimeState = {
  threadsByProject: Record<string, AgentThreadRecord[]>;
  timelineByThread: Record<string, AgentTimelineEvent[]>;
  turnsByThread: Record<string, AgentTurnRecord[]>;
  memoryByProject: Record<string, AgentMemoryEntry[]>;
  replayEventsByThread: Record<string, AgentReplayEvent[]>;
  recoveryByThread: Record<string, AgentReplayRecoveryState>;
  resumeRequestsByThread: Record<string, AgentRuntimeResumeRequest>;
  activeSkillsByThread: Record<string, RuntimeSkillDefinition[]>;
  bindingByThread: Record<string, AgentRuntimeBinding>;
  runStateByThread: Record<string, AgentRuntimeRunState>;
  isHydrating: boolean;
  createThread: (projectId: string, thread: AgentThreadRecord) => void;
  appendTimelineEvent: (threadId: string, event: AgentTimelineEvent) => void;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  setMemoryEntries: (projectId: string, entries: AgentMemoryEntry[]) => void;
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
  setRuntimeBinding: (threadId: string, binding: AgentRuntimeBinding) => void;
  startRun: (threadId: string) => void;
  appendStreamDelta: (threadId: string, delta: string) => void;
  finishRun: (threadId: string) => void;
  failRun: (threadId: string, error: string) => void;
  setHydrating: (value: boolean) => void;
};

const sortThreads = (threads: AgentThreadRecord[]) =>
  [...threads].sort((left, right) => right.updatedAt - left.updatedAt);

const sortTimeline = (events: AgentTimelineEvent[]) =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

const sortTurns = (turns: AgentTurnRecord[]) =>
  [...turns].sort((left, right) => left.createdAt - right.createdAt);

const sortReplayEvents = (events: AgentReplayEvent[]) =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

const createIdleRunState = (): AgentRuntimeRunState => ({
  status: 'idle',
  draft: '',
  error: null,
});

export const useAgentRuntimeStore = create<AgentRuntimeState>((set) => ({
  threadsByProject: {},
  timelineByThread: {},
  turnsByThread: {},
  memoryByProject: {},
  replayEventsByThread: {},
  recoveryByThread: {},
  resumeRequestsByThread: {},
  activeSkillsByThread: {},
  bindingByThread: {},
  runStateByThread: {},
  isHydrating: false,

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

  setMemoryEntries: (projectId, entries) =>
    set((state) => ({
      memoryByProject: {
        ...state.memoryByProject,
        [projectId]: [...entries],
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

  setRuntimeBinding: (threadId, binding) =>
    set((state) => ({
      bindingByThread: {
        ...state.bindingByThread,
        [threadId]: binding,
      },
    })),

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
    set((state) => ({
      runStateByThread: {
        ...state.runStateByThread,
        [threadId]: {
          ...(state.runStateByThread[threadId] || createIdleRunState()),
          draft: `${state.runStateByThread[threadId]?.draft || ''}${delta}`,
        },
      },
    })),

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

  setHydrating: (value) => set({ isHydrating: value }),
}));
