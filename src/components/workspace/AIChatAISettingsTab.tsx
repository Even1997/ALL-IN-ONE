import React, { type Dispatch, type SetStateAction } from 'react';
import type { AIProviderType } from '../../modules/ai/core/AIService';
import type { ProviderPreset } from '../../modules/ai/providerPresets';
import { hasUsableAIConfigEntry, type AIConfigEntry } from '../../modules/ai/store/aiConfigState';

type AISettingsDraft = {
  id: string | null;
  name: string;
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  savedModels: string[];
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};

type AIProviderTypeOption = {
  value: AIProviderType;
  label: string;
  description: string;
};

type TestState = 'idle' | 'testing' | 'success' | 'error';

type AIChatAISettingsTabProps = {
  providerSearch: string;
  setProviderSearch: Dispatch<SetStateAction<string>>;
  handleCreateConfig: () => void;
  filteredConfigs: AIConfigEntry[];
  selectedSettingsConfig: AIConfigEntry | null;
  getConfigPreset: (config: AIConfigEntry) => ProviderPreset;
  providerTypeLabel: (provider: AIProviderType) => string;
  setSelectedSettingsConfigId: Dispatch<SetStateAction<string | null>>;
  setTestState: Dispatch<SetStateAction<TestState>>;
  setTestMessage: Dispatch<SetStateAction<string>>;
  settingsDraft: AISettingsDraft;
  selectedSettingsPreset: ProviderPreset;
  isSettingsDraftComplete: boolean;
  isSettingsDraftSelected: boolean;
  providerTypeOptions: AIProviderTypeOption[];
  setSettingsDraft: Dispatch<SetStateAction<AISettingsDraft>>;
  customProviderPresetId: string;
  getSuggestedBaseURL: (provider: AIProviderType, preset: ProviderPreset) => string;
  handleLoadModels: () => Promise<void>;
  isLoadingModels: boolean;
  settingsModelOptions: string[];
  handleAddSavedModel: () => void;
  handleUpdateSavedModel: (index: number, value: string) => void;
  handleRemoveSavedModel: (index: number) => void;
  handleSelectActiveModel: (model: string) => void;
  handleApplySettings: () => void;
  handleToggleEnabled: () => void;
  handleTestConnection: () => Promise<void>;
  selectedConfigId: string | null;
  handleSelectConfig: () => void;
  aiConfigs: AIConfigEntry[];
  handleDeleteConfig: () => void;
  showApiKey: boolean;
  setShowApiKey: Dispatch<SetStateAction<boolean>>;
  testMessage: string;
  testState: TestState;
};

