import React from 'react';
import { ClaudianShell } from './claudian-shell/ClaudianShell';

type ClaudianWorkspaceProps = {
  mode?: 'panel';
};

export const ClaudianWorkspace: React.FC<ClaudianWorkspaceProps> = () => (
  <section className="claudian-workspace claudian-workspace-panel">
    <ClaudianShell mode="panel" />
  </section>
);
