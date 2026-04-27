import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';
import { ClaudianRuntimeSummary } from '../claudian-shell/ClaudianRuntimeSummary';

export const CodexWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <>
    {localSnapshot ? <ClaudianRuntimeSummary providerId="codex" localSnapshot={localSnapshot} /> : null}
    <ClaudianChatPage providerId="codex" mode={mode} localSnapshot={localSnapshot} />
  </>
);
