import React from 'react';

type AgentWorkbenchLayoutProps = {
  sidebar: React.ReactNode;
  centerStage: React.ReactNode;
  companion?: React.ReactNode;
};

export const AgentWorkbenchLayout: React.FC<AgentWorkbenchLayoutProps> = ({
  sidebar,
  centerStage,
  companion,
}) => (
  <section className="agent-workbench-shell">
    <aside className="agent-workbench-sidebar-shell">{sidebar}</aside>
    <main className="agent-workbench-center">
      <div className="agent-workbench-center-body">{centerStage}</div>
    </main>
    {companion ? <aside className="agent-workbench-companion">{companion}</aside> : null}
  </section>
);
