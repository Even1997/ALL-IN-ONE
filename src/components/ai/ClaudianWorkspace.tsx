import React from 'react';
import { ClaudianShell } from './claudian-shell/ClaudianShell';

type ClaudianWorkspaceProps = {
  mode?: 'panel' | 'full-page';
};

export const ClaudianWorkspace: React.FC<ClaudianWorkspaceProps> = ({ mode = 'panel' }) => (
  <section className={`claudian-workspace claudian-workspace-${mode}`}>
    <ClaudianShell mode={mode} />
  </section>
);
