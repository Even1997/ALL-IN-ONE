import type { ReactNode } from 'react';
import { Allotment } from 'allotment';

type WorkbenchShellProps = {
  leftPane: ReactNode;
  centerPane: ReactNode;
  rightPane: ReactNode;
  leftSize: number;
  rightSize: number;
  onLeftSizeChange: (sizes: number[]) => void;
};

export const WorkbenchShell = ({
  leftPane,
  centerPane,
  rightPane,
  leftSize,
  rightSize,
  onLeftSizeChange,
}: WorkbenchShellProps) => (
  <section className="pm-workbench-shell">
    <Allotment className="pm-workbench-shell-allotment" onChange={onLeftSizeChange}>
      <Allotment.Pane preferredSize={leftSize} minSize={220}>
        <aside className="pm-workbench-sidebar">{leftPane}</aside>
      </Allotment.Pane>
      <Allotment.Pane minSize={480}>
        <div className="pm-workbench-main-with-ai">
          <main className="pm-workbench-main">{centerPane}</main>
          {rightPane ? (
            <aside className="pm-workbench-ai-pane" style={{ width: rightSize }}>
              {rightPane}
            </aside>
          ) : null}
        </div>
      </Allotment.Pane>
    </Allotment>
  </section>
);
