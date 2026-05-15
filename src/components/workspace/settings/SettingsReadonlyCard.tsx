import React from 'react';

type SettingsReadonlyCardTone = 'default' | 'success' | 'warning' | 'danger' | 'planned';

type SettingsReadonlyCardProps = {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  tone?: SettingsReadonlyCardTone;
  mono?: boolean;
};

export const SettingsReadonlyCard: React.FC<SettingsReadonlyCardProps> = ({
  label,
  value,
  meta,
  tone = 'default',
  mono = false,
}) => (
  <article className={`chat-settings-readonly-card${tone === 'default' ? '' : ` is-${tone}`}`}>
    <span>{label}</span>
    {mono ? <code>{value}</code> : <strong>{value}</strong>}
    {meta ? (mono ? <code>{meta}</code> : <strong>{meta}</strong>) : null}
  </article>
);
