import React from 'react';

export const RuntimeStatusBar: React.FC<{
  title?: string;
  detail?: string;
  children?: React.ReactNode;
}> = ({ title = 'Runtime Status', detail, children }) => (
  <div className="provider-runtime-status-bar">
    <div className="provider-runtime-status-bar-header">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
    {children ? <div className="provider-runtime-status-bar-body">{children}</div> : null}
  </div>
);
