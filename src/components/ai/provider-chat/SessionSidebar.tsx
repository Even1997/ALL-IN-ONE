// 文件作用：侧边栏组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';

export const SessionSidebar: React.FC<{
  providerLabel: string;
  summary?: string;
  children?: React.ReactNode;
}> = ({ providerLabel, summary, children }) => (
  <aside className="provider-session-sidebar">
    <div className="provider-session-sidebar-header">
      <strong>{providerLabel}</strong>
      {summary ? <span>{summary}</span> : null}
    </div>
    <div className="provider-session-sidebar-body">{children}</div>
  </aside>
);
