import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { AgentChatStage } from '../../../features/agent-shell/components/AgentChatStage';
import { useGNAgentWorkbenchSession } from './useGNAgentWorkbenchSession';

export const GNAgentChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page' }) => {
  const session = useGNAgentWorkbenchSession();

  return (
    <section className="agent-compat-stage-page">
      <AgentChatStage
        providerId={providerId}
        mode={mode === 'panel' ? 'stage-only' : 'stage-plus'}
        session={session}
      />
    </section>
  );
};
