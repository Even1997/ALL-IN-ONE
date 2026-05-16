// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
