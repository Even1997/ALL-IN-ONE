import React from 'react';
import { GNAgentShell } from './gn-agent-shell/GNAgentShell';

type GNAgentWorkspaceProps = {
  mode?: 'panel';
};

export const GNAgentWorkspace: React.FC<GNAgentWorkspaceProps> = () => (
  <section className="gn-agent-workspace gn-agent-workspace-panel">
    <GNAgentShell mode="panel" />
  </section>
);

