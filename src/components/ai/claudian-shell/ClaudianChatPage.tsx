import React, { useMemo } from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { ClaudeRuntime } from '../../../modules/ai/claudian/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/claudian/runtime/codex/CodexRuntime';
import { AIChat } from '../../workspace/AIChat';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const ClaudianChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page' }) => {
  const aiConfigs = useGlobalAIStore((state) => state.aiConfigs);
  const boundConfigId = useClaudianShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null
  );
  const preferredConfig = useMemo(() => {
    if (providerId === 'claude') {
      return claudeRuntime.resolvePreferredConfig(aiConfigs);
    }
    if (providerId === 'codex') {
      return codexRuntime.resolvePreferredConfig(aiConfigs);
    }
    return null;
  }, [aiConfigs, providerId]);
  const runtimeConfigIdOverride = boundConfigId || preferredConfig?.id || null;
  const variant =
    providerId === 'classic' && mode === 'panel'
      ? 'claudian-embedded'
      : providerId === 'classic'
        ? 'default'
        : 'claudian-embedded';

  return (
    <AIChat
      variant={variant}
      runtimeConfigIdOverride={runtimeConfigIdOverride}
      providerExecutionMode={providerId === 'classic' ? null : providerId}
    />
  );
};
