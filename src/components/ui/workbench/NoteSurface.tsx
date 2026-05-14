import type { ReactNode } from 'react';

type NoteSurfaceProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const NoteSurface = ({
  eyebrow,
  title,
  subtitle,
  actions,
  toolbar,
  footer,
  className,
  children,
}: NoteSurfaceProps) => (
  <section className={joinClasses('wb-note-surface', className)}>
    {eyebrow || title || subtitle || actions ? (
      <header className="wb-note-surface-header">
        <div className="wb-note-surface-copy">
          {eyebrow ? <span className="wb-note-surface-eyebrow">{eyebrow}</span> : null}
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="wb-note-surface-actions">{actions}</div> : null}
      </header>
    ) : null}
    {toolbar ? <div className="wb-note-surface-toolbar">{toolbar}</div> : null}
    <div className="wb-note-surface-body">{children}</div>
    {footer ? <footer className="wb-note-surface-footer">{footer}</footer> : null}
  </section>
);
