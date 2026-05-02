import type { AgentTurnSession } from './agentSessionTypes';

export const getLatestTurnSession = (
  sessions: AgentTurnSession[] | null | undefined,
): AgentTurnSession | null => {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  return sessions[sessions.length - 1] || null;
};
