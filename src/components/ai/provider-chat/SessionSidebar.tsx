import React from 'react';

export const SessionSidebar: React.FC<{
  providerLabel: string;
  summary?: string;
  children?: React.ReactNode;
}> = ({ providerLabel, summary, children }) => (
  <aside className="provider-session-sidebar">
    <div className="provider-session-sidebar-header">
      <strong>{providerLabel}</strong>
      {summary ? <span>{summary}</span> : null}
    </div>
    <div className="provider-session-sidebar-body">{children}</div>
  </aside>
);