export const AIChatAISettingsTab: React.FC<AIChatAISettingsTabProps> = ({
  providerSearch,
  setProviderSearch,
  handleCreateConfig,
  filteredConfigs,
  selectedSettingsConfig,
  getConfigPreset,
  providerTypeLabel,
  setSelectedSettingsConfigId,
  setTestState,
  setTestMessage,
  settingsDraft,
  selectedSettingsPreset,
  isSettingsDraftComplete,
  isSettingsDraftSelected,
  providerTypeOptions,
  setSettingsDraft,
  customProviderPresetId,
  getSuggestedBaseURL,
  handleLoadModels,
  isLoadingModels,
  settingsModelOptions,
  handleAddSavedModel,
  handleUpdateSavedModel,
  handleRemoveSavedModel,
  handleSelectActiveModel,
  handleApplySettings,
  handleToggleEnabled,
  handleTestConnection,
  selectedConfigId,
  handleSelectConfig,
  aiConfigs,
  handleDeleteConfig,
  showApiKey,
  setShowApiKey,
  testMessage,
  testState,
}) => {
  const providerSummary = `${providerTypeLabel(settingsDraft.provider)}${settingsDraft.enabled && isSettingsDraftComplete ? ' · enabled' : ' · disabled'}`;

  return (
    <div className="chat-settings-ai-layout">
      <aside className="chat-settings-provider-list">
        <div className="chat-settings-provider-search">
          <input
            value={providerSearch}
            onChange={(event) => setProviderSearch(event.target.value)}
            placeholder="Search AI configs"
          />
        </div>

        <button className="chat-settings-apply-btn" type="button" onClick={handleCreateConfig}>
          New AI Config
        </button>

        <div className="chat-settings-provider-items">
          {filteredConfigs.map((config) => {
            const isActive = selectedSettingsConfig?.id === config.id;
            const configPreset = getConfigPreset(config);

            return (
              <button
                key={config.id}
                className={`chat-settings-provider-item${isActive ? ' active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedSettingsConfigId(config.id);
                  setTestState('idle');
                  setTestMessage('');
                }}
              >
                <span className={`chat-settings-provider-badge ${configPreset.accent}`}>{config.name.slice(0, 2).toUpperCase()}</span>
                <span className="chat-settings-provider-copy">
                  <strong>{config.name}</strong>
                  <span>
                    {providerTypeLabel(config.provider)}
                    {hasUsableAIConfigEntry(config) && config.enabled ? ' / enabled' : ' / disabled'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="chat-settings-ai-stage">
        <article className="chat-settings-note-surface">
          <header className="chat-settings-note-header">
            <div>
              <div className="chat-settings-eyebrow">AI Settings</div>
              <strong>{settingsDraft.name || 'Untitled AI'}</strong>
            </div>
            <div className="chat-settings-status-pills">
              <span>{providerSummary}</span>
              <span>{isSettingsDraftSelected ? 'selected in chat' : 'not selected'}</span>
            </div>
          </header>

          <div className="chat-settings-note-sections">
            <section className="chat-settings-section-block">
              <div className="chat-settings-section-header">
                <strong>API Type</strong>
              </div>
              <div className="chat-settings-type-grid">
                {providerTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`chat-settings-type-card${settingsDraft.provider === option.value ? ' active' : ''}`}
                    type="button"
                    onClick={() =>
                      setSettingsDraft((current) => ({
                        ...current,
                        provider: option.value,
                        baseURL:
                          current.baseURL.trim()
                          || (
                            selectedSettingsPreset.id !== customProviderPresetId
                            && option.value === selectedSettingsPreset.type
                              ? selectedSettingsPreset.baseURL
                              : current.baseURL
                          ),
                      }))
                    }
                  >
                    <strong>{option.label}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="chat-settings-section-block">
              <div className="chat-settings-grid">
                <label className="chat-settings-field chat-settings-field-full">
                  <span>Config Name</span>
                  <input
                    value={settingsDraft.name}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="OpenRouter Primary / Claude Backup"
                  />
                </label>

                <label className="chat-settings-field">
                  <span>API Key</span>
                  <div className="chat-settings-inline">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settingsDraft.apiKey}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                      placeholder={selectedSettingsPreset.keyHint}
                    />
                    <button className="chat-settings-inline-btn" type="button" onClick={() => setShowApiKey((current) => !current)}>
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label className="chat-settings-field">
                  <span>Base URL</span>
                  <div className="chat-settings-inline">
                    <input
                      value={settingsDraft.baseURL}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          baseURL: event.target.value,
                        }))
                      }
                      placeholder={getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset)}
                    />
                    <button
                      className="chat-settings-inline-btn"
                      type="button"
                      onClick={() =>
                        setSettingsDraft((current) => ({
                          ...current,
                          baseURL: getSuggestedBaseURL(current.provider, selectedSettingsPreset),
                        }))
                      }
                    >
                      Reset
                    </button>
                  </div>
                </label>

                <label className="chat-settings-field">
                  <span>Model</span>
                  <div className="chat-settings-inline">
                    <input
                      value={settingsDraft.model}
                      onChange={(event) => handleSelectActiveModel(event.target.value)}
                      placeholder={selectedSettingsPreset.models[0] || 'Enter model id'}
                    />
                    <button className="chat-settings-inline-btn" type="button" onClick={() => void handleLoadModels()}>
                      {isLoadingModels ? 'Loading...' : 'Fetch Models'}
                    </button>
                  </div>
                </label>

                <div className="chat-settings-field chat-settings-field-full">
                  <span>Saved Models</span>
                  <div className="chat-settings-model-rows">
                    {settingsDraft.savedModels.map((savedModel, index) => {
                      const trimmedModel = savedModel.trim();
                      const isActiveModel = trimmedModel && settingsDraft.model === trimmedModel;
                      const validCandidateCount = settingsDraft.savedModels.filter((item) => item.trim()).length;
                      const disableRemove = validCandidateCount <= 1 && Boolean(trimmedModel);

                      return (
                        <div key={`${index}-${savedModel}`} className="chat-settings-model-row">
                          <input
                            value={savedModel}
                            onChange={(event) => handleUpdateSavedModel(index, event.target.value)}
                            placeholder="Enter model id"
                          />
                          <button type="button" className="chat-settings-inline-btn" onClick={() => handleSelectActiveModel(savedModel)}>
                            {isActiveModel ? 'Active' : 'Set active'}
                          </button>
                          <button type="button" className="chat-settings-inline-btn" onClick={() => handleRemoveSavedModel(index)} disabled={disableRemove}>
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" className="chat-settings-inline-btn chat-settings-model-add-btn" onClick={handleAddSavedModel}>
                      Add model
                    </button>
                  </div>
                </div>

                <label className="chat-settings-field">
                  <span>Context Window</span>
                  <div className="chat-settings-input-unit">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={Math.round(settingsDraft.contextWindowTokens / 1000)}
                      onChange={(event) =>
                        setSettingsDraft((current) => {
                          const nextValue = Number(event.target.value) * 1000;
                          return {
                            ...current,
                            contextWindowTokens: Math.max(1000, Number.isFinite(nextValue) ? nextValue : 258000),
                          };
                        })
                      }
                    />
                    <span className="chat-settings-unit">k</span>
                  </div>
                </label>

              </div>
            </section>

            {settingsModelOptions.length > 0 ? (
              <section className="chat-settings-section-block">
                <div className="chat-settings-section-header">
                  <strong>Model Candidates</strong>
                </div>
                <div className="chat-settings-model-grid">
                  {settingsModelOptions.map((candidate) => (
                    <button
                      key={candidate}
                      className={`chat-settings-model-chip${settingsDraft.model === candidate ? ' active' : ''}`}
                      type="button"
                      onClick={() => handleSelectActiveModel(candidate)}
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

          </div>

          {testMessage ? (
            <section className={`chat-settings-test-note ${testState}`}>
              {testMessage}
            </section>
          ) : null}

          <footer className="chat-settings-note-actions">
            <button className="chat-settings-apply-btn secondary" type="button" onClick={handleApplySettings}>
              Save
            </button>
            <button className="chat-settings-apply-btn" type="button" onClick={handleToggleEnabled}>
              {settingsDraft.enabled ? 'Disable' : 'Enable'}
            </button>
            <button className="chat-settings-apply-btn" type="button" onClick={() => void handleTestConnection()}>
              {testState === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {settingsDraft.id ? (
              <button
                className={`chat-settings-apply-btn${settingsDraft.id === selectedConfigId ? ' secondary' : ''}`}
                type="button"
                onClick={handleSelectConfig}
              >
                {settingsDraft.id === selectedConfigId ? 'Selected In Chat' : 'Use In Chat'}
              </button>
            ) : null}
            {aiConfigs.length > 1 ? (
              <button className="chat-settings-apply-btn danger" type="button" onClick={handleDeleteConfig}>
                Delete
              </button>
            ) : null}
          </footer>
        </article>
      </section>
    </div>
  );
};
