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
  selectedProviderTypeDescription: string;
  providerTypeOptions: AIProviderTypeOption[];
  setSettingsDraft: Dispatch<SetStateAction<AISettingsDraft>>;
  customProviderPresetId: string;
  getSuggestedBaseURL: (provider: AIProviderType, preset: ProviderPreset) => string;
  selectedProviderEndpoint: string;
  handleLoadModels: () => Promise<void>;
  isLoadingModels: boolean;
  selectedProviderListMode: string;
  customHeadersJsonValid: boolean;
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
  handleExportConfigs: () => Promise<void>;
  setShowJsonImport: Dispatch<SetStateAction<boolean>>;
  showJsonImport: boolean;
  jsonImportText: string;
  setJsonImportText: Dispatch<SetStateAction<string>>;
  handleImportConfigs: () => void;
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
  selectedProviderTypeDescription,
  providerTypeOptions,
  setSettingsDraft,
  customProviderPresetId,
  getSuggestedBaseURL,
  selectedProviderEndpoint,
  handleLoadModels,
  isLoadingModels,
  selectedProviderListMode,
  customHeadersJsonValid,
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
  handleExportConfigs,
  setShowJsonImport,
  showJsonImport,
  jsonImportText,
  setJsonImportText,
  handleImportConfigs,
  aiConfigs,
  handleDeleteConfig,
  showApiKey,
  setShowApiKey,
  testMessage,
  testState,
}) => (
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
              className={`chat-settings-provider-item ${isActive ? 'active' : ''}`}
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
                  {config.enabled && hasUsableAIConfigEntry(config) ? ' / enabled' : ' / disabled'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>

    <div className="chat-settings-detail">
      <div className="chat-settings-detail-header">
        <div>
          <strong>{settingsDraft.name || 'Untitled AI'}</strong>
          <span>Saved locally. Only enabled configs appear in the chat runtime picker.</span>
        </div>
      </div>

      <div className="chat-settings-summary-card">
        <div>
          <span className="chat-settings-summary-label">Current config</span>
          <strong>{settingsDraft.name || 'Untitled AI'}</strong>
          <p>{selectedSettingsPreset.note}</p>
        </div>
        <div className="chat-settings-summary-meta">
          <span>{providerTypeLabel(settingsDraft.provider)}</span>
          <span>{settingsDraft.enabled && isSettingsDraftComplete ? 'enabled' : 'disabled'}</span>
          <span>{isSettingsDraftSelected ? 'selected in chat' : 'not selected'}</span>
        </div>
      </div>

      <div className="chat-settings-section">
        <div className="chat-settings-section-header">
          <strong>API Type</strong>
          <span>{selectedProviderTypeDescription}</span>
        </div>

        <div className="chat-settings-type-grid">
          {providerTypeOptions.map((option) => (
            <button
              key={option.value}
              className={`chat-settings-type-card ${settingsDraft.provider === option.value ? 'active' : ''}`}
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
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </div>

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
          <small>This label is shown in the chat composer switcher.</small>
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
          <small>{settingsDraft.apiKey.trim() ? 'API key is set.' : 'API key is empty.'}</small>
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
          <small>{selectedProviderEndpoint}</small>
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
              {isLoadingModels ? 'Loading...' : selectedProviderListMode === 'preset-only' ? 'Use Presets' : 'Fetch Models'}
            </button>
          </div>
          <small>
            {selectedProviderListMode === 'preset-only'
              ? 'This provider uses preset model candidates.'
              : 'This provider can fetch remote model candidates.'}
          </small>
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
                  <button
                    type="button"
                    className="chat-settings-inline-btn"
                    onClick={() => handleSelectActiveModel(savedModel)}
                  >
                    {isActiveModel ? 'Active' : 'Set active'}
                  </button>
                  <button
                    type="button"
                    className="chat-settings-inline-btn"
                    onClick={() => handleRemoveSavedModel(index)}
                    disabled={disableRemove}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="chat-settings-inline-btn chat-settings-model-add-btn"
              onClick={handleAddSavedModel}
            >
              Add model
            </button>
          </div>
          <small>Maintain multiple models for one provider config and choose which one is active.</small>
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
          <small>Used for context budget guidance in the chat composer.</small>
        </label>

        <label className="chat-settings-field chat-settings-field-full">
          <span>
            Custom Headers
            {settingsDraft.customHeaders.trim() ? (
              <small className={`chat-settings-json-status ${customHeadersJsonValid ? 'valid' : 'invalid'}`}>
                {customHeadersJsonValid ? 'JSON valid' : 'JSON invalid'}
              </small>
            ) : null}
          </span>
          <textarea
            value={settingsDraft.customHeaders}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                customHeaders: event.target.value,
              }))
            }
            placeholder='{"HTTP-Referer":"https://your-app.com","X-Title":"GoodNight"}'
            rows={4}
          />
          <small>Optional JSON headers for providers that require extra metadata.</small>
        </label>
      </div>

      {settingsModelOptions.length > 0 ? (
        <div className="chat-settings-model-grid">
          {settingsModelOptions.map((candidate) => (
            <button
              key={candidate}
              className={`chat-settings-model-chip ${settingsDraft.model === candidate ? 'active' : ''}`}
              type="button"
              onClick={() => handleSelectActiveModel(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-settings-actions">
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
            className={`chat-settings-apply-btn ${settingsDraft.id === selectedConfigId ? 'secondary' : ''}`}
            type="button"
            onClick={handleSelectConfig}
          >
            {settingsDraft.id === selectedConfigId ? 'Selected In Chat' : 'Use In Chat'}
          </button>
        ) : null}
        <button className="chat-settings-apply-btn" type="button" onClick={() => void handleExportConfigs()}>
          Export JSON
        </button>
        <button
          className="chat-settings-apply-btn"
          type="button"
          onClick={() => {
            setShowJsonImport(true);
            setTestState('idle');
            setTestMessage('');
          }}
        >
          Import JSON
        </button>
        {aiConfigs.length > 1 ? (
          <button className="chat-settings-apply-btn danger" type="button" onClick={handleDeleteConfig}>
            Delete
          </button>
        ) : null}
        <a className="chat-settings-doc-link" href={selectedSettingsPreset.docsUrl} target="_blank" rel="noreferrer">
          View Docs
        </a>
      </div>

      {showJsonImport ? (
        <div className="chat-settings-import-json">
          <span>Import AI Config JSON</span>
          <textarea
            value={jsonImportText}
            onChange={(event) => setJsonImportText(event.target.value)}
            placeholder='[{"provider":"openai-compatible","apiKey":"sk-...","baseURL":"https://api.openai.com/v1","model":"gpt-4o-mini"}]'
            rows={6}
          />
          <div className="chat-settings-import-actions">
            <button className="chat-settings-apply-btn" type="button" onClick={handleImportConfigs}>
              Import
            </button>
            <button
              className="chat-settings-apply-btn secondary"
              type="button"
              onClick={() => {
                setShowJsonImport(false);
                setJsonImportText('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {testMessage ? <div className={`chat-settings-test-note ${testState}`}>{testMessage}</div> : null}
    </div>
  </div>
);
