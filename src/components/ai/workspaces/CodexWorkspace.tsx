import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { GNAgentChatPage } from '../gn-agent-shell/GNAgentChatPage';
import { GNAgentRuntimeSummary } from '../gn-agent-shell/GNAgentRuntimeSummary';

export const CodexWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <>
    {localSnapshot ? <GNAgentRuntimeSummary providerId="codex" localSnapshot={localSnapshot} /> : null}
    <GNAgentChatPage providerId="codex" mode={mode} localSnapshot={localSnapshot} />
  </>
);

