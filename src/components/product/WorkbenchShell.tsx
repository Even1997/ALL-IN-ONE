// 文件作用：工作台壳组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { CSSProperties, ReactNode } from 'react';

type WorkbenchShellProps = {
  className?: string;
  style?: CSSProperties;
  header?: ReactNode;
  sidebar?: ReactNode;
  main?: ReactNode;
  floatingCompanion?: ReactNode;
  companion?: ReactNode;
  utilitySidebar?: ReactNode;
  resizeHandle?: ReactNode;
  statusBar?: ReactNode;
  sidebarWidth?: number;
  companionWidth?: number;
  leftPane?: ReactNode;
  centerPane?: ReactNode;
  rightPane?: ReactNode;
  leftSize?: number;
  rightSize?: number;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const WorkbenchShell = ({
  className,
  style,
  header,
  sidebar,
  main,
  floatingCompanion,
  companion,
  utilitySidebar,
  resizeHandle,
  statusBar,
  sidebarWidth,
  companionWidth,
  leftPane,
  centerPane,
  rightPane,
  leftSize,
  rightSize,
}: WorkbenchShellProps) => {
  const resolvedSidebar = sidebar ?? leftPane ?? null;
  const resolvedMain = main ?? centerPane ?? null;
  const resolvedCompanion = utilitySidebar ?? companion ?? rightPane ?? null;
  const resolvedSidebarWidth = sidebarWidth ?? leftSize;
  const resolvedCompanionWidth = companionWidth ?? rightSize;
  const hasSidebar = Boolean(resolvedSidebar);
  const hasCompanion = Boolean(resolvedCompanion);
  const hasResizeHandle = Boolean(resizeHandle);

  const sidebarStyle: CSSProperties | undefined =
    typeof resolvedSidebarWidth === 'number'
      ? { width: resolvedSidebarWidth, minWidth: resolvedSidebarWidth }
      : undefined;
  const companionStyle: CSSProperties | undefined =
    typeof resolvedCompanionWidth === 'number'
      ? { width: resolvedCompanionWidth, minWidth: resolvedCompanionWidth }
      : undefined;

  return (
    <section className={joinClasses('pm-workbench-shell wb-module-shell', className)} style={style}>
      {header ? <div className="pm-workbench-header-slot">{header}</div> : null}
      <div className={joinClasses('pm-workbench-body', hasSidebar && 'has-sidebar')}>
        {resolvedSidebar ? (
          <aside className="pm-workbench-sidebar wb-module-sidebar" style={sidebarStyle}>
            {resolvedSidebar}
          </aside>
        ) : null}
        <div
          className={joinClasses(
            'pm-workbench-main-with-ai',
            hasCompanion && 'has-companion',
            hasResizeHandle && 'has-resize-handle'
          )}
        >
          <main className="pm-workbench-main wb-module-main">
            <div className="pm-workbench-main-stage">
              {resolvedMain}
              {floatingCompanion ? (
                <div className="pm-workbench-floating-companion-slot">{floatingCompanion}</div>
              ) : null}
            </div>
          </main>
          {resizeHandle}
          {resolvedCompanion ? (
            <aside className="pm-workbench-ai-pane wb-module-companion" style={companionStyle}>
              {resolvedCompanion}
            </aside>
          ) : null}
        </div>
      </div>
      {statusBar ? <div className="pm-workbench-status-slot">{statusBar}</div> : null}
    </section>
  );
};
