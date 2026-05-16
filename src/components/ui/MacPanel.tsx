// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ElementType, HTMLAttributes, ReactNode } from 'react';

type MacPanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const MacPanel = ({
  as: Component = 'section',
  className,
  children,
  ...props
}: MacPanelProps) => (
  <Component className={joinClasses('mac-panel', className)} {...props}>
    {children}
  </Component>
);
