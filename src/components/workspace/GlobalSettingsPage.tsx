import React, { Suspense, lazy, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GNAgentSkillsPage } from '../ai/gn-agent-shell/GNAgentSkillsPage';
import { aiService } from '../../modules/ai/core/AIService';
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
  type SettingsTabMeta,
} from './globalSettingsPageShared';
import { AppearanceSettingsPanel } from './settings/AppearanceSettingsPanel';
import { AdvancedSettingsPanel } from './settings/AdvancedSettingsPanel';
import { GeneralSettingsPanel } from './settings/GeneralSettingsPanel';
import { PermissionsSettingsPanel } from './settings/PermissionsSettingsPanel';
import { SettingsPlaceholderPanel } from './settings/SettingsPlaceholderPanel';
import { SettingsSection } from './settings/SettingsSection';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { StorageSettingsPanel } from './settings/StorageSettingsPanel';
import './AIChat.css';

const LazyAIChatAISettingsTab = lazy(async () => {
  const module = await import('./AIChatAISettingsTab');
  return { default: module.AIChatAISettingsTab };
});

type GlobalSettingsPageProps = {
  activeSettingsTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  onExit: () => void;
};

const PLACEHOLDER_CONTENT: Record<Exclude<SettingsTabId, 'ai' | 'mcp' | 'skills'>, string[]> = {
  general: ['语言设置', '启动行为', '版本信息'],
  permissions: ['审批模式', '沙箱边界', '恢复策略'],
  appearance: ['主题模式', '阅读宽度', '界面密度'],
  storage: ['项目根目录', '索引文件', '路径诊断'],
  advanced: ['Shell 模式', 'Provider 绑定', '运行诊断'],
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
    jsonImportText,
    setJsonImportText,
    showJsonImport,
    setShowJsonImport,
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
    handleExportConfigs,
    handleImportConfigs,
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
    aiServiceClient: aiService,
  });

  const selectedSettingsTabMeta = useMemo<SettingsTabMeta>(
    () => SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab) || SETTINGS_TABS[0],
    [activeSettingsTab],
  );

  const renderStageContent = () => {
    switch (activeSettingsTab) {
      case 'general':
        return <GeneralSettingsPanel />;
      case 'appearance':
        return <AppearanceSettingsPanel />;
      case 'permissions':
        return <PermissionsSettingsPanel />;
      case 'storage':
        return <StorageSettingsPanel />;
      case 'advanced':
        return <AdvancedSettingsPanel />;
      case 'ai':
        return (
          <Suspense
            fallback={(
              <div className="chat-settings-panel-surface">
                <SettingsSection
                  className="chat-settings-placeholder-note muted"
                  eyebrow="AI"
                  title="正在加载 AI 设置"
                  description="准备模型配置与连接测试。"
                />
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
              jsonImportText={jsonImportText}
              setJsonImportText={setJsonImportText}
              showJsonImport={showJsonImport}
              setShowJsonImport={setShowJsonImport}
              handleExportConfigs={handleExportConfigs}
              handleImportConfigs={handleImportConfigs}
              testMessage={testMessage}
              testState={testState}
            />
          </Suspense>
        );
      case 'skills':
        return (
          <div className="chat-settings-surface chat-settings-panel-surface chat-settings-panel-surface-skills">
            <GNAgentSkillsPage />
          </div>
        );
      case 'mcp':
        return (
          <div className="chat-settings-panel-surface">
            <RuntimeMcpSettingsPage threadId={null} />
          </div>
        );
      default:
        return (
          <div className="chat-settings-panel-surface">
            <SettingsPlaceholderPanel
              meta={selectedSettingsTabMeta}
              highlights={PLACEHOLDER_CONTENT[activeSettingsTab]}
            />
          </div>
        );
    }
  };

  return (
    <section className="global-settings-page" aria-label={selectedSettingsTabMeta.title}>
      <div className="chat-settings-drawer-header global-settings-page-header">
        <div className="chat-settings-header-main">
          <button className="chat-settings-back" type="button" aria-label="退出设置" onClick={onExit}>
            {'<'}
          </button>
          <div className="chat-settings-header-copy">
            <div className="chat-settings-eyebrow">{selectedSettingsTabMeta.eyebrow}</div>
            <strong>{selectedSettingsTabMeta.title}</strong>
            <div className="chat-settings-header-description">{selectedSettingsTabMeta.description}</div>
          </div>
        </div>
      </div>

      <div className="global-settings-page-body">
        <div className="chat-settings-workbench-shell">
          <SettingsSidebar tabs={SETTINGS_TABS} activeTab={activeSettingsTab} onSelectTab={onSelectTab} />
          <div className="chat-settings-workbench-stage">{renderStageContent()}</div>
        </div>
      </div>
    </section>
  );
};
