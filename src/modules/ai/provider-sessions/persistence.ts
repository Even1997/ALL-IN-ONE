import type { ClaudeSession, CodexSession } from './types';

export type ProviderSessionPersistenceSnapshot = {
  claudeSessions: ClaudeSession[];
  codexSessions: CodexSession[];
};

export const createEmptyProviderSessionSnapshot = (): ProviderSessionPersistenceSnapshot => ({
  claudeSessions: [],
  codexSessions: [],
});
