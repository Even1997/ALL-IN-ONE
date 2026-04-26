import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import { AIChat } from '../../workspace/AIChat';

export const ClaudianChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page' }) => {
  const runtimeConfigIdOverride = useClaudianShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null
  );
  const variant =
    providerId === 'classic'
      ? 'default'
      : mode === 'full-page'
        ? 'claudian-full-page'
        : 'claudian-embedded';

  return (
    <AIChat
      variant={variant}
      runtimeConfigIdOverride={runtimeConfigIdOverride}
      providerExecutionMode={providerId === 'classic' ? null : providerId}
    />
  );
};
