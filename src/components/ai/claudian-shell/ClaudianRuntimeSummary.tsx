import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudeRuntime } from '../../../modules/ai/claudian/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/claudian/runtime/codex/CodexRuntime';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const ClaudianRuntimeSummary: React.FC<{
  providerId: 'claude' | 'codex';
  localSnapshot: LocalAgentConfigSnapshot | null;
}> = ({ providerId, localSnapshot }) => {
  const { aiConfigs } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
    }))
  );
  const { claudeConfigId, codexConfigId } = useClaudianShellStore(
    useShallow((state) => ({
      claudeConfigId: state.claudeConfigId,
      codexConfigId: state.codexConfigId,
    }))
  );

  const runtime = providerId === 'claude' ? claudeRuntime : codexRuntime;
  const boundConfigId = providerId === 'claude' ? claudeConfigId : codexConfigId;
  const selectedConfig = useMemo(() => {
    const boundConfig = boundConfigId ? aiConfigs.find((item) => item.id === boundConfigId) || null : null;
    const usableBoundConfig =
      boundConfig &&
      ((providerId === 'claude' && boundConfig.provider === 'anthropic') ||
        (providerId === 'codex' && boundConfig.provider === 'openai-compatible')) &&
      boundConfig.enabled &&
      hasUsableAIConfigEntry(boundConfig)
        ? boundConfig
        : null;
    return usableBoundConfig || runtime.resolvePreferredConfig(aiConfigs);
  }, [aiConfigs, boundConfigId, runtime]);
  const status = useMemo(
    () => runtime.getStatus({ selectedConfig, localSnapshot }),
    [localSnapshot, runtime, selectedConfig]
  );

  return (
    <section className={`claudian-runtime-summary ${status.ready ? 'ready' : 'missing'}`}>
      <div className="claudian-runtime-summary-header">
        <strong>{providerId === 'claude' ? 'Claude Runtime' : 'Codex Runtime'}</strong>
        <span>{status.source}</span>
      </div>
      <p>{status.summary}</p>
      <div className="claudian-runtime-summary-details">
        {status.details.map((detail) => (
          <code key={detail}>{detail}</code>
        ))}
      </div>
    </section>
  );
};
