import { useCallback, useEffect, useMemo, useState } from 'react';
import { listModelsSupportMode } from '../../modules/ai/core/configStatus';
import type { AIProviderType } from '../../modules/ai/core/AIService';
import type { ProviderPreset } from '../../modules/ai/providerPresets';
import { hasUsableAIConfigEntry, type AIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';

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

type ModelCatalog = Record<string, string[]>;
type TestState = 'idle' | 'testing' | 'success' | 'error';

type UseAIChatSettingsStateInput = {
  aiConfigs: AIConfigEntry[];
  runtimeConfigIdOverride: string | null;
  selectedConfigId: string | null;
  addConfig: ReturnType<typeof useGlobalAIStore.getState>['addConfig'];
  updateConfig: ReturnType<typeof useGlobalAIStore.getState>['updateConfig'];
  deleteConfig: ReturnType<typeof useGlobalAIStore.getState>['deleteConfig'];
  selectConfig: ReturnType<typeof useGlobalAIStore.getState>['selectConfig'];
  setConfigEnabled: ReturnType<typeof useGlobalAIStore.getState>['setConfigEnabled'];
  buildSettingsDraft: (config: AIConfigEntry | null) => AISettingsDraft;
  findPresetByConfig: (provider: AIProviderType, baseURL: string) => ProviderPreset | null;
  customProviderPreset: ProviderPreset;
  providerTypeOptions: AIProviderTypeOption[];
  buildProviderKey: (provider: AIProviderType, baseURL: string) => string;
  mergeModelCandidates: (...groups: string[][]) => string[];
  buildProviderEndpointPreview: (provider: AIProviderType, baseURL: string) => string;
  getSuggestedBaseURL: (provider: AIProviderType, preset: ProviderPreset) => string;
  loadAIServiceModule: () => Promise<typeof import('../../modules/ai/core/AIService')>;
};

export const useAIChatSettingsState = ({
  aiConfigs,
  runtimeConfigIdOverride,
  selectedConfigId,
  addConfig,
  updateConfig,
  deleteConfig,
  selectConfig,
  setConfigEnabled,
  buildSettingsDraft,
  findPresetByConfig,
  customProviderPreset,
  providerTypeOptions,
  buildProviderKey,
  mergeModelCandidates,
  buildProviderEndpointPreview,
  getSuggestedBaseURL,
  loadAIServiceModule,
}: UseAIChatSettingsStateInput) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({});
  const [selectedSettingsConfigId, setSelectedSettingsConfigId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AISettingsDraft>(buildSettingsDraft(null));
  const [jsonImportText, setJsonImportText] = useState('');
  const [showJsonImport, setShowJsonImport] = useState(false);

  const filteredConfigs = useMemo(() => {
    const keyword = providerSearch.trim().toLowerCase();
    if (!keyword) {
      return aiConfigs;
    }

    return aiConfigs.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword)
        || item.provider.toLowerCase().includes(keyword)
        || item.baseURL.toLowerCase().includes(keyword)
        || item.model.toLowerCase().includes(keyword),
    );
  }, [aiConfigs, providerSearch]);

  const selectedRuntimeConfig = useMemo(
    () =>
      (runtimeConfigIdOverride ? aiConfigs.find((item) => item.id === runtimeConfigIdOverride) : null)
      || aiConfigs.find((item) => item.id === selectedConfigId)
      || null,
    [aiConfigs, runtimeConfigIdOverride, selectedConfigId],
  );

  const isRuntimeConfigured = Boolean(
    selectedRuntimeConfig && selectedRuntimeConfig.enabled && hasUsableAIConfigEntry(selectedRuntimeConfig),
  );

  const selectedSettingsConfig = useMemo(
    () => aiConfigs.find((item) => item.id === selectedSettingsConfigId) || aiConfigs[0] || null,
    [aiConfigs, selectedSettingsConfigId],
  );

  const selectedSettingsPreset = useMemo(
    () => findPresetByConfig(settingsDraft.provider, settingsDraft.baseURL) || customProviderPreset,
    [customProviderPreset, findPresetByConfig, settingsDraft.baseURL, settingsDraft.provider],
  );

  const selectedProviderTypeOption = useMemo(
    () => providerTypeOptions.find((item) => item.value === settingsDraft.provider) || providerTypeOptions[0],
    [providerTypeOptions, settingsDraft.provider],
  );

  const syncModelCatalog = useCallback((nextProvider: AIProviderType, nextBaseURL: string, models: string[]) => {
    const key = buildProviderKey(nextProvider, nextBaseURL);
    setModelCatalog((current) => {
      const merged = mergeModelCandidates(current[key] || [], models);
      const previous = current[key] || [];
      if (merged.length === previous.length && merged.every((item, index) => item === previous[index])) {
        return current;
      }

      return {
        ...current,
        [key]: merged,
      };
    });
  }, [buildProviderKey, mergeModelCandidates]);

  useEffect(() => {
    if (!selectedRuntimeConfig) {
      return;
    }

    const matched = findPresetByConfig(selectedRuntimeConfig.provider, selectedRuntimeConfig.baseURL) || customProviderPreset;
    syncModelCatalog(
      selectedRuntimeConfig.provider,
      selectedRuntimeConfig.baseURL,
      [...matched.models, selectedRuntimeConfig.model],
    );
  }, [customProviderPreset, findPresetByConfig, selectedRuntimeConfig, syncModelCatalog]);

  useEffect(() => {
    if (selectedSettingsConfigId && !aiConfigs.some((item) => item.id === selectedSettingsConfigId)) {
      setSelectedSettingsConfigId(aiConfigs[0]?.id || null);
      return;
    }

    if (!selectedSettingsConfigId && aiConfigs[0]?.id) {
      setSelectedSettingsConfigId(aiConfigs[0].id);
    }
  }, [aiConfigs, selectedSettingsConfigId]);

  useEffect(() => {
    setSettingsDraft(buildSettingsDraft(selectedSettingsConfig));
  }, [buildSettingsDraft, selectedSettingsConfig]);

  const settingsModelOptions = useMemo(
    () =>
      mergeModelCandidates(
        selectedSettingsPreset.models,
        modelCatalog[buildProviderKey(settingsDraft.provider, settingsDraft.baseURL)] || [],
        [settingsDraft.model],
      ),
    [
      buildProviderKey,
      mergeModelCandidates,
      modelCatalog,
      selectedSettingsPreset.models,
      settingsDraft.baseURL,
      settingsDraft.model,
      settingsDraft.provider,
    ],
  );

  const selectedProviderListMode = useMemo(
    () => listModelsSupportMode(settingsDraft.provider),
    [settingsDraft.provider],
  );

  const selectedProviderEndpoint = useMemo(
    () => buildProviderEndpointPreview(settingsDraft.provider, settingsDraft.baseURL),
    [buildProviderEndpointPreview, settingsDraft.baseURL, settingsDraft.provider],
  );

  const isSettingsDraftComplete = hasUsableAIConfigEntry(settingsDraft);
  const isSettingsDraftSelected = settingsDraft.id === selectedConfigId;
  const customHeadersJsonValid = !settingsDraft.customHeaders.trim()
    || (() => {
      try {
        JSON.parse(settingsDraft.customHeaders);
        return true;
      } catch {
        return false;
      }
    })();

  const handleTestConnection = useCallback(async () => {
    setTestState('testing');
    setTestMessage('');

    const { aiService } = await loadAIServiceModule();
    const result = await aiService.testConnection(settingsDraft);
    setTestState(result.ok ? 'success' : 'error');
    setTestMessage(result.message);
  }, [loadAIServiceModule, settingsDraft]);

  const handleLoadModels = useCallback(async () => {
    setIsLoadingModels(true);
    setTestState('idle');
    setTestMessage('');

    try {
      if (selectedProviderListMode === 'preset-only') {
        const fallbackModels = mergeModelCandidates(selectedSettingsPreset.models, [settingsDraft.model]);
        syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, fallbackModels);
        setTestState('success');
        setTestMessage('当前 provider 不支持远程拉取模型列表，已回退到内置模型候选。');
        return;
      }

      const { aiService } = await loadAIServiceModule();
      const list = await aiService.listModels(settingsDraft);
      syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, list);
      setSettingsDraft((current) => ({
        ...current,
        model: current.model.trim() && list.includes(current.model) ? current.model : list[0] || current.model,
      }));
      setTestState('success');
      setTestMessage(`已加载 ${list.length} 个模型。`);
    } catch (error) {
      setTestState('error');
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingModels(false);
    }
  }, [
    loadAIServiceModule,
    mergeModelCandidates,
    selectedProviderListMode,
    selectedSettingsPreset.models,
    settingsDraft,
    syncModelCatalog,
  ]);

  const handleApplySettings = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    updateConfig(settingsDraft.id, {
      name: settingsDraft.name.trim() || '未命名 AI',
      provider: settingsDraft.provider,
      apiKey: settingsDraft.apiKey,
      baseURL: settingsDraft.baseURL,
      model: settingsDraft.model,
      contextWindowTokens: settingsDraft.contextWindowTokens,
      customHeaders: settingsDraft.customHeaders,
    });
    syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, settingsModelOptions);
    setTestState('success');
    setTestMessage(`已保存 ${settingsDraft.name.trim() || '当前 AI 配置'}。`);
  }, [settingsDraft, settingsModelOptions, syncModelCatalog, updateConfig]);

  const handleToggleEnabled = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    if (!settingsDraft.enabled && !isSettingsDraftComplete) {
      setTestState('error');
      setTestMessage('请先补全 API Key 和模型，再启用该 AI。');
      return;
    }

    if (!settingsDraft.enabled) {
      updateConfig(settingsDraft.id, {
        name: settingsDraft.name.trim() || '未命名 AI',
        provider: settingsDraft.provider,
        apiKey: settingsDraft.apiKey,
        baseURL: settingsDraft.baseURL,
        model: settingsDraft.model,
        contextWindowTokens: settingsDraft.contextWindowTokens,
        customHeaders: settingsDraft.customHeaders,
      });
    }

    const changed = setConfigEnabled(settingsDraft.id, !settingsDraft.enabled);
    if (!changed) {
      setTestState('error');
      setTestMessage('当前配置还不完整，不能启用。');
      return;
    }

    setTestState('success');
    setTestMessage(!settingsDraft.enabled ? '已启用当前 AI。' : '已关闭当前 AI。');
  }, [isSettingsDraftComplete, setConfigEnabled, settingsDraft, updateConfig]);

  const handleCreateConfig = useCallback(() => {
    const nextId = addConfig({
      name: `AI 配置 ${aiConfigs.length + 1}`,
      provider: settingsDraft.provider,
      baseURL: settingsDraft.baseURL || getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset),
      model: settingsDraft.model,
      contextWindowTokens: settingsDraft.contextWindowTokens,
    });
    setSelectedSettingsConfigId(nextId);
    setTestState('idle');
    setTestMessage('');
  }, [addConfig, aiConfigs.length, getSuggestedBaseURL, selectedSettingsPreset, settingsDraft]);

  const handleDeleteConfig = useCallback(() => {
    if (!settingsDraft.id || aiConfigs.length <= 1) {
      setTestState('error');
      setTestMessage(aiConfigs.length <= 1 ? '至少保留一个 AI 配置。' : '');
      return;
    }

    deleteConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage('已删除当前 AI 配置。');
  }, [aiConfigs.length, deleteConfig, settingsDraft.id]);

  const handleSelectConfig = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    selectConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage(`已切换到 "${settingsDraft.name || '当前 AI 配置'}"。`);
  }, [selectConfig, settingsDraft.id, settingsDraft.name]);

  const handleExportConfigs = useCallback(async () => {
    try {
      const exportData = {
        version: 2,
        configs: aiConfigs.map(({ id, ...rest }) => rest),
      };
      const json = JSON.stringify(exportData, null, 2);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(json);
      } else {
        throw new Error('剪贴板不可用');
      }
      setTestState('success');
      setTestMessage('已复制 JSON 到剪贴板。');
    } catch {
      setTestState('error');
      setTestMessage('导出失败：无法访问剪贴板。');
    }
  }, [aiConfigs]);

  const handleImportConfigs = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonImportText);
      const importEntries = Array.isArray(parsed) ? parsed : parsed.configs;
      if (!Array.isArray(importEntries) || importEntries.length === 0) {
        setTestState('error');
        setTestMessage('JSON 格式无效：缺少 configs 数组。');
        return;
      }

      let importedCount = 0;
      for (const entry of importEntries) {
        if (entry.provider && entry.apiKey) {
          addConfig({
            name: entry.name || `导入 ${entry.provider}`,
            provider: entry.provider,
            apiKey: entry.apiKey,
            baseURL: entry.baseURL,
            model: entry.model,
            contextWindowTokens: entry.contextWindowTokens,
            customHeaders: entry.customHeaders || '',
            enabled: false,
          });
          importedCount++;
        }
      }

      setShowJsonImport(false);
      setJsonImportText('');
      setTestState('success');
      setTestMessage(`成功导入 ${importedCount} 个 AI 配置。`);
    } catch (error) {
      console.warn('AI config import failed:', error);
      setTestState('error');
      setTestMessage('JSON 格式无效，请检查后重试。');
    }
  }, [addConfig, jsonImportText]);

  const resetSettingsTransientUi = useCallback(() => {
    setShowApiKey(false);
    setShowJsonImport(false);
    setJsonImportText('');
  }, []);

  return {
    filteredConfigs,
    selectedRuntimeConfig,
    isRuntimeConfigured,
    selectedSettingsConfig,
    selectedSettingsPreset,
    selectedProviderTypeOption,
    settingsModelOptions,
    selectedProviderListMode,
    selectedProviderEndpoint,
    isSettingsDraftComplete,
    isSettingsDraftSelected,
    customHeadersJsonValid,
    showApiKey,
    setShowApiKey,
    providerSearch,
    setProviderSearch,
    testState,
    setTestState,
    testMessage,
    setTestMessage,
    isLoadingModels,
    selectedSettingsConfigId,
    setSelectedSettingsConfigId,
    settingsDraft,
    setSettingsDraft,
    jsonImportText,
    setJsonImportText,
    showJsonImport,
    setShowJsonImport,
    handleTestConnection,
    handleLoadModels,
    handleApplySettings,
    handleToggleEnabled,
    handleCreateConfig,
    handleDeleteConfig,
    handleSelectConfig,
    handleExportConfigs,
    handleImportConfigs,
    resetSettingsTransientUi,
  };
};
