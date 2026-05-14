import type { ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';

export type StatusBannerTone = 'info' | 'success' | 'warning' | 'danger';

type StatusBannerProps = {
  title: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
  tone?: StatusBannerTone;
  icon?: WorkbenchIconName;
  className?: string;
};

const DEFAULT_ICONS: Record<StatusBannerTone, WorkbenchIconName> = {
  info: 'spark',
  success: 'document',
  warning: 'settings',
  danger: 'bug',
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const StatusBanner = ({
  title,
  message,
  action,
  tone = 'info',
  icon,
  className,
}: StatusBannerProps) => (
  <section className={joinClasses('wb-status-banner', `is-${tone}`, className)}>
    <div className="wb-status-banner-icon" aria-hidden="true">
      <WorkbenchIcon name={icon ?? DEFAULT_ICONS[tone]} />
    </div>
    <div className="wb-status-banner-copy">
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
    </div>
    {action ? <div className="wb-status-banner-action">{action}</div> : null}
  </section>
);
