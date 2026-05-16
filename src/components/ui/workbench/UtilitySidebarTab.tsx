// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';

export type UtilitySidebarTabProps = {
  icon: WorkbenchIconName;
  label: string;
  active?: boolean;
  hasDot?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const UtilitySidebarTab = ({
  icon,
  label,
  active = false,
  hasDot = false,
  onClick,
  disabled = false,
}: UtilitySidebarTabProps) => (
  <button
    type="button"
    className={joinClasses('wb-utility-sidebar-tab', active && 'is-active')}
    onClick={onClick}
    aria-label={label}
    title={label}
    disabled={disabled}
  >
    <WorkbenchIcon name={icon} />
    {hasDot ? <span className="wb-utility-sidebar-tab-dot" aria-hidden="true" /> : null}
  </button>
);
