import React, { useMemo } from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';
import { useShallow } from 'zustand/react/shallow';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import { PERMISSION_MODE_LABELS } from '../../../modules/ai/runtime/approval/permissionMode';
import { useProjectStore } from '../../../store/projectStore';

const formatStatusTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatPreview = (value: string | null | undefined, fallback: string) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() || '';
  if (!normalized) {
    return fallback;
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
};

export const GNAgentStatusPanel: React.FC<{
  latestTurnSession?: AgentTurnSession | null;
}> = ({ latestTurnSession = null }) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectChatState = useAIChatStore(
    useShallow((state) => (currentProject ? state.projects[currentProject.id] || null : null))
  );
  const activityEntries = projectChatState?.activityEntries || [];
  const recentActivity = useMemo(() => activityEntries.slice(0, 3), [activityEntries]);
  const activeSessionId = projectChatState?.activeSessionId || projectChatState?.sessions[0]?.id || null;
  const { latestTeamRun, activeLiveState } = useAgentRuntimeStore(
    useShallow((state) => ({
      latestTeamRun: activeSessionId ? state.teamRunsByThread[activeSessionId]?.[0] || null : null,
      activeLiveState: activeSessionId ? state.liveStateByThread[activeSessionId] || null : null,
    }))
  );
  const { approvalsByThread, permissionMode } = useApprovalStore(
    useShallow((state) => ({
      approvalsByThread: state.approvalsByThread,
      permissionMode: state.permissionMode,
    }))
  );
  const pendingApprovalCount = useMemo(
    () =>
      activeSessionId
        ? (approvalsByThread[activeSessionId] || []).filter((approval) => approval.status === 'pending').length
        : 0,
    [activeSessionId, approvalsByThread]
  );
  const runtimeConnectionLabel =
    activeLiveState?.connectionState === 'connecting'
      ? 'Connecting'
      : activeLiveState?.connectionState === 'reconnecting'
        ? 'Reconnecting'
        : activeLiveState?.connectionState === 'connected'
          ? 'Connected'
          : 'Disconnected';

  return (
    <section className="gn-agent-runtime-panel gn-agent-status-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Agent Status</strong>
        <span>{latestTurnSession?.status || (activeSessionId ? 'active' : 'idle')}</span>
      </div>
      <div className="gn-agent-runtime-panel-list">
        <article className="gn-agent-runtime-card">
          <strong>{currentProject?.name || 'No project open'}</strong>
          <span>{latestTurnSession?.plan?.summary || `${projectChatState?.sessions.length || 0} sessions`}</span>
        </article>
        {activeSessionId ? (
          <article className="gn-agent-runtime-card">
            <strong>Session Runtime</strong>
            <span>{activeLiveState?.statusVerb || latestTurnSession?.status || 'idle'}</span>
            <code>
              {runtimeConnectionLabel} / {activeLiveState?.activeToolName || 'idle'} / {activeLiveState?.elapsedSeconds || 0}s / ~
              {activeLiveState?.tokenUsage.inputTokens || 0} / ~{activeLiveState?.tokenUsage.outputTokens || 0}
            </code>
            <code>
              {PERMISSION_MODE_LABELS[permissionMode]} / approvals {pendingApprovalCount}
            </code>
            {activeLiveState?.streamingToolInput ? (
              <span>{formatPreview(activeLiveState.streamingToolInput, '')}</span>
            ) : null}
            {activeLiveState?.pendingApprovalSummary ? <span>{activeLiveState.pendingApprovalSummary}</span> : null}
            {activeLiveState?.pendingQuestionSummary ? <span>{activeLiveState.pendingQuestionSummary}</span> : null}
          </article>
        ) : null}
        {latestTeamRun ? (
          <article className="gn-agent-runtime-card">
            <strong>Team Run</strong>
            <span>{latestTeamRun.summary}</span>
            <code>{latestTeamRun.status}</code>
          </article>
        ) : null}
        {latestTeamRun?.phases.map((phase) => (
          <article className="gn-agent-runtime-card" key={phase.id}>
            <strong>{phase.title}</strong>
            <span>{phase.goal}</span>
            <code>{phase.status}</code>
          </article>
        ))}
        {latestTeamRun?.members.slice(0, 4).map((member) => (
          <details className="gn-agent-runtime-card gn-agent-runtime-details" key={member.id}>
            <summary className="gn-agent-runtime-details-summary">
              <strong>{member.title}</strong>
              <span>
                {member.phaseId} / {member.agentId} / {member.status}
              </span>
            </summary>
            <span>{formatPreview(member.error || member.result, 'No member output yet.')}</span>
            {member.error || member.result ? (
              <pre className="gn-agent-runtime-pre">{member.error || member.result}</pre>
            ) : null}
          </details>
        ))}
        <div className="gn-agent-runtime-panel-head">
          <strong>Recent Activity</strong>
          <span>{activityEntries.length}</span>
        </div>
        {recentActivity.length > 0 ? (
          recentActivity.map((entry) => (
            <article className="gn-agent-runtime-card" key={entry.id}>
              <strong>{entry.summary}</strong>
              <span>{entry.skill || entry.type}</span>
              <code>{formatStatusTime(entry.createdAt)}</code>
            </article>
          ))
        ) : (
          <span className="gn-agent-runtime-panel-empty">No recent activity</span>
        )}
      </div>
    </section>
  );
};
