import React, { useMemo } from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import { ClaudeRuntime } from '../../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
import { AIChat } from '../../workspace/AIChat';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const GNAgentChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page' }) => {
  const aiConfigs = useGlobalAIStore((state) => state.aiConfigs);
  const boundConfigId = useGNAgentShellStore((state) =>
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
  const boundConfig = useMemo(
    () => (boundConfigId ? aiConfigs.find((item) => item.id === boundConfigId) || null : null),
    [aiConfigs, boundConfigId]
  );
  const usableBoundConfig = useMemo(() => {
    if (!boundConfig || !boundConfig.enabled || !hasUsableAIConfigEntry(boundConfig)) {
      return null;
    }

    if (providerId === 'claude' && boundConfig.provider === 'anthropic') {
      return boundConfig;
    }

    if (providerId === 'codex' && boundConfig.provider === 'openai-compatible') {
      return boundConfig;
    }

    return null;
  }, [boundConfig, providerId]);
  const runtimeConfigIdOverride = usableBoundConfig?.id || preferredConfig?.id || null;
  const variant =
    providerId === 'classic' && mode === 'panel'
      ? 'gn-agent-embedded'
      : providerId === 'classic'
        ? 'default'
        : 'provider-embedded';

  return (
    <AIChat
      variant={variant}
      runtimeConfigIdOverride={runtimeConfigIdOverride}
      providerExecutionMode={providerId === 'classic' ? null : providerId}
    />
  );
};

