import { create } from 'zustand';
import type { CodexMessage, CodexSession } from './types';

const createCodexMessageId = () => `codex_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createCodexSession = (title = 'New Codex Session'): CodexSession => {
  const now = Date.now();
  return {
    id: `codex_${now}`,
    title,
    messages: [],
    active: false,
    createdAt: now,
    updatedAt: now,
  };
};

type CodexSessionState = {
  sessions: CodexSession[];
  activeSessionId: string | null;
  addSession: (session?: CodexSession) => CodexSession;
  setActiveSession: (sessionId: string | null) => void;
  appendMessage: (sessionId: string, message: Omit<CodexMessage, 'id' | 'createdAt'> & Partial<Pick<CodexMessage, 'id' | 'createdAt'>>) => void;
};

export const useCodexSessionStore = create<CodexSessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  addSession: (session = createCodexSession()) => {
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
                  id: message.id || createCodexMessageId(),
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
