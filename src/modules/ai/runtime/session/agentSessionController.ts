import type { RuntimePendingApprovalAction } from '../orchestration/runtimeApprovalCoordinator.ts';
import type { AgentTurnSessionMode } from './agentSessionTypes';

export const decideAgentTurnMode = (input: {
  prompt: string;
  suggestedPlanMode: boolean;
  riskyWriteDetected: boolean;
  bashDetected: boolean;
  multiStepDetected: boolean;
}): {
  mode: AgentTurnSessionMode;
  reason: 'risk-rule' | 'complexity' | 'direct';
} => {
  if (input.riskyWriteDetected || input.bashDetected) {
    return {
      mode: 'plan_then_execute',
      reason: 'risk-rule',
    };
  }

  if (input.suggestedPlanMode || input.multiStepDetected) {
    return {
      mode: 'plan_then_execute',
      reason: 'complexity',
    };
  }

  return {
    mode: 'direct',
    reason: 'direct',
  };
};

export const buildPlanApprovalContinuation = (input: {
  onApprovedExecute: () => Promise<void>;
  onDeniedBlock: () => Promise<void>;
}): RuntimePendingApprovalAction => ({
  onApprove: input.onApprovedExecute,
  onDeny: input.onDeniedBlock,
});
