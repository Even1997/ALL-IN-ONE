import React from 'react';

type AgentWorkbenchLayoutProps = {
  sidebar: React.ReactNode;
  centerStage: React.ReactNode;
  floatingOverlay?: React.ReactNode;
};

export const AgentWorkbenchLayout: React.FC<AgentWorkbenchLayoutProps> = ({
  sidebar,
  centerStage,
  floatingOverlay,
}) => (
  <section className="agent-workbench-shell">
    <aside className="agent-workbench-sidebar-shell">{sidebar}</aside>
    <main className="agent-workbench-center">
      <div className="agent-workbench-center-body">
        {centerStage}
        {floatingOverlay ? (
          <div className="agent-workbench-floating-overlay">{floatingOverlay}</div>
        ) : null}
      </div>
    </main>
  </section>
);
