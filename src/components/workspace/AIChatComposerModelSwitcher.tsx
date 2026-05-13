import React, { useEffect, useRef, useState } from 'react';
import type { AIConfigEntry } from '../../modules/ai/store/aiConfigState';

type AIChatComposerModelSwitcherProps = {
  activeRuntimeConfig: AIConfigEntry | null;
  enabledRuntimeConfigs: AIConfigEntry[];
  runtimeModelOptions: string[];
  isRuntimeConfigLocked: boolean;
  allowConfigSelection: boolean;
  onSelectConfig: (configId: string) => void;
  onSelectModel: (model: string) => void;
};

export const AIChatComposerModelSwitcher: React.FC<AIChatComposerModelSwitcherProps> = ({
  activeRuntimeConfig,
  enabledRuntimeConfigs,
  runtimeModelOptions,
  isRuntimeConfigLocked,
  allowConfigSelection,
  onSelectConfig,
  onSelectModel,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="chat-model-switcher">
      <button
        type="button"
        className={`chat-model-switcher-trigger ${isRuntimeConfigLocked ? 'locked' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch model"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{activeRuntimeConfig?.name || 'No AI Enabled'}</span>
        <strong>{activeRuntimeConfig?.model || 'Select Model'}</strong>
        <span className="chat-model-switcher-caret">▾</span>
      </button>

      {open ? (
        <div className="chat-model-switcher-menu" role="menu">
          <div className="chat-model-switcher-configs">
            {enabledRuntimeConfigs.map((config) => (
              <button
                key={config.id}
                type="button"
                className={`chat-model-switcher-config-item ${activeRuntimeConfig?.id === config.id ? 'active' : ''}`}
                disabled={!allowConfigSelection}
                onClick={() => {
                  onSelectConfig(config.id);
                  if (allowConfigSelection) {
                    setOpen(false);
                  }
                }}
              >
                <strong>{config.name}</strong>
                <span>{config.provider}</span>
              </button>
            ))}
            {enabledRuntimeConfigs.length === 0 ? (
              <div className="chat-model-switcher-empty">No enabled configs</div>
            ) : null}
          </div>

          <div className="chat-model-switcher-models">
            {runtimeModelOptions.map((model) => (
              <button
                key={model}
                type="button"
                className={`chat-model-switcher-model-item ${activeRuntimeConfig?.model === model ? 'active' : ''}`}
                onClick={() => {
                  onSelectModel(model);
                  setOpen(false);
                }}
              >
                {model}
              </button>
            ))}
            {runtimeModelOptions.length === 0 ? (
              <div className="chat-model-switcher-empty">No models available</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
