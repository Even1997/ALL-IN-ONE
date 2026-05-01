import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActivityEntry } from '../skills/activityLog';
import type { ChatStructuredCard } from '../chat/chatCards';
import type { KnowledgeProposal } from '../../../features/knowledge/model/knowledgeProposal';
import type { ProjectFileProposal } from '../chat/projectFileOperations';

export type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tone?: 'default' | 'error';
  structuredCards?: ChatStructuredCard[];
  knowledgeProposal?: KnowledgeProposal;
  projectFileProposal?: ProjectFileProposal;
  createdAt: number;
};

export type ChatSession = {
  id: string;
  projectId: string;
  title: string;
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
  setActiveSession: (projectId: string, sessionId: string) => void;
  appendMessage: (projectId: string, sessionId: string, message: StoredChatMessage) => void;
  appendActivityEntry: (projectId: string, entry: ActivityEntry) => void;
  updateMessage: (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: StoredChatMessage) => StoredChatMessage
  ) => void;
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

const sortSessions = (sessions: ChatSession[]) =>
  [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);

export const createStoredChatMessage = (
  role: StoredChatMessage['role'],
  content: string,
  tone: StoredChatMessage['tone'] = 'default'
): StoredChatMessage => ({
  id: createMessageId(role),
  role,
  content,
  tone,
  createdAt: Date.now(),
});

export const createChatSession = (projectId: string, title = '新对话'): ChatSession => {
  const now = Date.now();
  return {
    id: createSessionId(),
    projectId,
    title,
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
          const sessions = sortSessions([session, ...project.sessions.filter((item) => item.id !== session.id)]);

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
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: [...session.messages, message],
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

      updateMessage: (projectId, sessionId, messageId, updater) =>
        set((state) => {
          const project = state.projects[projectId] || createProjectState();
          const sessions = project.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((message) =>
                    message.id === messageId ? updater(message) : message
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
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
