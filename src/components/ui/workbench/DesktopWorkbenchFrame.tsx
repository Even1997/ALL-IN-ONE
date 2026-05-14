import type { ReactNode } from 'react';

type DesktopWorkbenchFrameProps = {
  rail: ReactNode;
  topbar: ReactNode;
  main: ReactNode;
  inspector?: ReactNode;
  resizeHandle?: ReactNode;
  isResizing?: boolean;
};

export const DesktopWorkbenchFrame = ({
  rail,
  topbar,
  main,
  inspector,
  resizeHandle,
  isResizing = false,
}: DesktopWorkbenchFrameProps) => (
  <section className="desktop-native-window">
    {topbar}
    <div className="desktop-native-body">
      {rail}
      <div className={`desktop-workbench-panels ${isResizing ? 'is-resizing-ai' : ''}`}>
        <div className="app-workbench-pane app-workbench-main-shell">{main}</div>
        {resizeHandle}
        {inspector}
      </div>
    </div>
  </section>
);
