import React, { useMemo } from 'react';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { canResumeFromRecovery } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';
import { useProjectStore } from '../../../store/projectStore';

const formatTimelineTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatPreview = (value: string | null | undefined, fallback: string) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() || '';
  if (!normalized) {
    return fallback;
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
};

export const GNAgentTimelinePanel: React.FC<{
  latestTurnSession?: AgentTurnSession | null;
}> = ({ latestTurnSession = null }) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectSessions = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.sessions || [] : []
  );
  const activeSessionId = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
  );
  const activeSession = useMemo(
    () => projectSessions.find((session) => session.id === activeSessionId) || null,
    [activeSessionId, projectSessions]
  );
  const activeThreadId = activeSessionId || null;
  const activeReplayThreadId = activeSession?.runtimeThreadId || null;
  const timeline = useAgentRuntimeStore((state) =>
    activeThreadId ? state.timelineByThread[activeThreadId] || [] : []
  );
  const replayEvents = useAgentRuntimeStore((state) =>
    activeReplayThreadId ? state.replayEventsByThread[activeReplayThreadId] || [] : []
  );
  const recoveryState = useAgentRuntimeStore((state) =>
    activeThreadId ? state.recoveryByThread[activeThreadId] || null : null
  );
  const requestReplayResumeFromRecovery = useAgentRuntimeStore((state) => state.requestReplayResumeFromRecovery);
  const latestTeamRun = useAgentRuntimeStore((state) =>
    activeThreadId ? state.teamRunsByThread[activeThreadId]?.[0] || null : null
  );

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Timeline</strong>
        <span>{latestTurnSession?.status || 'idle'}</span>
      </div>
      {timeline.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">
          Timeline events, approvals, tool activity, and replay recovery will appear here for the current thread.
        </p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          <article className="gn-agent-runtime-card">
            <strong>Session</strong>
            <span>
              {timeline.length} events / {replayEvents.length} replay
            </span>
            <code>{latestTurnSession?.mode || 'direct'}</code>
          </article>
          {canResumeFromRecovery(recoveryState) ? (
            <article className="gn-agent-runtime-card">
              <strong>Recovery</strong>
              <span>{recoveryState?.summary}</span>
              <button
                type="button"
                className="gn-agent-runtime-inline-btn"
                onClick={() => requestReplayResumeFromRecovery(activeThreadId || '', recoveryState)}
              >
                {recoveryState?.resumeActionLabel || 'Resume latest input'}
              </button>
            </article>
          ) : null}
          {latestTeamRun ? (
            <article className="gn-agent-runtime-card">
              <strong>Multi-Agent Team</strong>
              <span>{latestTeamRun.strategy}</span>
              <code>{latestTeamRun.phases.length} phases</code>
            </article>
          ) : null}
          {latestTeamRun?.phases.map((phase) => (
            <details key={phase.id} className="gn-agent-runtime-card gn-agent-runtime-details">
              <summary className="gn-agent-runtime-details-summary">
                <strong>{phase.title}</strong>
                <span>{phase.status}</span>
              </summary>
              <span>{phase.goal}</span>
              {latestTeamRun.members
                .filter((member) => member.phaseId === phase.id)
                .map((member) => (
                  <details key={member.id} className="gn-agent-runtime-subcard gn-agent-runtime-details">
                    <summary className="gn-agent-runtime-details-summary">
                      <strong>{member.title}</strong>
                      <span>
                        {member.agentId} / {member.status}
                      </span>
                    </summary>
                    <span>{formatPreview(member.error || member.result, 'No member output yet.')}</span>
                    {member.error || member.result ? (
                      <pre className="gn-agent-runtime-pre">{member.error || member.result}</pre>
                    ) : null}
                  </details>
                ))}
            </details>
          ))}
          {timeline.slice(-8).reverse().map((event) => (
            <article key={event.id} className="gn-agent-runtime-card">
              <strong>{event.summary}</strong>
              <span>{event.providerId}</span>
              <code>{formatTimelineTime(event.createdAt)}</code>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
