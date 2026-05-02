import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

const formatStatusTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const GNAgentStatusPanel: React.FC = () => {
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
        <span>{activeSessionId ? 'active' : 'idle'}</span>
      </div>
      <div className="gn-agent-runtime-panel-list">
        <article className="gn-agent-runtime-card">
          <strong>{currentProject?.name || '未打开项目'}</strong>
          <span>{projectChatState?.sessions.length || 0} sessions</span>
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
          <span className="gn-agent-runtime-panel-empty">暂无活动</span>
        )}
      </div>
    </section>
  );
};
