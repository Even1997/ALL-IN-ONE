import React from 'react';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import type { ClaudianShellMode } from '../../../modules/ai/claudian/types';

const MODE_ITEMS: Array<{ id: ClaudianShellMode; label: string; title: string; glyph: string }> = [
  { id: 'config', label: 'Claudian', title: 'Claudian 配置页', glyph: '◌' },
  { id: 'claude', label: 'Claude', title: 'Claude 页面', glyph: '✦' },
  { id: 'codex', label: 'Codex', title: 'Codex 页面', glyph: '</>' },
  { id: 'classic', label: 'Classic', title: 'Classic AI Chat', glyph: 'AI' },
];

export const ClaudianModeSwitch: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { mode, setMode } = useClaudianShellStore();

  return (
    <div className={`claudian-mode-switch${compact ? ' claudian-mode-switch-compact' : ''}`}>
      {MODE_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`claudian-mode-switch-btn${mode === item.id ? ' active' : ''}`}
          title={item.title}
          aria-label={item.title}
          onClick={() => setMode(item.id)}
        >
          <span className="claudian-mode-switch-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          {!compact ? <span className="claudian-mode-switch-label">{item.label}</span> : null}
        </button>
      ))}
    </div>
  );
};
