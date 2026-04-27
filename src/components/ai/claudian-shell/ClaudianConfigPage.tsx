import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CLAUDIAN_PROVIDER_REGISTRY } from '../../../modules/ai/claudian/providers';
import {
  getLocalAgentConfigSnapshot,
  type LocalAgentConfigSnapshot,
} from '../../../modules/ai/claudian/localConfig';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';

type SettingsTabId = 'general' | 'claude' | 'codex';

const renderStatus = (exists: boolean) => (exists ? '已发现' : '未发现');

const ConfigCard: React.FC<{
  title: string;
  desc?: string;
  code?: string | null;
  children?: React.ReactNode;
}> = ({ title, desc, code, children }) => (
  <article className="claudian-shell-config-card">
    <strong>{title}</strong>
    {desc ? <p>{desc}</p> : null}
    {code ? <code>{code}</code> : null}
    {children}
  </article>
);

export const ClaudianConfigPage: React.FC = () => {
  const { aiConfigs, selectedConfigId } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
    }))
  );
  const [snapshot, setSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');

  useEffect(() => {
    let alive = true;

    void (async () => {
      setIsLoading(true);
      const nextSnapshot = await getLocalAgentConfigSnapshot();
      if (!alive) {
        return;
      }

      setSnapshot(nextSnapshot);
      setIsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const selectedConfig = aiConfigs.find((item) => item.id === selectedConfigId) || null;
  const claudeConfigs = aiConfigs.filter((item) => item.provider === 'anthropic');
  const codexConfigs = aiConfigs.filter((item) => item.provider === 'openai-compatible');
  const providerCards = useMemo(() => Object.values(CLAUDIAN_PROVIDER_REGISTRY), []);

  return (
    <section className="claudian-shell-page claudian-shell-config-page">
      <header className="claudian-shell-page-header claudian-shell-page-header-spread">
        <div>
          <span className="claudian-context-badge">GN Agent</span>
          <h3>配置页</h3>
        </div>
        <span className="claudian-shell-page-note">
          {isLoading ? '正在读取本地 .claude / .codex 配置…' : snapshot ? snapshot.homeDir : '当前环境无法读取本地配置'}
        </span>
      </header>

      <div className="claudian-settings-tabs" role="tablist" aria-label="GN Agent settings">
        {[
          { id: 'general', label: 'General' },
          { id: 'claude', label: 'Claude' },
          { id: 'codex', label: 'Codex' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`claudian-settings-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id as SettingsTabId)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' ? (
        <div className="claudian-shell-config-grid">
          <ConfigCard
            title="当前 AI 配置"
            desc={
              selectedConfig
                ? `${selectedConfig.name} · ${selectedConfig.provider} · ${selectedConfig.model}`
                : '当前还没有选中的运行时配置。'
            }
            code={selectedConfig ? selectedConfig.baseURL : '未选择配置'}
          />

          <ConfigCard
            title="本地配置目录"
            desc={snapshot ? '已从本地用户目录读取 Claudian 对接所需的 provider 环境。' : '当前环境还没有读取到本地 provider 目录。'}
            code={snapshot?.homeDir || '未读取到 home 目录'}
          />

          {providerCards.map((provider) => (
            <ConfigCard
              key={provider.id}
              title={provider.displayName}
              desc={provider.enabled ? `${provider.displayName} provider 已注册到 Claudian 宿主。` : `${provider.displayName} provider 尚未启用。`}
            />
          ))}
        </div>
      ) : null}

      {activeTab === 'claude' ? (
        <div className="claudian-shell-config-grid">
          <ConfigCard
            title="Claude Home"
            desc={snapshot ? renderStatus(snapshot.claudeHome.exists) : '未加载'}
            code={snapshot?.claudeHome.path || '~/.claude'}
          />
          <ConfigCard
            title="Claude Settings"
            desc={snapshot ? renderStatus(snapshot.claudeSettings.exists) : '未加载'}
            code={snapshot?.claudeSettings.path || '~/.claude/settings.json'}
          >
            {snapshot?.claudeSettings.exists ? <p>出于安全考虑，这里只显示文件位置，不展示本地设置内容。</p> : null}
          </ConfigCard>
          <ConfigCard
            title="Claude Commands"
            desc={snapshot ? renderStatus(snapshot.claudeCommands.exists) : '未加载'}
            code={snapshot?.claudeCommands.path || '~/.claude/commands'}
          />
          <ConfigCard
            title="Claude Plugins"
            desc={snapshot ? renderStatus(snapshot.claudePlugins.exists) : '未加载'}
            code={snapshot?.claudePlugins.path || '~/.claude/plugins'}
          />
          <ConfigCard
            title="应用内 Anthropic 配置"
            desc={claudeConfigs.length > 0 ? `已发现 ${claudeConfigs.length} 个可绑定配置。` : '当前应用内没有可绑定的 Anthropic 配置。'}
          >
            <div className="claudian-shell-config-list">
              {claudeConfigs.map((config) => (
                <code key={config.id}>{`${config.name} · ${config.model}`}</code>
              ))}
            </div>
          </ConfigCard>
        </div>
      ) : null}

      {activeTab === 'codex' ? (
        <div className="claudian-shell-config-grid">
          <ConfigCard
            title="Codex Home"
            desc={snapshot ? renderStatus(snapshot.codexHome.exists) : '未加载'}
            code={snapshot?.codexHome.path || '~/.codex'}
          />
          <ConfigCard
            title="Codex Skills"
            desc={snapshot ? renderStatus(snapshot.codexSkills.exists) : '未加载'}
            code={snapshot?.codexSkills.path || '~/.codex/skills'}
          />
          <ConfigCard
            title="Codex Agents"
            desc={snapshot ? renderStatus(snapshot.codexAgents.exists) : '未加载'}
            code={snapshot?.codexAgents.path || '~/.codex/agents'}
          />
          <ConfigCard
            title="应用内 OpenAI Compatible 配置"
            desc={codexConfigs.length > 0 ? `已发现 ${codexConfigs.length} 个可绑定配置。` : '当前应用内没有可绑定的 OpenAI Compatible 配置。'}
          >
            <div className="claudian-shell-config-list">
              {codexConfigs.map((config) => (
                <code key={config.id}>{`${config.name} · ${config.model}`}</code>
              ))}
            </div>
          </ConfigCard>
        </div>
      ) : null}
    </section>
  );
};
