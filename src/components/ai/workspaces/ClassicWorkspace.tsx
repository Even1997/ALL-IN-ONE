import React from 'react';
import { AIChat } from '../../workspace/AIChat';

export const ClassicWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
}> = ({ mode = 'full-page' }) => (
  <section className={`provider-workspace provider-workspace-classic provider-workspace-${mode}`}>
    <div className="classic-workspace-shell">
      <header className="classic-workspace-header">
        <span className="claudian-context-badge">Classic</span>
        <h3>Classic Compatibility Workspace</h3>
      </header>
      <AIChat variant={mode === 'full-page' ? 'default' : 'claudian-embedded'} />
    </div>
  </section>
);
