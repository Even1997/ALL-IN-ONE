import React, { Suspense, lazy, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GNAgentSkillsPage } from '../ai/gn-agent-shell/GNAgentSkillsPage';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { RuntimeMcpSettingsPage } from './RuntimeMcpSettingsPage';
import { useAIChatSettingsState } from './useAIChatSettingsState';
import {
  AI_PROVIDER_TYPE_OPTIONS,
  CUSTOM_PROVIDER_PRESET,
  SETTINGS_TABS,
  buildProviderEndpointPreview,
  buildProviderKey,
  buildSettingsDraft,
  findPresetByConfig,
  getSuggestedBaseURL,
  mergeModelCandidates,
  providerTypeLabel,
  type SettingsTabId,
} from './globalSettingsPageShared';
import './AIChat.css';

const LazyAIChatAISettingsTab = lazy(async () => {
  const module = await import('./AIChatAISettingsTab');
  return { default: module.AIChatAISettingsTab };
});

let aiServiceModulePromise: Promise<typeof import('../../modules/ai/core/AIService')> | null = null;

const loadAIServiceModule = () => (aiServiceModulePromise ??= import('../../modules/ai/core/AIService'));

type GlobalSettingsPageProps = {
  activeSettingsTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  onExit: () => void;
};

export const GlobalSettingsPage: React.FC<GlobalSettingsPageProps> = ({
  activeSettingsTab,
  onSelectTab,
  onExit,
}) => {
  const {
    aiConfigs,
    selectedConfigId,
    addConfig,
    updateConfig,
    deleteConfig,
    selectConfig,
    setConfigEnabled,
  } = useGlobalAIStore(useShallow((state) => ({
    aiConfigs: state.aiConfigs,
    selectedConfigId: state.selectedConfigId,
    addConfig: state.addConfig,
    updateConfig: state.updateConfig,
    deleteConfig: state.deleteConfig,
    selectConfig: state.selectConfig,
    setConfigEnabled: state.setConfigEnabled,
  })));

  const {
    filteredConfigs,
    selectedSettingsConfig,
    selectedSettingsPreset,
    settingsModelOptions,
    isSettingsDraftComplete,
    isSettingsDraftSelected,
    showApiKey,
    setShowApiKey,
    providerSearch,
    setProviderSearch,
    testState,
    setTestState,
    testMessage,
    setTestMessage,
    isLoadingModels,
    setSelectedSettingsConfigId,
    settingsDraft,
    setSettingsDraft,
    handleTestConnection,
    handleLoadModels,
    handleAddSavedModel,
    handleUpdateSavedModel,
    handleRemoveSavedModel,
    handleSelectActiveModel,
    handleApplySettings,
    handleToggleEnabled,
    handleCreateConfig,
    handleDeleteConfig,
    handleSelectConfig,
  } = useAIChatSettingsState({
    aiConfigs,
    runtimeConfigIdOverride: null,
    selectedConfigId,
    addConfig,
    updateConfig,
    deleteConfig,
    selectConfig,
    setConfigEnabled,
    buildSettingsDraft,
    findPresetByConfig,
    customProviderPreset: CUSTOM_PROVIDER_PRESET,
    providerTypeOptions: AI_PROVIDER_TYPE_OPTIONS,
    buildProviderKey,
    mergeModelCandidates,
    buildProviderEndpointPreview,
    getSuggestedBaseURL,
    loadAIServiceModule,
  });

  const selectedSettingsTabMeta = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab) || SETTINGS_TABS[0],
    [activeSettingsTab],
  );

  const renderSettingsPlaceholder = useCallback(
    (tab: typeof SETTINGS_TABS[number]) => (
      <div className="chat-settings-placeholder-page">
        <section className="chat-settings-placeholder-note">
          <div className="chat-settings-eyebrow">{tab.eyebrow}</div>
          <strong>{tab.title}</strong>
          <span>Coming soon</span>
        </section>
      </div>
    ),
    [],
  );

  return (
    <section className="global-settings-page" aria-label={selectedSettingsTabMeta.title}>
      <div className="chat-settings-drawer-header global-settings-page-header">
        <div className="chat-settings-header-main">
          <button className="chat-settings-back" type="button" aria-label="退出设置" onClick={onExit}>
            ←
          </button>
          <div>
            <div className="chat-settings-eyebrow">{selectedSettingsTabMeta.eyebrow}</div>
            <strong>{selectedSettingsTabMeta.title}</strong>
            <div className="chat-settings-header-description">{selectedSettingsTabMeta.description}</div>
          </div>
        </div>
      </div>

      <div className="global-settings-page-body">
        <div className="chat-settings-workbench-shell">
          <aside className="chat-settings-workbench-sidebar">
            <div className="chat-settings-source-list">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`chat-settings-source-row${activeSettingsTab === tab.id ? ' active' : ''}`}
                  onClick={() => onSelectTab(tab.id)}
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="chat-settings-workbench-stage">
            {activeSettingsTab === 'ai' ? (
              <Suspense
                fallback={(
                  <div className="chat-settings-panel-surface">
                    <div className="chat-settings-placeholder-note muted">
                      <strong>加载 AI 设置中...</strong>
                    </div>
                  </div>
                )}
              >
                <LazyAIChatAISettingsTab
                  providerSearch={providerSearch}
                  setProviderSearch={setProviderSearch}
                  handleCreateConfig={handleCreateConfig}
                  filteredConfigs={filteredConfigs}
                  selectedSettingsConfig={selectedSettingsConfig}
                  getConfigPreset={(config) => findPresetByConfig(config.provider, config.baseURL) || CUSTOM_PROVIDER_PRESET}
                  providerTypeLabel={providerTypeLabel}
                  setSelectedSettingsConfigId={setSelectedSettingsConfigId}
                  setTestState={setTestState}
                  setTestMessage={setTestMessage}
                  settingsDraft={settingsDraft}
                  selectedSettingsPreset={selectedSettingsPreset}
                  isSettingsDraftComplete={isSettingsDraftComplete}
                  isSettingsDraftSelected={isSettingsDraftSelected}
                  providerTypeOptions={AI_PROVIDER_TYPE_OPTIONS}
                  setSettingsDraft={setSettingsDraft}
                  customProviderPresetId={CUSTOM_PROVIDER_PRESET.id}
                  getSuggestedBaseURL={getSuggestedBaseURL}
                  handleLoadModels={handleLoadModels}
                  isLoadingModels={isLoadingModels}
                  settingsModelOptions={settingsModelOptions}
                  handleAddSavedModel={handleAddSavedModel}
                  handleUpdateSavedModel={handleUpdateSavedModel}
                  handleRemoveSavedModel={handleRemoveSavedModel}
                  handleSelectActiveModel={handleSelectActiveModel}
                  handleApplySettings={handleApplySettings}
                  handleToggleEnabled={handleToggleEnabled}
                  handleTestConnection={handleTestConnection}
                  selectedConfigId={selectedConfigId}
                  handleSelectConfig={handleSelectConfig}
                  aiConfigs={aiConfigs}
                  handleDeleteConfig={handleDeleteConfig}
                  showApiKey={showApiKey}
                  setShowApiKey={setShowApiKey}
                  testMessage={testMessage}
                  testState={testState}
                />
              </Suspense>
            ) : null}

            {activeSettingsTab === 'skills' ? (
              <div className="chat-settings-surface chat-settings-panel-surface chat-settings-panel-surface-skills">
                <GNAgentSkillsPage />
              </div>
            ) : null}

            {activeSettingsTab === 'mcp' ? (
              <div className="chat-settings-panel-surface">
                <RuntimeMcpSettingsPage threadId={null} />
              </div>
            ) : null}

            {!['ai', 'skills', 'mcp'].includes(activeSettingsTab) ? (
              <div className="chat-settings-panel-surface">
                {renderSettingsPlaceholder(selectedSettingsTabMeta)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};
