import React, { useEffect } from 'react';
import { useActiveConversationApprovals, useActiveConversationLiveState, useActiveConversationSkillsAndRecovery } from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import { useAgentRuntimeStore } from '../../modules/ai/runtime/agentRuntimeStore.ts';

type AIChatRuntimeStatusPanelProps = {
  projectId: string | null;
  selectedAgentLabel: string;
  runtimeModelLabel: string;
  runtimeMcpServerCount: number;
  permissionModeLabel: string;
  currentContextUsage: {
    ratio: number;
    usedLabel: string;
    limitLabel: string;
  };
  isLoading: boolean;
  latestActivityType: string | null;
  stalled: boolean;
  stallDuration: number;
  hasRuntimeThread: boolean;
  patchLiveState: ReturnType<typeof useAgentRuntimeStore.getState>['patchLiveState'];
};

const getElapsedSecondsSince = (startedAt: number | null, fallback = 0) => {
  if (!startedAt) {
    return fallback;
  }

  return Math.max(fallback, Math.floor((Date.now() - startedAt) / 1000));
};

export const AIChatRuntimeStatusPanel = React.memo(function AIChatRuntimeStatusPanel({
  projectId,
  selectedAgentLabel,
  runtimeModelLabel,
  runtimeMcpServerCount,
  permissionModeLabel,
  currentContextUsage,
  isLoading,
  latestActivityType,
  stalled,
  stallDuration,
  hasRuntimeThread,
  patchLiveState,
}: AIChatRuntimeStatusPanelProps) {
  const { latestTurnSession, liveState, liveThreadId } = useActiveConversationLiveState({ projectId });
  const { pendingApprovals, pendingApprovalCount, approvalThreadId } = useActiveConversationApprovals({ projectId });
  const { activeSkills } = useActiveConversationSkillsAndRecovery({ projectId });

  useEffect(() => {
    if (!approvalThreadId) {
      return;
    }

    patchLiveState(approvalThreadId, (state) => ({
      ...state,
      pendingPermissionCount: pendingApprovals.length,
      pendingApprovalSummary: pendingApprovals[0]?.summary || null,
      statusVerb:
        pendingApprovals.length > 0
          ? 'Waiting for approval'
          : state.pendingPermissionCount > 0
            ? ''
            : state.statusVerb,
    }));
  }, [approvalThreadId, patchLiveState, pendingApprovals]);

  useEffect(() => {
    if (!liveThreadId) {
      return;
    }

    patchLiveState(liveThreadId, (state) => ({
      ...state,
      connectionState: hasRuntimeThread
        ? state.connectionState === 'disconnected'
          ? 'reconnecting'
          : 'connected'
        : 'disconnected',
    }));
  }, [hasRuntimeThread, liveThreadId, patchLiveState]);

  useEffect(() => {
    if (!liveThreadId || !liveState?.startedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      patchLiveState(liveThreadId, (state) => ({
        ...state,
        elapsedSeconds: getElapsedSecondsSince(state.startedAt, state.elapsedSeconds),
      }));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [liveState?.startedAt, liveThreadId, patchLiveState]);

  const latestTurnSessionStatus = latestTurnSession?.status || null;
  const runtimeConnectionLabel =
    liveState?.connectionState === 'connecting'
      ? 'Connecting'
      : liveState?.connectionState === 'reconnecting'
        ? 'Reconnecting'
        : liveState?.connectionState === 'connected'
          ? 'Connected'
          : 'Disconnected';
  const runStateLabel =
    latestTurnSessionStatus === 'planning'
      ? 'Planning'
      : latestTurnSessionStatus === 'waiting_approval'
        ? 'Approval required'
        : liveState?.pendingQuestionSummary
          ? 'Input required'
          : latestTurnSessionStatus === 'executing'
            ? stalled ? `Executing (stalled ${(stallDuration / 1000).toFixed(0)}s)` : 'Executing'
            : latestTurnSessionStatus === 'resumable'
              ? 'Resume ready'
              : latestTurnSessionStatus === 'completed'
                ? 'Completed'
                : latestTurnSessionStatus === 'failed'
                  ? 'Failed'
                  : pendingApprovalCount > 0
                    ? 'Approval required'
                    : liveState?.statusVerb
                      ? liveState.statusVerb
                      : isLoading
                        ? 'Running'
                        : latestActivityType === 'failed'
                          ? 'Failed'
                          : 'Idle';
  const runStateTone =
    latestTurnSessionStatus === 'waiting_approval' || latestTurnSessionStatus === 'resumable'
      ? 'warning'
      : liveState?.pendingQuestionSummary
        ? 'warning'
        : latestTurnSessionStatus === 'failed'
          ? 'error'
          : latestTurnSessionStatus === 'completed'
            ? 'success'
            : pendingApprovalCount > 0
              ? 'warning'
              : isLoading
                ? stalled ? 'stalled' : 'running'
                : latestActivityType === 'failed'
                  ? 'error'
                  : '';

  return (
    <div className="chat-shell-status-strip">
      <span className="chat-shell-status-pill">{selectedAgentLabel}</span>
      <span className="chat-shell-status-pill">{runtimeModelLabel}</span>
      <span className="chat-shell-status-pill">Session / {runtimeConnectionLabel}</span>
      <span className="chat-shell-status-pill">Skills / {activeSkills.length}</span>
      <span className="chat-shell-status-pill">MCP / {runtimeMcpServerCount}</span>
      <span className="chat-shell-status-pill">权限模式 / {permissionModeLabel}</span>
      <span className={`chat-shell-status-pill ${pendingApprovalCount > 0 ? 'warning' : ''}`}>
        Approvals / {pendingApprovalCount}
      </span>
      {liveState?.activeToolName ? (
        <span className="chat-shell-status-pill">Tool / {liveState.activeToolName}</span>
      ) : null}
      {liveState?.streamingToolInput ? (
        <span className="chat-shell-status-pill">Input / {liveState.streamingToolInput}</span>
      ) : null}
      {liveState?.pendingQuestionSummary ? (
        <span className="chat-shell-status-pill warning">Question / Waiting</span>
      ) : null}
      <span className="chat-shell-status-pill">Elapsed / {liveState?.elapsedSeconds || 0}s</span>
      <span className="chat-shell-status-pill">
        Tokens / ~{liveState?.tokenUsage.inputTokens || 0} in / ~{liveState?.tokenUsage.outputTokens || 0} out
      </span>
      <span className={`chat-shell-status-pill ${currentContextUsage.ratio >= 0.8 ? 'warning' : ''}`}>
        {currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}
      </span>
      <span className={`chat-shell-status-pill ${runStateTone}`}>{runStateLabel}</span>
    </div>
  );
});
