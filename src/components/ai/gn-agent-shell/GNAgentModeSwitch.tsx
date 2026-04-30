import React from 'react';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import type { GNAgentShellMode } from '../../../modules/ai/gn-agent/types';

const MODE_ITEMS: Array<{ id: GNAgentShellMode; label: string; title: string; glyph: string }> = [
  { id: 'config', label: 'Settings', title: 'GN Agent settings', glyph: 'AI' },
  { id: 'skills', label: 'Skills', title: 'Global skill library', glyph: 'SK' },
  { id: 'claude', label: 'Local', title: 'Local Claude runtime', glyph: 'LT' },
  { id: 'codex', label: 'Codex', title: 'Codex runtime', glyph: '</>' },
  { id: 'classic', label: 'Chat', title: 'GN Agent chat', glyph: 'AI' },
];

export const GNAgentModeSwitch: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { mode, setMode } = useGNAgentShellStore();

  return (
    <div className={`gn-agent-mode-switch${compact ? ' gn-agent-mode-switch-compact' : ''}`}>
      {MODE_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`gn-agent-mode-switch-btn${mode === item.id ? ' active' : ''}`}
          title={item.title}
          aria-label={item.title}
          onClick={() => setMode(item.id)}
        >
          <span className="gn-agent-mode-switch-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          {!compact ? <span className="gn-agent-mode-switch-label">{item.label}</span> : null}
        </button>
      ))}
    </div>
  );
};

