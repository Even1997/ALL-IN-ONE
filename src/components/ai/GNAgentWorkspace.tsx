import React from 'react';
import { AIChat } from '../workspace/AIChat';

type GNAgentWorkspaceProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export const GNAgentWorkspace: React.FC<GNAgentWorkspaceProps> = ({ collapsed, onCollapsedChange }) => (
  <section className="gn-agent-workspace">
    <AIChat variant="gn-agent-embedded" collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
  </section>
);
