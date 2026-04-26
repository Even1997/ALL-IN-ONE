import React from 'react';

export const ComposerToolbar: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="provider-composer-toolbar">{children}</div>
);
