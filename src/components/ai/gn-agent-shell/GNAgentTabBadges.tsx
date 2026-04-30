import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

export const GNAgentTabBadges: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectChatState = useAIChatStore(
    useShallow((state) => (currentProject ? state.projects[currentProject.id] || null : null))
  );
  const setActiveSession = useAIChatStore((state) => state.setActiveSession);

  const sessions = projectChatState?.sessions || [];
  const activeSessionId = projectChatState?.activeSessionId || sessions[0]?.id || null;
  const visibleSessions = useMemo(() => sessions.slice(0, 9), [sessions]);

  if (!currentProject) {
    return null;
  }

  return (
    <div className="gn-agent-tab-badges">
      {(visibleSessions.length > 0 ? visibleSessions : [{ id: 'placeholder', title: '浼氳瘽 1' }]).map((session, index) => {
        const isActive = session.id === activeSessionId || (visibleSessions.length === 0 && index === 0);
        return (
          <button
            key={session.id}
            type="button"
            className={`gn-agent-tab-badge ${isActive ? 'gn-agent-tab-badge-active' : 'gn-agent-tab-badge-idle'}`}
            aria-label={session.title}
            title={session.title}
            onClick={() => {
              if (visibleSessions.length === 0) {
                return;
              }
              setActiveSession(currentProject.id, session.id);
            }}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
};

