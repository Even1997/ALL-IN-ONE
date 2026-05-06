import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GN_AGENT_PROVIDER_REGISTRY } from '../../../modules/ai/gn-agent/providers';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';

const ConfigCard: React.FC<{
  title: string;
  desc?: string;
  code?: string | null;
}> = ({ title, desc, code }) => (
  <article className="gn-agent-shell-config-card">
    <strong>{title}</strong>
    {desc ? <p>{desc}</p> : null}
    {code ? <code>{code}</code> : null}
  </article>
);

export const GNAgentConfigPage: React.FC = () => {
  const { aiConfigs, selectedConfigId } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
    }))
  );

  const selectedConfig = aiConfigs.find((item) => item.id === selectedConfigId) || null;
  const providerCards = useMemo(() => Object.values(GN_AGENT_PROVIDER_REGISTRY), []);

  return (
    <section className="gn-agent-shell-page gn-agent-shell-config-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-spread">
        <div>
          <span className="gn-agent-context-badge">GN Agent</span>
          <h3>Config</h3>
        </div>
        <span className="gn-agent-shell-page-note">Built-in runtime configuration</span>
      </header>

      <div className="gn-agent-shell-config-grid">
        <ConfigCard
          title="Current AI config"
          desc={
            selectedConfig
              ? `${selectedConfig.name} / ${selectedConfig.provider} / ${selectedConfig.model}`
              : 'No runtime config is selected.'
          }
          code={selectedConfig ? selectedConfig.baseURL : 'Not selected'}
        />

        {providerCards.map((provider) => (
          <ConfigCard
            key={provider.id}
            title={provider.displayName}
            desc={
              provider.enabled
                ? `${provider.displayName} provider is registered for GN Agent.`
                : `${provider.displayName} provider is not enabled.`
            }
          />
        ))}
      </div>
    </section>
  );
};
