// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';
import type { UtilitySidebarTabProps } from './UtilitySidebarTab';
import { UtilitySidebarTab } from './UtilitySidebarTab';

type FloatingRunCompanionProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: WorkbenchIconName;
  meta?: ReactNode;
  tabs?: UtilitySidebarTabProps[];
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  collapsed?: boolean;
  children?: ReactNode;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const FloatingRunCompanion = ({
  title,
  subtitle,
  icon = 'spark',
  meta,
  tabs = [],
  actions,
  footer,
  className,
  collapsed = false,
  children,
}: FloatingRunCompanionProps) => (
  <section
    className={joinClasses('wb-floating-run-companion', collapsed && 'is-collapsed', className)}
    data-ui-state={collapsed ? 'collapsed' : 'default'}
  >
    <header className="wb-floating-run-companion-head">
      <div className="wb-floating-run-companion-copy">
        <span className="wb-floating-run-companion-icon" aria-hidden="true">
          <WorkbenchIcon name={icon} />
        </span>
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      </div>
      {meta || actions ? (
        <div className="wb-floating-run-companion-meta">
          {meta}
          {actions}
        </div>
      ) : null}
    </header>

    {!collapsed && tabs.length > 0 ? (
      <div className="wb-floating-run-companion-tabs" role="tablist" aria-label="Run companion sections">
        {tabs.map((tab) => (
          <UtilitySidebarTab key={tab.label} {...tab} />
        ))}
      </div>
    ) : null}

    {!collapsed && children ? <div className="wb-floating-run-companion-body">{children}</div> : null}
    {!collapsed && footer ? <footer className="wb-floating-run-companion-footer">{footer}</footer> : null}
  </section>
);
