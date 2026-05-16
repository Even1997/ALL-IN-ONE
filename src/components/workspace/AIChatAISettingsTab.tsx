// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
  jsonImportText: string;
  setJsonImportText: Dispatch<SetStateAction<string>>;
  showJsonImport: boolean;
  setShowJsonImport: Dispatch<SetStateAction<boolean>>;
  handleExportConfigs: () => Promise<void>;
  handleImportConfigs: () => void;
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
  jsonImportText,
  setJsonImportText,
  showJsonImport,
  setShowJsonImport,
  handleExportConfigs,
  handleImportConfigs,
  testMessage,
  testState,
}) => {
  const enabledConfigCount = aiConfigs.filter((config) => hasUsableAIConfigEntry(config) && config.enabled).length;
  const readyConfigCount = aiConfigs.filter((config) => hasUsableAIConfigEntry(config)).length;
  const savedModelCount = settingsDraft.savedModels.filter((item) => item.trim()).length;
  const configStatusLabel = isSettingsDraftComplete ? '已就绪' : '待完善';

  return (
    <div className="chat-settings-ai-layout">
      <aside className="chat-settings-provider-list">
        <div className="chat-settings-list-header">
          <div>
            <div className="chat-settings-eyebrow">AI</div>
            <strong>配置列表</strong>
          </div>
          <div className="chat-settings-list-meta">
            <span>{filteredConfigs.length} 项</span>
            <span>{enabledConfigCount} 已启用</span>
            <span>{readyConfigCount} 已就绪</span>
          </div>
        </div>

        <div className="chat-settings-provider-search">
          <input
            value={providerSearch}
            onChange={(event) => setProviderSearch(event.target.value)}
            placeholder="搜索配置"
          />
        </div>

        <button className="chat-settings-apply-btn" type="button" onClick={handleCreateConfig}>
          新建配置
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
                    {hasUsableAIConfigEntry(config) && config.enabled ? ' / 已启用' : ' / 未启用'}
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
              <div className="chat-settings-eyebrow">当前配置</div>
              <strong>{settingsDraft.name || '未命名配置'}</strong>
            </div>
            <div className="chat-settings-status-pills">
              <span>{providerTypeLabel(settingsDraft.provider)}</span>
              <span>{configStatusLabel}</span>
              {isSettingsDraftSelected ? <span>当前对话默认</span> : null}
            </div>
          </header>

          <div className="chat-settings-note-sections">
            <section className="chat-settings-section-block">
              <div className="chat-settings-section-header">
                <strong>接口类型</strong>
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
                  <span>配置名称</span>
                  <input
                    value={settingsDraft.name}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="OpenRouter 主用 / Claude 备用"
                  />
                </label>

                <label className="chat-settings-field">
                  <span>接口密钥</span>
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
                </label>

                <label className="chat-settings-field">
                  <span>接口地址</span>
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
                </label>

                <label className="chat-settings-field">
                  <span>模型</span>
                  <div className="chat-settings-inline">
                    <input
                      value={settingsDraft.model}
                      onChange={(event) => handleSelectActiveModel(event.target.value)}
                      placeholder={selectedSettingsPreset.models[0] || '输入模型 ID'}
                    />
                    <button className="chat-settings-inline-btn" type="button" onClick={() => void handleLoadModels()}>
                      {isLoadingModels ? '加载中…' : '获取模型'}
                    </button>
                  </div>
                </label>

                <div className="chat-settings-field chat-settings-field-full">
                  <span>候选模型</span>
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
                            placeholder="输入模型 ID"
                          />
                          <button type="button" className="chat-settings-inline-btn" onClick={() => handleSelectActiveModel(savedModel)}>
                            {isActiveModel ? '当前使用' : '设为当前'}
                          </button>
                          <button type="button" className="chat-settings-inline-btn" onClick={() => handleRemoveSavedModel(index)} disabled={disableRemove}>
                            移除
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" className="chat-settings-inline-btn chat-settings-model-add-btn" onClick={handleAddSavedModel}>
                      添加模型
                    </button>
                  </div>
                </div>

                <label className="chat-settings-field">
                  <span>上下文窗口</span>
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

                <div className="chat-settings-static-grid">
                  <article className="chat-settings-static-card">
                    <span>启用配置</span>
                    <strong>{enabledConfigCount} 项</strong>
                  </article>
                  <article className="chat-settings-static-card">
                    <span>候选模型</span>
                    <strong>{savedModelCount} 项</strong>
                  </article>
                </div>
              </div>
            </section>

            {settingsModelOptions.length > 0 ? (
              <section className="chat-settings-section-block">
                <div className="chat-settings-section-header">
                  <strong>可选模型</strong>
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

            <section className="chat-settings-section-block">
              <div className="chat-settings-section-header">
                <strong>导入与导出</strong>
                <span>导出或导入 JSON 配置包。</span>
              </div>
              <div className="chat-settings-import-actions">
                <button
                  className="chat-settings-apply-btn secondary"
                  type="button"
                  onClick={() => void handleExportConfigs()}
                >
                  导出 JSON
                </button>
                <button
                  className="chat-settings-apply-btn"
                  type="button"
                  onClick={() =>
                    setShowJsonImport((current) => {
                      if (current) {
                        setJsonImportText('');
                      }
                      return !current;
                    })
                  }
                >
                  {showJsonImport ? '收起导入' : '导入 JSON'}
                </button>
              </div>
              {showJsonImport ? (
                <div className="chat-settings-import-json">
                  <textarea
                    value={jsonImportText}
                    onChange={(event) => setJsonImportText(event.target.value)}
                    rows={8}
                    placeholder='{"version":2,"configs":[...]}'
                  />
                  <div className="chat-settings-import-actions">
                    <button className="chat-settings-apply-btn" type="button" onClick={handleImportConfigs}>
                      导入配置
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
            </section>
          </div>

          {testMessage ? (
            <section className={`chat-settings-test-note ${testState}`}>
              {testMessage}
            </section>
          ) : null}

          <footer className="chat-settings-note-actions">
            <button className="chat-settings-apply-btn secondary" type="button" onClick={handleApplySettings}>
              保存
            </button>
            <button className="chat-settings-apply-btn" type="button" onClick={handleToggleEnabled}>
              {settingsDraft.enabled ? '停用' : '启用'}
            </button>
            <button className="chat-settings-apply-btn" type="button" onClick={() => void handleTestConnection()}>
              {testState === 'testing' ? '测试中…' : '测试连接'}
            </button>
            {settingsDraft.id ? (
              <button
                className={`chat-settings-apply-btn${settingsDraft.id === selectedConfigId ? ' secondary' : ''}`}
                type="button"
                onClick={handleSelectConfig}
              >
                {settingsDraft.id === selectedConfigId ? '当前对话已使用' : '设为当前对话'}
              </button>
            ) : null}
            {aiConfigs.length > 1 ? (
              <button className="chat-settings-apply-btn danger" type="button" onClick={handleDeleteConfig}>
                删除
              </button>
            ) : null}
          </footer>
        </article>
      </section>
    </div>
  );
};
