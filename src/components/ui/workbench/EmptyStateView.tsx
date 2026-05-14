import type { ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';

type EmptyStateViewProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconName;
  action?: ReactNode;
  className?: string;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const EmptyStateView = ({
  title,
  description,
  icon = 'document',
  action,
  className,
}: EmptyStateViewProps) => (
  <section className={joinClasses('wb-empty-state', className)} data-ui-state="empty">
    <div className="wb-empty-state-icon" aria-hidden="true">
      <WorkbenchIcon name={icon} />
    </div>
    <div className="wb-empty-state-copy">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    {action ? <div className="wb-empty-state-action">{action}</div> : null}
  </section>
);
