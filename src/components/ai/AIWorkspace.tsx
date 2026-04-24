import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AIChat } from '../workspace/AIChat';
import { useProjectStore } from '../../store/projectStore';
import './AIWorkspace.css';

export const AIWorkspace: React.FC = () => {
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
      <AIChat />
    </section>
  );
};
