// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';

export const RuntimeStatusBar: React.FC<{
  title?: string;
  detail?: string;
  children?: React.ReactNode;
}> = ({ title = 'Runtime Status', detail, children }) => (
  <div className="provider-runtime-status-bar">
    <div className="provider-runtime-status-bar-header">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
    {children ? <div className="provider-runtime-status-bar-body">{children}</div> : null}
  </div>
);
