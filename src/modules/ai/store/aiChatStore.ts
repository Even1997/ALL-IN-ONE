import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { ActivityEntry } from '../skills/activityLog';
import type { ChatStructuredCard } from '../chat/chatCards';
import type { ProjectFileProposal } from '../chat/projectFileOperations';
import type { AgentProviderId } from '../runtime/agentRuntimeTypes';
import type { AgentReplayRecoveryState } from '../runtime/replay/runtimeReplayRecovery.ts';
import type { RuntimeReplayEvent } from '../runtime/replay/runtimeReplayTypes.ts';
import type { AgentTeamRunRecord } from '../runtime/teams/teamTypes';
import type { AIChatMessagePart } from '../../../components/workspace/aiChatMessageParts.ts';
import {
  buildAssistantTimelineFromContent,
  type AssistantTimelineEvent,
  type RuntimeQuestionItem,
  type RuntimeQuestionOption,
  type RuntimeQuestionPayload,
  type StoredChatRuntimeApprovalDisplay,
  type StoredChatRuntimeEvent,
  type StoredChatRuntimeFileChange,
} from './assistantTimeline.ts';
import {
  appendChatSessionEvent,
  buildChatSessionProjection,
  createComposerPrefillClearedEvent,
  createComposerPrefillQueuedEvent,
  createMessageAppendedEvent,
  createMessageUpdatedEvent,
  createMessagesReplacedEvent,
  createReplayStateSyncedEvent,
  createRuntimeThreadBoundEvent,
  createSessionInitializedEvent,
  createSessionRenamedEvent,
  ensureChatSessionEventLog,
  type ChatSessionEvent,
} from './chatSessionEventLog.ts';

export type {
  AssistantTimelineEvent,
  RuntimeQuestionItem,
  RuntimeQuestionOption,
  RuntimeQuestionPayload,
  StoredChatRuntimeApprovalDisplay,
  StoredChatRuntimeEvent,
  StoredChatRuntimeFileChange,
};

export type ComposerPrefillPayload = {
  prompt: string;
  nonce: number;
};

type StoredChatMessageBase = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  tone?: 'default' | 'error';
  runId?: string;
  teamRun?: AgentTeamRunRecord | null;
  structuredCards?: ChatStructuredCard[];
  projectFileProposal?: ProjectFileProposal;
  createdAt: number;
};

export type StoredChatAssistantMessage = StoredChatMessageBase & {
  role: 'assistant';
  timeline: AssistantTimelineEvent[];
};

export type StoredChatUserMessage = StoredChatMessageBase & {
  role: 'user' | 'system';
  content: string;
};

export type StoredChatMessage = StoredChatAssistantMessage | StoredChatUserMessage;

export type ChatSession = {
  id: string;
  projectId: string;
  title: string;
  providerId: AgentProviderId;
  runtimeThreadId: string | null;
  composerPrefill?: ComposerPrefillPayload | null;
  messages: StoredChatMessage[];
  canonicalEvents: CanonicalEvent[];
  replayEvents: RuntimeReplayEvent[];
  recoveryState: AgentReplayRecoveryState | null;
  eventLog: ChatSessionEvent[];
  createdAt: number;
  updatedAt: number;
};

export type ChatProjectState = {
  activeSessionId: string | null;
  sessions: ChatSession[];
  activityEntries: ActivityEntry[];
};

type PersistedChatSession = Omit<ChatSession, 'eventLog'>;
type PersistedChatProjectState = Omit<ChatProjectState, 'sessions'> & {
  sessions: PersistedChatSession[];
};

