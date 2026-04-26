import React from 'react';

export const MessageViewport: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="provider-message-viewport">{children}</div>
);
