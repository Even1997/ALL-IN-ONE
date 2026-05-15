import React from 'react';

type SettingsSectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  eyebrow,
  title,
  description,
  className,
  actions,
  children,
}) => {
  const classes = ['chat-settings-note-surface'];
  if (className) {
    classes.push(className);
  }

  return (
    <section className={classes.join(' ')}>
      <header className="chat-settings-note-header">
        <div>
          {eyebrow ? <div className="chat-settings-eyebrow">{eyebrow}</div> : null}
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="chat-settings-status-pills">{actions}</div> : null}
      </header>
      {children ? <div className="chat-settings-note-sections">{children}</div> : null}
    </section>
  );
};
