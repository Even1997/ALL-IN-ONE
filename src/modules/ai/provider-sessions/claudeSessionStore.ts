import { create } from 'zustand';
import type { ClaudeMessage, ClaudeSession } from './types';

const createClaudeMessageId = () => `claude_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createClaudeSession = (title = 'New Claude Session'): ClaudeSession => {
  const now = Date.now();
  return {
    id: `claude_${now}`,
    title,
    messages: [],
    active: false,
    createdAt: now,
    updatedAt: now,
  };
};

type ClaudeSessionState = {
  sessions: ClaudeSession[];
  activeSessionId: string | null;
  addSession: (session?: ClaudeSession) => ClaudeSession;
  setActiveSession: (sessionId: string | null) => void;
  appendMessage: (sessionId: string, message: Omit<ClaudeMessage, 'id' | 'createdAt'> & Partial<Pick<ClaudeMessage, 'id' | 'createdAt'>>) => void;
};

export const useClaudeSessionStore = create<ClaudeSessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  addSession: (session = createClaudeSession()) => {
    set((state) => ({
      sessions: [...state.sessions.map((item) => ({ ...item, active: false })), { ...session, active: true }],
      activeSessionId: session.id,
    }));
    return session;
  },
  setActiveSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((item) => ({
        ...item,
        active: item.id === sessionId,
      })),
      activeSessionId: sessionId,
    })),
  appendMessage: (sessionId, message) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              updatedAt: Date.now(),
              messages: [
                ...session.messages,
                {
                  id: message.id || createClaudeMessageId(),
                  role: message.role,
                  content: message.content,
                  createdAt: message.createdAt || Date.now(),
                },
              ],
            }
          : session
      ),
      activeSessionId: get().activeSessionId,
    })),
}));
