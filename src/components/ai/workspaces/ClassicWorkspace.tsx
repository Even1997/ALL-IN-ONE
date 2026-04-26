import React from 'react';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';

export const ClassicWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
}> = ({ mode = 'full-page' }) => (
  <ClaudianChatPage providerId="classic" mode={mode} />
);
