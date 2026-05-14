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
