import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { GNAgentChatPage } from '../gn-agent-shell/GNAgentChatPage';
import { GNAgentRuntimeSummary } from '../gn-agent-shell/GNAgentRuntimeSummary';

export const ClaudeWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <>
    {localSnapshot ? <GNAgentRuntimeSummary providerId="claude" localSnapshot={localSnapshot} /> : null}
    <GNAgentChatPage providerId="claude" mode={mode} localSnapshot={localSnapshot} />
  </>
);

