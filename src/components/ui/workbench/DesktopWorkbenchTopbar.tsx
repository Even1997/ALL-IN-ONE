import type { MouseEventHandler, ReactNode } from 'react';
import { MacPanel } from '../MacPanel';

type DesktopWorkbenchTopbarProps = {
  menuBar: ReactNode;
  roleLabel: string;
  projectName: string;
  projectSubtitle: string;
  context: ReactNode;
  actions: ReactNode;
  windowControls: ReactNode;
  onTitleDoubleClick?: MouseEventHandler<HTMLDivElement>;
};

export const DesktopWorkbenchTopbar = ({
  menuBar,
  roleLabel,
  projectName,
  projectSubtitle,
  context,
  actions,
  windowControls,
  onTitleDoubleClick,
}: DesktopWorkbenchTopbarProps) => (
  <MacPanel as="header" className="desktop-workbench-topbar mac-toolbar mac-panel desktop-workbench-menubar">
    <div className="desktop-workbench-leading">
      {menuBar}
      <div
        className="desktop-workbench-title-shell desktop-window-drag-region"
        data-tauri-drag-region
        onDoubleClick={onTitleDoubleClick}
      >
        <span className="desktop-workbench-role-indicator" aria-hidden="true">
          {roleLabel}
        </span>
        <div className="desktop-workbench-title compact">
          <h1>{projectName}</h1>
          <p>{projectSubtitle}</p>
        </div>
      </div>
    </div>

    <div className="desktop-workbench-tools">
      <div className="desktop-workbench-toolbar-group is-context">{context}</div>
      <div className="desktop-workbench-toolbar-group is-actions">{actions}</div>
    </div>
    <div
      className="desktop-workbench-drag-spacer desktop-window-drag-region"
      aria-hidden="true"
      data-tauri-drag-region
      onDoubleClick={onTitleDoubleClick}
    />
    {windowControls}
  </MacPanel>
);
