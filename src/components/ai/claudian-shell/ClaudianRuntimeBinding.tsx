import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { ClaudeRuntime } from '../../../modules/ai/claudian/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/claudian/runtime/codex/CodexRuntime';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const ClaudianRuntimeBinding: React.FC<{
  providerId: 'claude' | 'codex';
}> = ({ providerId }) => {
  const { aiConfigs, setConfigEnabled } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      setConfigEnabled: state.setConfigEnabled,
    }))
  );
  const { claudeConfigId, codexConfigId, setProviderConfigId } = useClaudianShellStore(
    useShallow((state) => ({
      claudeConfigId: state.claudeConfigId,
      codexConfigId: state.codexConfigId,
      setProviderConfigId: state.setProviderConfigId,
    }))
  );

  const runtime = providerId === 'claude' ? claudeRuntime : codexRuntime;
  const matchingConfigs = useMemo(() => runtime.getMatchingConfigs(aiConfigs), [aiConfigs, runtime]);
  const preferredConfig = useMemo(() => runtime.resolvePreferredConfig(aiConfigs), [aiConfigs, runtime]);
  const boundConfigId = providerId === 'claude' ? claudeConfigId : codexConfigId;

  return (
    <section className="claudian-runtime-binding">
      <div className="claudian-runtime-binding-header">
        <strong>{providerId === 'claude' ? 'Claude Config Binding' : 'Codex Config Binding'}</strong>
        <span>{matchingConfigs.length} configs</span>
      </div>

      {preferredConfig ? (
        <button
          type="button"
          className={`claudian-runtime-binding-primary ${preferredConfig.id === boundConfigId ? 'active' : ''}`}
          onClick={() => {
            if (!preferredConfig.enabled) {
              setConfigEnabled(preferredConfig.id, true);
            }
            setProviderConfigId(providerId, preferredConfig.id);
          }}
        >
          使用 {preferredConfig.name} / {preferredConfig.model || '未配置模型'}
        </button>
      ) : (
        <p className="claudian-runtime-binding-empty">
          {providerId === 'claude' ? '还没有 Anthropic 配置。' : '还没有 OpenAI Compatible 配置。'}
        </p>
      )}

      {matchingConfigs.length > 0 ? (
        <div className="claudian-runtime-binding-list">
          {matchingConfigs.map((config) => (
            <button
              key={config.id}
              type="button"
              className={`claudian-runtime-binding-item ${config.id === boundConfigId ? 'active' : ''}`}
              onClick={() => {
                if (!config.enabled) {
                  setConfigEnabled(config.id, true);
                }
                setProviderConfigId(providerId, config.id);
              }}
            >
              <strong>{config.name}</strong>
              <span>
                {config.provider} · {config.model || '未配置模型'} {config.enabled ? '· enabled' : '· disabled'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