type AIChatStoreState = {
  projects: Record<string, ChatProjectState>;
  ensureProjectState: (projectId: string) => void;
  upsertSession: (projectId: string, session: ChatSession) => void;
  bindRuntimeThread: (
    projectId: string,
    sessionId: string,
    providerId: AgentProviderId,
    runtimeThreadId: string
  ) => void;
  setActiveSession: (projectId: string, sessionId: string) => void;
  appendMessage: (projectId: string, sessionId: string, message: StoredChatMessage) => void;
  appendCanonicalEvent: (projectId: string, sessionId: string, event: CanonicalEvent) => void;
  replaceCanonicalEvents: (projectId: string, sessionId: string, events: CanonicalEvent[]) => void;
  appendActivityEntry: (projectId: string, entry: ActivityEntry) => void;
  setActivityEntries: (projectId: string, entries: ActivityEntry[]) => void;
  updateMessage: (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: StoredChatMessage) => StoredChatMessage
  ) => void;
  queueComposerPrefill: (projectId: string, sessionId: string, prompt: string) => void;
  clearComposerPrefill: (projectId: string, sessionId: string) => void;
  syncSessionReplayState: (
    projectId: string,
    sessionId: string,
    replayThreadId: string,
    replayEvents: RuntimeReplayEvent[],
    recoveryState: AgentReplayRecoveryState | null
  ) => void;
  replaceProjectSessions: (
    projectId: string,
    sessions: ChatSession[],
    activeSessionId?: string | null,
  ) => void;
  replaceSessionMessages: (projectId: string, sessionId: string, messages: StoredChatMessage[]) => void;
  renameSession: (projectId: string, sessionId: string, title: string) => void;
  removeSession: (projectId: string, sessionId: string) => void;
};

const AI_CHAT_STORE_VERSION = 5;

