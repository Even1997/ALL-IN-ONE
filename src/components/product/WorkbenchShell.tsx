import type { ReactNode } from 'react';

type WorkbenchShellProps = {
  leftPane: ReactNode;
  centerPane: ReactNode;
  rightPane: ReactNode;
  leftSize: number;
  rightSize: number;
};

export const WorkbenchShell = ({
  leftPane,
  centerPane,
  rightPane,
  leftSize,
  rightSize,
}: WorkbenchShellProps) => (
  <section className="pm-workbench-shell">
    <aside className="pm-workbench-sidebar" style={{ width: leftSize, minWidth: leftSize }}>
      {leftPane}
    </aside>
    <div className="pm-workbench-main-with-ai">
      <main className="pm-workbench-main">{centerPane}</main>
      {rightPane ? (
        <aside className="pm-workbench-ai-pane" style={{ width: rightSize, minWidth: rightSize }}>
          {rightPane}
        </aside>
      ) : null}
    </div>
  </section>
);
