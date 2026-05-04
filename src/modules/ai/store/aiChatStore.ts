import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActivityEntry } from '../skills/activityLog';
import type { ChatStructuredCard } from '../chat/chatCards';
import type { KnowledgeProposal } from '../../../features/knowledge/model/knowledgeProposal';
import type { ProjectFileProposal } from '../chat/projectFileOperations';
import type { AgentProviderId } from '../runtime/agentRuntimeTypes';
import type { RuntimeToolStep } from '../runtime/agent-kernel/agentKernelTypes';
import type { AgentTeamRunRecord } from '../runtime/teams/teamTypes';
import {
  buildAssistantStructuredContentState,
  type AIChatMessagePart,
} from '../../../components/workspace/aiChatMessageParts';

export type RuntimeQuestionOption = {
  label: string;
  description?: string;
};

export type RuntimeQuestionItem = {
  question: string;
  header?: string;
  options?: RuntimeQuestionOption[];
};

export type RuntimeQuestionPayload = {
  id: string;
  toolCallId?: string | null;
  status: 'pending' | 'answered';
  questions: RuntimeQuestionItem[];
  answers?: Record<string, string>;
  createdAt: number;
};

export type ComposerPrefillPayload = {
  prompt: string;
  nonce: number;
};

export type StoredChatRuntimeFileChange = {
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
};

export type StoredChatRuntimeApprovalDisplay = {
  toolName?: string | null;
  command?: string | null;
  filePath?: string | null;
  oldString?: string | null;
  newString?: string | null;
  content?: string | null;
  inputJson?: string | null;
};

export type StoredChatRuntimeEvent =
  | {
      id: string;
      kind: 'tool_use';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      input: Record<string, unknown>;
      status: RuntimeToolStep['status'];
      createdAt: number;
    }
  | {
      id: string;
      kind: 'tool_result';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      status: RuntimeToolStep['status'];
      output: string;
      fileChanges?: StoredChatRuntimeFileChange[];
      createdAt: number;
    }
  | {
      id: string;
      kind: 'approval';
      approvalId: string;
      toolCallId?: string | null;
      actionType: string;
      summary: string;
      riskLevel: 'low' | 'medium' | 'high';
      status: 'pending' | 'approved' | 'denied';
      display?: StoredChatRuntimeApprovalDisplay;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'question';
      questionId: string;
      payload: RuntimeQuestionPayload;
      createdAt: number;
    };

export type StoredChatAssistantPart =
  | { type: 'text'; content: string; createdAt?: number }
  | { type: 'thinking'; content: string; collapsed: boolean; createdAt?: number }
  | {
      type: 'tool';
      name: string;
      title: string;
      status: 'running' | 'success' | 'error';
      command?: string;
      input?: string;
      output?: string;
      createdAt?: number;
    };

export type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinkingContent?: string;
  answerContent?: string;
  assistantParts?: StoredChatAssistantPart[];
  tone?: 'default' | 'error';
  runId?: string;
  toolCalls?: RuntimeToolStep[];
  runtimeEvents?: StoredChatRuntimeEvent[];
  teamRun?: AgentTeamRunRecord | null;
  structuredCards?: ChatStructuredCard[];
  knowledgeProposal?: KnowledgeProposal;
  projectFileProposal?: ProjectFileProposal;
  runtimeQuestion?: RuntimeQuestionPayload;
  createdAt: number;
};

export type ChatSession = {
  id: string;
  projectId: string;
  title: string;
  providerId: AgentProviderId;
  runtimeThreadId: string | null;
  composerPrefill?: ComposerPrefillPayload | null;
  messages: StoredChatMessage[];
  createdAt: number;
  updatedAt: number;
};

type ChatProjectState = {
  activeSessionId: string | null;
  sessions: ChatSession[];
  activityEntries: ActivityEntry[];
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
  replaceSessionMessages: (projectId: string, sessionId: string, messages: StoredChatMessage[]) => void;
  renameSession: (projectId: string, sessionId: string, title: string) => void;
  removeSession: (projectId: string, sessionId: string) => void;
};

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

  const hasStructuredState =
    typeof message.thinkingContent === 'string' ||
    typeof message.answerContent === 'string' ||
    (Array.isArray(message.assistantParts) && message.assistantParts.length > 0);

  if (hasStructuredState) {
    return message;
  }

  const structured = buildAssistantStructuredContentState({
    content: message.content,
    preferredAssistantParts: message.assistantParts as AIChatMessagePart[] | undefined,
    thinkingCollapsed: true,
  });

  return {
    ...message,
    content: structured.content,
    thinkingContent: structured.thinkingContent,
    answerContent: structured.answerContent,
    assistantParts: structured.assistantParts,
  };
};

const normalizeStoredProjects = (projects: Record<string, ChatProjectState>) =>
  Object.fromEntries(
    Object.entries(projects || {}).map(([projectId, project]) => [
      projectId,
      {
        ...project,
        sessions: (project.sessions || []).map((session) => ({
          ...session,
          messages: (session.messages || []).map(normalizeAssistantMessage),
        })),
      } satisfies ChatProjectState,
    ])
  );

const sortSessions = (sessions: ChatSession[]) =>
  [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);

export const createStoredChatMessage = (
  role: StoredChatMessage['role'],
  content: string,
  tone: StoredChatMessage['tone'] = 'default',
  options?: Pick<StoredChatMessage, 'runId' | 'thinkingContent' | 'answerContent' | 'assistantParts'>
): StoredChatMessage => ({
  id: createMessageId(role),
  role,
  content,
  ...(typeof options?.thinkingContent === 'string' ? { thinkingContent: options.thinkingContent } : {}),
  ...(typeof options?.answerContent === 'string' ? { answerContent: options.answerContent } : {}),
  ...(Array.isArray(options?.assistantParts) ? { assistantParts: options.assistantParts } : {}),
  tone,
  ...(options?.runId ? { runId: options.runId } : {}),
  createdAt: Date.now(),
});

export const createChatSession = (
  projectId: string,
  title = '新对话',
  providerId: AgentProviderId = 'built-in'
): ChatSession => {
  const now = Date.now();
  return {
    id: createSessionId(),
    projectId,
    title,
    providerId,
    runtimeThreadId: null,
    composerPrefill: null,
    messages: [],
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
          const normalizedSession = {
            ...session,
            messages: (session.messages || []).map(normalizeAssistantMessage),
          };
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
              ? {
                  ...session,
                  providerId,
                  runtimeThreadId,
                  updatedAt: Date.now(),
                }
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
              ? {
                  ...session,
                  messages: [...session.messages, normalizedMessage],
                  updatedAt: Date.now(),
                }
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
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((message) =>
                    message.id === messageId ? normalizeAssistantMessage(updater(message)) : message
                  ),
                  updatedAt: Date.now(),
                }
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

      queueComposerPrefill: (projectId, sessionId, prompt) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  composerPrefill: {
                    prompt,
                    nonce: Date.now(),
                  },
                  updatedAt: Date.now(),
                }
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
              ? {
                  ...session,
                  composerPrefill: null,
                  updatedAt: Date.now(),
                }
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

      replaceSessionMessages: (projectId, sessionId, messages) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const normalizedMessages = messages.map(normalizeAssistantMessage);
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: normalizedMessages,
                  updatedAt: Date.now(),
                }
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
              ? {
                  ...session,
                  title,
                  updatedAt: Date.now(),
                }
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as AIChatStoreState;
        }

        const state = persistedState as AIChatStoreState;
        return {
          ...state,
          projects: normalizeStoredProjects(state.projects || {}),
        };
      },
    }
  )
);
