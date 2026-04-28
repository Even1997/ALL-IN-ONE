import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GNAgentWorkspace } from './GNAgentWorkspace';
import { useProjectStore } from '../../store/projectStore';
import './AIWorkspace.css';

type AIWorkspaceProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export const AIWorkspace: React.FC<AIWorkspaceProps> = ({ collapsed, onCollapsedChange }) => {
  const { currentProject } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
    }))
  );

  if (!currentProject) {
    return null;
  }

  return (
    <section className="floating-ai-workspace">
      <div className="ai-workspace-shell">
        <div className="ai-workspace-body">
          <GNAgentWorkspace collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
        </div>
      </div>
    </section>
  );
};