const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createMessageId = (role: StoredChatMessage['role']) =>
  `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createProjectState = (): ChatProjectState => ({
  activeSessionId: null,
  sessions: [],
  activityEntries: [],
});

const normalizeAssistantMessage = (message: StoredChatMessage): StoredChatMessage => {
  if (message.role !== 'assistant') {
    return message;
  }

  return Array.isArray(message.timeline) ? message : { ...message, timeline: [] };
};

const normalizeCanonicalEvents = (events: CanonicalEvent[] | undefined, sessionId: string) =>
  Array.isArray(events)
    ? events.map((event) => ({
        ...event,
        sessionId,
      }))
    : [];

const normalizeChatSession = (session: ChatSession): ChatSession => {
  const normalizedMessages = (session.messages || []).map(normalizeAssistantMessage);
  const normalizedSession = {
    ...session,
    messages: normalizedMessages,
    canonicalEvents: normalizeCanonicalEvents(session.canonicalEvents, session.id),
  };
  const eventLog = ensureChatSessionEventLog(normalizedSession);
  return (
    buildChatSessionProjection(session.id, eventLog, {
      ...normalizedSession,
      eventLog,
      messages: normalizedMessages,
    }) || {
      ...normalizedSession,
      eventLog,
    }
  );
};

const normalizeStoredProjects = (projects: Record<string, ChatProjectState>) =>
  Object.fromEntries(
    Object.entries(projects || {}).map(([projectId, project]) => [
      projectId,
      {
        ...project,
        sessions: (project.sessions || []).map((session) =>
          normalizeChatSession(session as ChatSession)
        ),
      } satisfies ChatProjectState,
    ])
  );

const normalizePersistedChatState = (state: unknown) => {
  if (!state || typeof state !== 'object') {
    return state as AIChatStoreState;
  }

  const persistedState = state as AIChatStoreState;
  return {
    ...persistedState,
    projects: normalizeStoredProjects(persistedState.projects || {}),
  };
};

const stripSessionEventLog = (session: ChatSession): PersistedChatSession => {
  const { eventLog: _eventLog, ...persistedSession } = session;
  return persistedSession;
};

const buildPersistedProjects = (
  projects: Record<string, ChatProjectState>
): Record<string, PersistedChatProjectState> =>
  Object.fromEntries(
    Object.entries(projects || {}).map(([projectId, project]) => [
      projectId,
      {
        ...project,
        sessions: (project.sessions || []).map((session) => stripSessionEventLog(session as ChatSession)),
      },
    ])
  ) as Record<string, PersistedChatProjectState>;

const sortSessions = (sessions: ChatSession[]) =>
  [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);

const areReplayEventsEqual = (left: RuntimeReplayEvent[], right: RuntimeReplayEvent[]) =>
  JSON.stringify(left) === JSON.stringify(right);

const areRecoveryStatesEqual = (
  left: AgentReplayRecoveryState | null,
  right: AgentReplayRecoveryState | null
) => JSON.stringify(left) === JSON.stringify(right);

const getSessionReplayThreadId = (session: ChatSession) =>
  session.recoveryState?.replayThreadId || session.replayEvents[0]?.threadId || null;

const getNextCanonicalSeq = (session: ChatSession, runId: string) =>
  (session.canonicalEvents || [])
    .filter((event) => event.runId === runId)
    .reduce((max, event) => Math.max(max, event.seq), 0) + 1;

const normalizeCanonicalEventForSession = (
  session: ChatSession,
  event: CanonicalEvent,
): CanonicalEvent => ({
  ...event,
  sessionId: session.id,
  seq:
    typeof event.seq === 'number' && Number.isFinite(event.seq) && event.seq > 0
      ? event.seq
      : getNextCanonicalSeq(session, event.runId),
});

export const createStoredChatMessage = (
  role: StoredChatMessage['role'],
  content: string,
  tone: StoredChatMessage['tone'] = 'default',
  options?: {
    runId?: string;
    fallbackThinkingContent?: string;
    preferredAssistantParts?: AIChatMessagePart[];
    timeline?: AssistantTimelineEvent[];
  }
): StoredChatMessage => {
  const createdAt = Date.now();
  const base = {
    id: createMessageId(role),
    role,
    tone,
    ...(options?.runId ? { runId: options.runId } : {}),
    createdAt,
  };

  if (role === 'assistant') {
    return {
      ...base,
      role,
      timeline:
        options?.timeline ||
        buildAssistantTimelineFromContent(content, {
          fallbackThinkingContent: options?.fallbackThinkingContent,
          preferredAssistantParts: options?.preferredAssistantParts,
          thinkingCollapsed: true,
          createdAt,
        }),
    };
  }

  return {
    ...base,
    role,
    content,
  };
};

export const createChatSession = (
  projectId: string,
  title = '新对话',
  providerId: AgentProviderId = 'built-in'
): ChatSession => {
  const now = Date.now();
  const id = createSessionId();
  return {
    id,
    projectId,
    title,
    providerId,
    runtimeThreadId: null,
    composerPrefill: null,
    messages: [],
    canonicalEvents: [],
    replayEvents: [],
    recoveryState: null,
    eventLog: [
      createSessionInitializedEvent({
        projectId,
        title,
        providerId,
        runtimeThreadId: null,
        composerPrefill: null,
        createdAt: now,
      }),
    ],
    createdAt: now,
    updatedAt: now,
  };
};

export const useAIChatStore = create<AIChatStoreState>()(
  persist(
    (set) => ({
      projects: {},

      ensureProjectState: (projectId) =>
        set((state) => ({
          projects: state.projects[projectId]
            ? state.projects
            : { ...state.projects, [projectId]: createProjectState() },
        })),

      upsertSession: (projectId, session) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const normalizedSession = normalizeChatSession(session);
          const sessions = sortSessions([normalizedSession, ...project.sessions.filter((item) => item.id !== session.id)]);

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || session.id,
                sessions,
              },
            },
          };
        }),

      bindRuntimeThread: (projectId, sessionId, providerId, runtimeThreadId) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(session, createRuntimeThreadBoundEvent(providerId, runtimeThreadId))
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      setActiveSession: (projectId, sessionId) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...(state.projects[projectId] || createProjectState()),
              activeSessionId: sessionId,
            },
          },
        })),

      appendMessage: (projectId, sessionId, message) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const normalizedMessage = normalizeAssistantMessage(message);
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(session, createMessageAppendedEvent(normalizedMessage))
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      appendActivityEntry: (projectId, entry) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const activityEntries = [entry, ...project.activityEntries.filter((item) => item.id !== entry.id)].sort(
            (left, right) => right.createdAt - left.createdAt
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activityEntries,
              },
            },
          };
        }),

      appendCanonicalEvent: (projectId, sessionId, event) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id !== sessionId
              ? session
              : (() => {
                  const normalizedEvent = normalizeCanonicalEventForSession(session, event);
                  return {
                    ...session,
                    canonicalEvents: [
                      ...(session.canonicalEvents || []).filter(
                        (existingEvent) => existingEvent.eventId !== normalizedEvent.eventId
                      ),
                      normalizedEvent,
                    ],
                    updatedAt: Math.max(session.updatedAt, normalizedEvent.ts),
                  };
                })()
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      replaceCanonicalEvents: (projectId, sessionId, events) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id !== sessionId
              ? session
              : {
                  ...session,
                  canonicalEvents: normalizeCanonicalEvents(events, session.id),
                  updatedAt: Math.max(
                    session.updatedAt,
                    ...events.map((event) => event.ts),
                  ),
                }
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      setActivityEntries: (projectId, entries) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const activityEntries = [...entries].sort((left, right) => right.createdAt - left.createdAt);

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activityEntries,
              },
            },
          };
        }),

      updateMessage: (projectId, sessionId, messageId, updater) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id !== sessionId
              ? session
              : (() => {
                  const currentMessage = session.messages.find((message) => message.id === messageId);
                  if (!currentMessage) {
                    return session;
                  }
                  const nextMessage = normalizeAssistantMessage(updater(currentMessage));
                  return appendChatSessionEvent(
                    session,
                    createMessageUpdatedEvent(messageId, nextMessage)
                  );
                })()
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      queueComposerPrefill: (projectId, sessionId, prompt) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(
                  session,
                  createComposerPrefillQueuedEvent({
                    prompt,
                    nonce: Date.now(),
                  })
                )
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      clearComposerPrefill: (projectId, sessionId) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(session, createComposerPrefillClearedEvent())
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      syncSessionReplayState: (projectId, sessionId, replayThreadId, replayEvents, recoveryState) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? getSessionReplayThreadId(session) === replayThreadId &&
                areReplayEventsEqual(session.replayEvents, replayEvents) &&
                areRecoveryStatesEqual(session.recoveryState, recoveryState)
                ? session
                : appendChatSessionEvent(
                    session,
                    createReplayStateSyncedEvent({
                      replayThreadId,
                      replayEvents,
                      recoveryState,
                    })
                  )
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      replaceProjectSessions: (projectId, sessions, activeSessionId) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...(state.projects[projectId] || createProjectState()),
              activeSessionId: activeSessionId ?? sessions[0]?.id ?? null,
              sessions: sortSessions(sessions.map(normalizeChatSession)),
            },
          },
        })),

      replaceSessionMessages: (projectId, sessionId, messages) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const normalizedMessages = messages.map(normalizeAssistantMessage);
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(session, createMessagesReplacedEvent(normalizedMessages))
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId: project.activeSessionId || sessionId,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      renameSession: (projectId, sessionId, title) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? appendChatSessionEvent(session, createSessionRenamedEvent(title))
              : session
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                sessions: sortSessions(sessions),
              },
            },
          };
        }),

      removeSession: (projectId, sessionId) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.filter((session) => session.id !== sessionId);
          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                activeSessionId:
                  project.activeSessionId === sessionId ? sessions[0]?.id || null : project.activeSessionId,
                sessions,
              },
            },
          };
        }),
    }),
    {
      name: 'goodnight-ai-chat-store',
      version: AI_CHAT_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: buildPersistedProjects(state.projects),
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedChatState(persistedState),
      }),
      migrate: (persistedState, version) => {
        if (typeof version !== 'number' || version < AI_CHAT_STORE_VERSION) {
          return { projects: {} };
        }
        return normalizePersistedChatState(persistedState);
      },
    }
  )
);
