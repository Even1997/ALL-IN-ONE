import React, { useMemo } from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';
import { useShallow } from 'zustand/react/shallow';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

const formatStatusTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

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
