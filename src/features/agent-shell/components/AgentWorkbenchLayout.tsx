import React from 'react';

type AgentWorkbenchLayoutProps = {
  sidebar: React.ReactNode;
  centerStage: React.ReactNode;
  companion?: React.ReactNode;
  companionCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  sidebarWidthBounds?: { min: number; max: number };
  sidebarResizing?: boolean;
  onSidebarResizePointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onSidebarResizeKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
};

export const AgentWorkbenchLayout: React.FC<AgentWorkbenchLayoutProps> = ({
  sidebar,
  centerStage,
  companion,
  companionCollapsed = false,
  sidebarCollapsed = false,
  sidebarWidth,
  sidebarWidthBounds,
  sidebarResizing = false,
  onSidebarResizePointerDown,
  onSidebarResizeKeyDown,
}) => (
  <section
    className={`agent-workbench-shell${companionCollapsed ? ' has-collapsed-companion' : ''}${companion ? '' : ' has-no-companion'}${sidebarCollapsed ? ' has-collapsed-sidebar' : ''}${sidebarResizing ? ' is-resizing-sidebar' : ''}`}
  >
    <aside className="agent-workbench-sidebar-shell">{sidebar}</aside>
    <div
      className="agent-workbench-main-divider"
      role="separator"
      aria-label="Resize thread history panel"
      aria-orientation="vertical"
      aria-valuemin={sidebarWidthBounds?.min}
      aria-valuemax={sidebarWidthBounds?.max}
      aria-valuenow={sidebarWidth}
      aria-hidden={sidebarCollapsed}
      tabIndex={sidebarCollapsed ? -1 : 0}
      onPointerDown={sidebarCollapsed ? undefined : onSidebarResizePointerDown}
      onKeyDown={sidebarCollapsed ? undefined : onSidebarResizeKeyDown}
    />
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
