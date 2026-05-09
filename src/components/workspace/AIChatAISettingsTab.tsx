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
          placeholder="搜索 AI 配置"
        />
      </div>

      <button className="chat-settings-apply-btn" type="button" onClick={handleCreateConfig}>
        新增 AI 配置
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
                  {config.enabled && hasUsableAIConfigEntry(config) ? ' · 已启用' : ' · 已关闭'}
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
          <strong>{settingsDraft.name || '未命名 AI'}</strong>
          <span>保存为本地配置项，只有启用后才会出现在聊天选择里。</span>
        </div>
      </div>

      <div className="chat-settings-summary-card">
        <div>
          <span className="chat-settings-summary-label">当前配置</span>
          <strong>{settingsDraft.name || '未命名 AI'}</strong>
          <p>{selectedSettingsPreset.note}</p>
        </div>
        <div className="chat-settings-summary-meta">
          <span>{providerTypeLabel(settingsDraft.provider)}</span>
          <span>{settingsDraft.enabled && isSettingsDraftComplete ? '已启用' : '未启用'}</span>
          <span>{isSettingsDraftSelected ? '当前聊天中' : '未选中'}</span>
        </div>
      </div>

      <div className="chat-settings-section">
        <div className="chat-settings-section-header">
          <strong>API 类型</strong>
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
          <span>配置名称</span>
          <input
            value={settingsDraft.name}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="例如：OpenRouter 主力 / Claude 备用"
          />
          <small>聊天框顶部会显示这个名称。</small>
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
              {showApiKey ? '隐藏' : '显示'}
            </button>
          </div>
          <small>{settingsDraft.apiKey.trim() ? '已填写 API Key，可直接测试连接。' : '还没有填写 API Key。'}</small>
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
              重置
            </button>
          </div>
          <small>{selectedProviderEndpoint}</small>
        </label>

        <label className="chat-settings-field">
          <span>Model</span>
          <div className="chat-settings-inline">
            <input
              value={settingsDraft.model}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              placeholder={selectedSettingsPreset.models[0] || '输入模型 ID'}
            />
            <button className="chat-settings-inline-btn" type="button" onClick={() => void handleLoadModels()}>
              {isLoadingModels ? '加载中…' : selectedProviderListMode === 'preset-only' ? '内置候选' : '拉取模型'}
            </button>
          </div>
          <small>
            {selectedProviderListMode === 'preset-only'
              ? '当前 provider 使用内置模型候选。'
              : '当前 provider 支持远程拉取模型列表。'}
          </small>
        </label>

        <label className="chat-settings-field">
          <span>上下文长度</span>
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
          <small>默认 258k，用于提示当前上下文占用，并作为后续引用预算。</small>
        </label>

        <label className="chat-settings-field chat-settings-field-full">
          <span>
            Custom Headers
            {settingsDraft.customHeaders.trim() ? (
              <small className={`chat-settings-json-status ${customHeadersJsonValid ? 'valid' : 'invalid'}`}>
                {customHeadersJsonValid ? 'JSON 有效' : 'JSON 无效'}
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
          <small>需要额外请求头时，在这里直接填写 JSON。</small>
        </label>
      </div>

      {settingsModelOptions.length > 0 ? (
        <div className="chat-settings-model-grid">
          {settingsModelOptions.map((candidate) => (
            <button
              key={candidate}
              className={`chat-settings-model-chip ${settingsDraft.model === candidate ? 'active' : ''}`}
              type="button"
              onClick={() =>
                setSettingsDraft((current) => ({
                  ...current,
                  model: candidate,
                }))
              }
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-settings-actions">
        <button className="chat-settings-apply-btn secondary" type="button" onClick={handleApplySettings}>
          保存
        </button>
        <button className="chat-settings-apply-btn" type="button" onClick={handleToggleEnabled}>
          {settingsDraft.enabled ? '关闭' : '启用'}
        </button>
        <button className="chat-settings-apply-btn" type="button" onClick={() => void handleTestConnection()}>
          {testState === 'testing' ? '测试中…' : '测试连接'}
        </button>
        {settingsDraft.id ? (
          <button
            className={`chat-settings-apply-btn ${settingsDraft.id === selectedConfigId ? 'secondary' : ''}`}
            type="button"
            onClick={handleSelectConfig}
          >
            {settingsDraft.id === selectedConfigId ? '当前聊天中' : '选择使用'}
          </button>
        ) : null}
        <button className="chat-settings-apply-btn" type="button" onClick={() => void handleExportConfigs()}>
          导出 JSON
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
          导入 JSON
        </button>
        {aiConfigs.length > 1 ? (
          <button className="chat-settings-apply-btn danger" type="button" onClick={handleDeleteConfig}>
            删除
          </button>
        ) : null}
        <a className="chat-settings-doc-link" href={selectedSettingsPreset.docsUrl} target="_blank" rel="noreferrer">
          查看文档
        </a>
      </div>

      {showJsonImport ? (
        <div className="chat-settings-import-json">
          <span>导入 AI 配置 (JSON)</span>
          <textarea
            value={jsonImportText}
            onChange={(event) => setJsonImportText(event.target.value)}
            placeholder='[{"provider":"openai-compatible","apiKey":"sk-...","baseURL":"https://api.openai.com/v1","model":"gpt-4o-mini"}]'
            rows={6}
          />
          <div className="chat-settings-import-actions">
            <button className="chat-settings-apply-btn" type="button" onClick={handleImportConfigs}>
              导入
            </button>
            <button
              className="chat-settings-apply-btn secondary"
              type="button"
              onClick={() => {
                setShowJsonImport(false);
                setJsonImportText('');
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {testMessage ? <div className={`chat-settings-test-note ${testState}`}>{testMessage}</div> : null}
    </div>
  </div>
);
