import React from 'react';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import type { GNAgentShellMode } from '../../../modules/ai/gn-agent/types';
import './GNAgentModeSwitch.css';

const MODE_ITEMS: Array<{ id: GNAgentShellMode; label: string; title: string; glyph: string }> = [
  { id: 'config', label: '设置', title: 'GN Agent 设置', glyph: '设' },
  { id: 'skills', label: '技能页', title: '打开 GoodNight 技能页', glyph: '技' },
  { id: 'claude', label: '本地', title: '本地 Claude 运行时', glyph: '本' },
  { id: 'codex', label: 'Codex', title: 'Codex 运行时', glyph: 'C' },
  { id: 'classic', label: '聊天', title: 'GN Agent 聊天', glyph: '聊' },
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
          {compact && (item.id === 'skills' || mode === item.id) ? (
            <span className="gn-agent-mode-switch-label-inline">{item.label}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
};
