import React, { useMemo } from 'react';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import type { PermissionMode } from '../../../modules/ai/runtime/approval/approvalTypes';
import { PERMISSION_MODE_LABELS } from '../../../modules/ai/runtime/approval/permissionMode';
import type { AgentRuntimeLiveState } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';
import type { AgentTeamRunRecord } from '../../../modules/ai/runtime/teams/teamTypes';

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
  currentProjectName: string | null;
  sessionCount: number;
  activeSessionId: string | null;
  activityEntries: ActivityEntry[];
  latestTeamRun: AgentTeamRunRecord | null;
  activeLiveState: AgentRuntimeLiveState | null;
  pendingApprovalCount: number;
  permissionMode: PermissionMode;
}> = ({
  latestTurnSession = null,
  currentProjectName,
  sessionCount,
  activeSessionId,
  activityEntries,
  latestTeamRun,
  activeLiveState,
  pendingApprovalCount,
  permissionMode,
}) => {
  const recentActivity = useMemo(() => activityEntries.slice(0, 3), [activityEntries]);
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
          <strong>{currentProjectName || 'No project open'}</strong>
          <span>{latestTurnSession?.plan?.summary || `${sessionCount} sessions`}</span>
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
