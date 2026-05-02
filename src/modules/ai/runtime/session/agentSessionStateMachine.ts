import type { AgentTurnSession } from './agentSessionTypes';

export type AgentTurnSessionEvent =
  | { type: 'start_classifying' }
  | { type: 'enter_planning' }
  | { type: 'plan_waiting_approval' }
  | { type: 'approval_granted' }
  | { type: 'execution_blocked'; reason: string; actionLabel: string | null }
  | { type: 'execution_completed' }
  | { type: 'execution_failed'; reason: string };

export const reduceAgentTurnSession = (
  session: AgentTurnSession,
  event: AgentTurnSessionEvent,
): AgentTurnSession => {
  const updatedAt = Date.now();

  switch (event.type) {
    case 'start_classifying':
      return {
        ...session,
        status: 'classifying',
        updatedAt,
      };
    case 'enter_planning':
      return {
        ...session,
        mode: 'plan_then_execute',
        status: 'planning',
        updatedAt,
      };
    case 'plan_waiting_approval':
      return {
        ...session,
        status: 'waiting_approval',
        updatedAt,
      };
    case 'approval_granted':
      return {
        ...session,
        status: 'executing',
        resumeSnapshot: null,
        updatedAt,
      };
    case 'execution_blocked':
      return {
        ...session,
        status: 'resumable',
        resumeSnapshot: {
          turnId: session.id,
          resumeFromStepId: null,
          resumeReason: event.reason,
          blockingRequirement: event.reason,
          resumeActionLabel: event.actionLabel,
          lastStableOutput: '',
        },
        updatedAt,
      };
    case 'execution_completed':
      return {
        ...session,
        status: 'completed',
        resumeSnapshot: null,
        updatedAt,
      };
    case 'execution_failed':
      return {
        ...session,
        status: 'failed',
        updatedAt,
      };
  }
};
