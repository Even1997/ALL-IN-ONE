import React from 'react';
import { GNAgentChatPage } from '../gn-agent-shell/GNAgentChatPage';

export const ClassicWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
}> = ({ mode = 'full-page' }) => (
  <GNAgentChatPage providerId="classic" mode={mode} />
);

