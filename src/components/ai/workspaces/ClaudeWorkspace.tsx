import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';
import { ClaudianRuntimeSummary } from '../claudian-shell/ClaudianRuntimeSummary';

export const ClaudeWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <>
    {localSnapshot ? <ClaudianRuntimeSummary providerId="claude" localSnapshot={localSnapshot} /> : null}
    <ClaudianChatPage providerId="claude" mode={mode} localSnapshot={localSnapshot} />
  </>
);
