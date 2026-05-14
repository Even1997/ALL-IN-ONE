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
  const activeConfigLabel = activeRuntimeConfig?.name || 'No AI Enabled';
  const activeModelLabel = activeRuntimeConfig?.model || 'Select Model';
  const activeProviderMonogram = activeRuntimeConfig ? getProviderMonogram(activeRuntimeConfig.provider) : '--';

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
        aria-label={`Switch model (${activeModelLabel})`}
        title={`${activeConfigLabel} / ${activeModelLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="chat-model-switcher-trigger-brand" aria-hidden="true">
          <TriggerSparkIcon />
          <span className="chat-model-switcher-trigger-brand-monogram">{activeProviderMonogram}</span>
        </span>
      </button>

      {open ? (
        <div className="chat-model-switcher-menu" role="menu" aria-label="Model switcher">
          <div className="chat-model-switcher-provider-rail chat-model-switcher-configs" aria-label="Providers">
            {enabledRuntimeConfigs.map((config) => {
              return (
                <button
                  key={config.id}
                  type="button"
                  className={`chat-model-switcher-config-item ${activeRuntimeConfig?.id === config.id ? 'active' : ''}`}
                  title={config.name}
                  disabled={!allowConfigSelection}
                  onClick={() => {
                    onSelectConfig(config.id);
                    if (allowConfigSelection) {
                      setOpen(false);
                    }
                  }}
                >
                  <span className="chat-model-switcher-provider-avatar" aria-hidden="true">
                    <span className="chat-model-switcher-provider-icon">{getProviderMonogram(config.provider)}</span>
                  </span>
                  <span className="chat-model-switcher-provider-copy">
                    <strong>{config.name}</strong>
                  </span>
                </button>
              );
            })}
            {enabledRuntimeConfigs.length === 0 ? (
              <div className="chat-model-switcher-empty">No enabled configs</div>
            ) : null}
          </div>

          <div className="chat-model-switcher-model-panel chat-model-switcher-models" aria-label="Models">
            {runtimeModelOptions.map((model) => {
              const status = getModelStatus(activeRuntimeConfig, model);

              return (
                <button
                  key={model}
                  type="button"
                  className={`chat-model-switcher-model-item ${activeRuntimeConfig?.model === model ? 'active' : ''}`}
                  title={model}
                  aria-pressed={activeRuntimeConfig?.model === model}
                  onClick={() => {
                    onSelectModel(model);
                    setOpen(false);
                  }}
                >
                  <strong className="chat-model-switcher-model-label">{model}</strong>
                  <span className={`chat-model-switcher-model-meta ${status}`} aria-hidden="true">
                    {status === 'current' ? (
                      <StatusCheckIcon />
                    ) : status === 'saved' ? (
                      <StatusBookmarkIcon />
                    ) : (
                      <StatusDotIcon />
                    )}
                  </span>
                </button>
              );
            })}
            {runtimeModelOptions.length === 0 ? (
              <div className="chat-model-switcher-empty">No models available</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

type ModelStatus = 'current' | 'saved' | 'available';

const getModelStatus = (activeRuntimeConfig: AIConfigEntry | null, model: string): ModelStatus => {
  if (activeRuntimeConfig?.model === model) {
    return 'current';
  }

  if (activeRuntimeConfig?.savedModels?.includes(model)) {
    return 'saved';
  }

  return 'available';
};

const getProviderMonogram = (provider: string) => {
  const normalized = provider.trim().toLowerCase();

  switch (normalized) {
    case 'openai':
      return 'OA';
    case 'anthropic':
      return 'AN';
    case 'deepseek':
      return 'DS';
    case 'google':
    case 'gemini':
      return 'G';
    case 'openrouter':
      return 'OR';
    case 'xai':
      return 'XA';
    case 'ollama':
      return 'OL';
    case 'moonshot':
      return 'MS';
    default:
      return normalized
        .split(/[\s-_/]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || provider.slice(0, 2).toUpperCase();
  }
};

const TriggerSparkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2.25L9.32 5.02L12.1 6.34L9.32 7.66L8 10.43L6.68 7.66L3.9 6.34L6.68 5.02L8 2.25Z"
      fill="currentColor"
    />
    <circle cx="11.85" cy="11.85" r="1.1" fill="currentColor" opacity="0.7" />
  </svg>
);

const StatusCheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <path d="M4.2 8.2L6.7 10.7L11.8 5.55" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatusBookmarkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <path d="M5.1 3.2H10.9C11.29 3.2 11.6 3.51 11.6 3.9V12.35L8 10.25L4.4 12.35V3.9C4.4 3.51 4.71 3.2 5.1 3.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const StatusDotIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.05" fill="currentColor" />
  </svg>
);
