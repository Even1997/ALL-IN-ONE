import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';

export const ClaudeWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <ClaudianChatPage providerId="claude" mode={mode} localSnapshot={localSnapshot} />
);
