import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

export const ClaudianStatusPanel: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const activityEntries = useAIChatStore(
    useShallow((state) => (currentProject ? state.projects[currentProject.id]?.activityEntries || [] : []))
  );

  const visibleEntries = activityEntries.slice(0, 3);

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <section className="claudian-status-panel">
      <div className="claudian-status-panel-header">
        <strong>Recent Activity</strong>
        <span>{visibleEntries.length}</span>
      </div>
      <div className="claudian-status-panel-content">
        {visibleEntries.map((entry) => (
          <article key={entry.id} className="claudian-status-panel-entry">
            <strong>{entry.summary}</strong>
            <span>{entry.runtime}</span>
          </article>
        ))}
      </div>
    </section>
  );
};
