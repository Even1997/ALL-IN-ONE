import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudeRuntime } from '../../../modules/ai/claudian/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/claudian/runtime/codex/CodexRuntime';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const ClaudianRuntimeSummary: React.FC<{
  providerId: 'claude' | 'codex';
  localSnapshot: LocalAgentConfigSnapshot | null;
}> = ({ providerId, localSnapshot }) => {
  const { aiConfigs, selectedConfigId } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
    }))
  );

  const selectedConfig = aiConfigs.find((item) => item.id === selectedConfigId) || null;
  const status = useMemo(
    () =>
      providerId === 'claude'
        ? claudeRuntime.getStatus({ selectedConfig, localSnapshot })
        : codexRuntime.getStatus({ selectedConfig, localSnapshot }),
    [localSnapshot, providerId, selectedConfig]
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
