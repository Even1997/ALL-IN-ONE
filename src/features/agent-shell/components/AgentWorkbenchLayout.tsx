import React from 'react';

type AgentWorkbenchLayoutProps = {
  sidebar: React.ReactNode;
  centerStage: React.ReactNode;
  companion?: React.ReactNode;
  companionCollapsed?: boolean;
};

export const AgentWorkbenchLayout: React.FC<AgentWorkbenchLayoutProps> = ({
  sidebar,
  centerStage,
  companion,
  companionCollapsed = false,
}) => (
  <section className={`agent-workbench-shell${companionCollapsed ? ' has-collapsed-companion' : ''}`}>
    <aside className="agent-workbench-sidebar-shell">{sidebar}</aside>
    <main className="agent-workbench-center">
      <div className="agent-workbench-center-body">{centerStage}</div>
    </main>
    {companion ? (
      <aside className={`agent-workbench-companion${companionCollapsed ? ' is-collapsed' : ''}`}>
        {companion}
      </aside>
    ) : null}
  </section>
);
