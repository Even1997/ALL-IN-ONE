import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GNAgentChatPage } from '../../../components/ai/gn-agent-shell/GNAgentChatPage';
import { GNAgentConfigPage } from '../../../components/ai/gn-agent-shell/GNAgentConfigPage';
import { GNAgentSkillsPage } from '../../../components/ai/gn-agent-shell/GNAgentSkillsPage';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { getLocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import './AgentShellPage.css';

type AgentWorkspaceTabId = 'chat' | 'claude' | 'codex' | 'skills' | 'config';
type AgentShellMode = 'classic' | 'claude' | 'codex' | 'skills' | 'config';

type AgentShellSettings = {
  mode?: string;
  claudeConfigId?: string | null;
  codexConfigId?: string | null;
};

const AGENT_WORKSPACE_TABS: Array<{ id: AgentWorkspaceTabId; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'skills', label: 'Skills' },
  { id: 'config', label: 'Config' },
];

const tabToMode = (tabId: AgentWorkspaceTabId): AgentShellMode => (tabId === 'chat' ? 'classic' : tabId);

const modeToTab = (mode?: string): AgentWorkspaceTabId | null => {
  if (mode === 'classic') {
    return 'chat';
  }
  if (mode === 'claude' || mode === 'codex' || mode === 'skills' || mode === 'config') {
    return mode;
  }
  return null;
};

export const AgentShellPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AgentWorkspaceTabId>('chat');
  const [localSnapshot, setLocalSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const [settings, snapshot] = await Promise.all([
        invoke<AgentShellSettings>('get_agent_shell_settings').catch(() => null),
        getLocalAgentConfigSnapshot(),
      ]);
      if (!alive) {
        return;
      }

      if (settings) {
        const persistedTab = modeToTab(settings.mode);
        if (persistedTab) {
          setActiveTab(persistedTab);
        }
      }
      setLocalSnapshot(snapshot);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const updateActiveTab = (tabId: AgentWorkspaceTabId) => {
    setActiveTab(tabId);
    void invoke('update_agent_shell_settings', {
      input: {
        mode: tabToMode(tabId),
      },
    }).catch(() => undefined);
  };

  return (
    <section className="agent-workspace-page">
      <header className="agent-workspace-hero">
        <div>
          <span className="gn-agent-context-badge">GN Agent</span>
          <h2>Agent Workspace</h2>
          <p>Unified Claude, Codex, skills, and config surfaces behind one runtime shell.</p>
        </div>
      </header>

      <nav className="agent-workspace-tabs" aria-label="Agent workspace sections">
        {AGENT_WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`agent-workspace-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => updateActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="agent-workspace-content">
        {activeTab === 'chat' ? <GNAgentChatPage providerId="classic" /> : null}
        {activeTab === 'claude' ? <GNAgentChatPage providerId="claude" localSnapshot={localSnapshot} /> : null}
        {activeTab === 'codex' ? <GNAgentChatPage providerId="codex" localSnapshot={localSnapshot} /> : null}
        {activeTab === 'skills' ? <GNAgentSkillsPage /> : null}
        {activeTab === 'config' ? <GNAgentConfigPage /> : null}
      </div>
    </section>
  );
};
