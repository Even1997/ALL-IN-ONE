import React, { useEffect, useMemo, useState } from 'react';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import {
  getLocalAgentConfigSnapshot,
  type LocalAgentConfigSnapshot,
} from '../../../modules/ai/gn-agent/localConfig';
import { GNAgentConfigPage } from './GNAgentConfigPage';
import { GNAgentModeSwitch } from './GNAgentModeSwitch';
import { GNAgentSkillsPage } from './GNAgentSkillsPage';
import { GNAgentTabBadges } from './GNAgentTabBadges';
import { ClaudeWorkspace } from '../workspaces/ClaudeWorkspace';
import { CodexWorkspace } from '../workspaces/CodexWorkspace';
import { ClassicWorkspace } from '../workspaces/ClassicWorkspace';
import './GNAgentShell.css';

const getProviderThemeLabel = (mode: 'config' | 'skills' | 'claude' | 'codex' | 'classic') => {
  if (mode === 'claude') {
    return 'Anthropic Runtime';
  }

  if (mode === 'codex') {
    return 'OpenAI Runtime';
  }

  if (mode === 'config') {
    return 'Provider Settings';
  }

  if (mode === 'skills') {
    return 'Global Skill Library';
  }

  return 'Classic Compatibility';
};

export const GNAgentShell: React.FC<{ mode?: 'panel' | 'full-page' }> = ({ mode = 'full-page' }) => {
  const { mode: currentMode } = useGNAgentShellStore();
  const [localSnapshot, setLocalSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const nextSnapshot = await getLocalAgentConfigSnapshot();
      if (!alive) {
        return;
      }

      setLocalSnapshot(nextSnapshot);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const pageTitle = useMemo(() => {
    if (currentMode === 'config') {
      return 'GN Agent Settings';
    }

    if (currentMode === 'skills') {
      return 'Global Skills';
    }

    if (currentMode === 'claude') {
      return 'Local Runtime';
    }

    if (currentMode === 'codex') {
      return 'Codex Runtime';
    }

    return 'GN Agent Chat';
  }, [currentMode]);

  const providerThemeLabel = getProviderThemeLabel(currentMode);

  return (
    <section className={`gn-agent-shell gn-agent-shell-${mode}`} data-mode={currentMode}>
      <header className="gn-agent-header">
        <div className="gn-agent-title-slot">
          <span className="gn-agent-context-badge">GN Agent</span>
          <h4 className="gn-agent-title-text">{pageTitle}</h4>
          <span className={`gn-agent-provider-badge gn-agent-provider-badge-${currentMode}`}>{providerThemeLabel}</span>
        </div>
        <div className="gn-agent-header-actions">
          <GNAgentModeSwitch compact />
          <div className="gn-agent-tab-bar-container">
            <GNAgentTabBadges />
          </div>
        </div>
      </header>

      <div className="gn-agent-shell-main">
        <div className="gn-agent-tab-content-container">
          {currentMode === 'config' ? <GNAgentConfigPage /> : null}
          {currentMode === 'skills' ? <GNAgentSkillsPage /> : null}
          {currentMode === 'claude' ? <ClaudeWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
          {currentMode === 'codex' ? <CodexWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
          {currentMode === 'classic' ? <ClassicWorkspace mode={mode} /> : null}
        </div>
      </div>
    </section>
  );
};

