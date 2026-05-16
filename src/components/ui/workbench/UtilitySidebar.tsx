// 文件作用：侧边栏组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';
import { UtilitySidebarTab, type UtilitySidebarTabProps } from './UtilitySidebarTab';

type UtilitySidebarProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: WorkbenchIconName;
  tabs: UtilitySidebarTabProps[];
  collapsed?: boolean;
  panelVisible?: boolean;
  className?: string;
  bodyClassName?: string;
  railLabel?: string;
  panelLabel?: string;
  actions?: ReactNode;
  emptyState?: ReactNode;
  children?: ReactNode;
  onToggleCollapsed?: () => void;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const UtilitySidebar = ({
  title,
  subtitle,
  icon = 'eye',
  tabs,
  collapsed = false,
  panelVisible = true,
  className,
  bodyClassName,
  railLabel = 'Utility sidebar',
  panelLabel = 'Utility panel',
  actions,
  emptyState,
  children,
  onToggleCollapsed,
}: UtilitySidebarProps) => {
  const body = children ?? emptyState ?? null;
  const showPanel = !collapsed && panelVisible && Boolean(body);

  return (
    <section
      className={joinClasses('wb-utility-sidebar', collapsed && 'is-collapsed', className)}
      data-ui-state={collapsed ? 'collapsed' : body ? 'default' : 'empty'}
    >
      <div className="wb-utility-sidebar-shell">
        <div className="wb-utility-sidebar-rail" role="toolbar" aria-label={railLabel}>
          {tabs.map((tab) => (
            <UtilitySidebarTab key={tab.label} {...tab} />
          ))}
          {onToggleCollapsed ? (
            <button
              type="button"
              className="wb-utility-sidebar-collapse"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand utility sidebar' : 'Collapse utility sidebar'}
              title={collapsed ? 'Expand utility sidebar' : 'Collapse utility sidebar'}
            >
              <WorkbenchIcon name={collapsed ? 'panelRightOpen' : 'panelRightClose'} />
            </button>
          ) : null}
        </div>

        {showPanel ? (
          <div className="wb-utility-sidebar-panel" role="region" aria-label={panelLabel}>
            {title || subtitle || actions ? (
              <header className="wb-utility-sidebar-head">
                <div className="wb-utility-sidebar-copy">
                  <span className="wb-utility-sidebar-icon" aria-hidden="true">
                    <WorkbenchIcon name={icon} />
                  </span>
                  <div>
                    {title ? <strong>{title}</strong> : null}
                    {subtitle ? <span>{subtitle}</span> : null}
                  </div>
                </div>
                {actions ? <div className="wb-utility-sidebar-actions">{actions}</div> : null}
              </header>
            ) : null}

            <div className={joinClasses('wb-utility-sidebar-body', bodyClassName)}>{body}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
