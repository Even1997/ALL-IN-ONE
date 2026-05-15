import React from 'react';

type SettingsDangerActionProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  note?: React.ReactNode;
};

export const SettingsDangerAction: React.FC<SettingsDangerActionProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  note,
}) => (
  <div className="chat-settings-danger-action">
    <div className="chat-settings-danger-copy">
      <strong>{title}</strong>
      <span>{description}</span>
      {note ? <small>{note}</small> : null}
    </div>
    <button
      className="chat-settings-inline-btn chat-settings-danger-button"
      type="button"
      disabled={disabled}
      onClick={onAction}
    >
      {actionLabel}
    </button>
  </div>
);
