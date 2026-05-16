// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { forwardRef, type CSSProperties, type ReactNode } from 'react';

type InspectorPaneProps = {
  children: ReactNode;
  visible?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
};

export const InspectorPane = forwardRef<HTMLDivElement, InspectorPaneProps>(function InspectorPane(
  { children, visible = true, width, minWidth, maxWidth },
  ref,
) {
  const style: CSSProperties | undefined =
    typeof width === 'number'
      ? {
          flex: `0 0 ${width}px`,
          width,
          minWidth,
          maxWidth,
        }
      : undefined;

  return (
    <div
      ref={ref}
      className={`app-workbench-pane app-workbench-ai-shell desktop-ai-shell ${visible ? '' : 'is-hidden'}`}
      style={style}
    >
      <aside className="app-ai-activity-pane">{children}</aside>
    </div>
  );
});
