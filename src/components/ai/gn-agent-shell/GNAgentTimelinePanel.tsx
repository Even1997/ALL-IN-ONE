import React, { useMemo } from 'react';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { canResumeFromRecovery } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { useProjectStore } from '../../../store/projectStore';

const formatTimelineTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const GNAgentTimelinePanel: React.FC = () => {
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

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Timeline</strong>
        <span>
          {timeline.length} events / {replayEvents.length} replay
        </span>
      </div>
      {timeline.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">
          这里会显示当前 thread 的 thinking、tool、approval、reply 轨迹，以及可用于恢复的 replay 记录。
        </p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {canResumeFromRecovery(recoveryState) ? (
            <article className="gn-agent-runtime-card">
              <strong>Recovery</strong>
              <span>{recoveryState?.summary}</span>
              <button
                type="button"
                className="gn-agent-runtime-inline-btn"
                onClick={() => requestReplayResumeFromRecovery(activeThreadId || '', recoveryState)}
              >
                {recoveryState?.resumeActionLabel || '恢复最近一次输入'}
              </button>
            </article>
          ) : null}
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
