import React, { useEffect, useMemo, useState } from 'react';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import {
  getLocalAgentConfigSnapshot,
  type LocalAgentConfigSnapshot,
} from '../../../modules/ai/claudian/localConfig';
import { ClaudianConfigPage } from './ClaudianConfigPage';
import { ClaudianModeSwitch } from './ClaudianModeSwitch';
import { ClaudianTabBadges } from './ClaudianTabBadges';
import { ClaudeWorkspace } from '../workspaces/ClaudeWorkspace';
import { CodexWorkspace } from '../workspaces/CodexWorkspace';
import { ClassicWorkspace } from '../workspaces/ClassicWorkspace';
import './ClaudianShell.css';

const getProviderThemeLabel = (mode: 'config' | 'claude' | 'codex' | 'classic') => {
  if (mode === 'claude') {
    return 'Anthropic Runtime';
  }

  if (mode === 'codex') {
    return 'OpenAI Runtime';
  }

  if (mode === 'config') {
    return 'Provider Settings';
  }

  return 'Classic Compatibility';
};

export const ClaudianShell: React.FC<{ mode?: 'panel' | 'full-page' }> = ({ mode = 'full-page' }) => {
  const { mode: currentMode } = useClaudianShellStore();
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
      return 'Claudian Settings';
    }

    if (currentMode === 'claude') {
      return 'Claude Workspace';
    }

    if (currentMode === 'codex') {
      return 'Codex Workspace';
    }

    return 'Classic AI Chat';
  }, [currentMode]);

  const providerThemeLabel = getProviderThemeLabel(currentMode);

  return (
    <section className={`claudian-shell claudian-shell-${mode}`} data-mode={currentMode}>
      <header className="claudian-header">
        <div className="claudian-title-slot">
          <span className="claudian-context-badge">Claudian</span>
          <h4 className="claudian-title-text">{pageTitle}</h4>
          <span className={`claudian-provider-badge claudian-provider-badge-${currentMode}`}>{providerThemeLabel}</span>
        </div>
        <div className="claudian-header-actions">
          <ClaudianModeSwitch compact />
          <div className="claudian-tab-bar-container">
            <ClaudianTabBadges />
          </div>
        </div>
      </header>

      <div className="claudian-shell-main">
        <div className="claudian-tab-content-container">
          {currentMode === 'config' ? <ClaudianConfigPage /> : null}
          {currentMode === 'claude' ? <ClaudeWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
          {currentMode === 'codex' ? <CodexWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
          {currentMode === 'classic' ? <ClassicWorkspace mode={mode} /> : null}
        </div>
      </div>
    </section>
  );
};
