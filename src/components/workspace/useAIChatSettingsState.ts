import { useCallback, useEffect, useMemo, useState } from 'react';
import { listModelsSupportMode } from '../../modules/ai/core/configStatus';
import type { AIProviderType, aiService as sharedAIService } from '../../modules/ai/core/AIService';
import type { ProviderPreset } from '../../modules/ai/providerPresets';
import {
  hasUsableAIConfigEntry,
  normalizeSavedModels,
  resolveActiveModel,
  type AIConfigEntry,
} from '../../modules/ai/store/aiConfigState';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';

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
  aiServiceClient: typeof sharedAIService;
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
  aiServiceClient,
}: UseAIChatSettingsStateInput) => {
  const buildDraftValidSavedModels = useCallback(
    (savedModels: string[], model: string) => normalizeSavedModels(savedModels, model),
    [],
  );

  const resolveDraftActiveModel = useCallback(
    (model: string, savedModels: string[]) => resolveActiveModel(model, buildDraftValidSavedModels(savedModels, model)),
    [buildDraftValidSavedModels],
  );

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
      [...matched.models, ...selectedRuntimeConfig.savedModels, selectedRuntimeConfig.model],
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
        settingsDraft.savedModels,
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
      settingsDraft.savedModels,
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

      const result = await aiServiceClient.testConnection(settingsDraft);
    setTestState(result.ok ? 'success' : 'error');
    setTestMessage(result.message);
  }, [aiServiceClient, settingsDraft]);

  const handleLoadModels = useCallback(async () => {
    setIsLoadingModels(true);
    setTestState('idle');
    setTestMessage('');

    try {
      if (selectedProviderListMode === 'preset-only') {
        const fallbackModels = mergeModelCandidates(
          selectedSettingsPreset.models,
          settingsDraft.savedModels,
          [settingsDraft.model],
        );
        syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, fallbackModels);
        setTestState('success');
        setTestMessage('Provider uses preset model candidates only.');
        return;
      }

      const list = await aiServiceClient.listModels(settingsDraft);
      syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, list);
      setSettingsDraft((current) => ({
        ...current,
        model: resolveDraftActiveModel(
          current.model,
          mergeModelCandidates(current.savedModels, list, [current.model]),
        ),
      }));
      setTestState('success');
      setTestMessage(`Loaded ${list.length} models.`);
    } catch (error) {
      setTestState('error');
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingModels(false);
    }
  }, [
    aiServiceClient,
    mergeModelCandidates,
    resolveDraftActiveModel,
    selectedProviderListMode,
    selectedSettingsPreset.models,
    settingsDraft,
    syncModelCatalog,
  ]);

  const handleAddSavedModel = useCallback(() => {
    setSettingsDraft((current) => ({
      ...current,
      savedModels: [...current.savedModels, ''],
    }));
  }, []);

  const handleUpdateSavedModel = useCallback((index: number, value: string) => {
    setSettingsDraft((current) => {
      const previousValue = current.savedModels[index]?.trim() || '';
      const nextSavedModels = current.savedModels.map((item, itemIndex) => (
        itemIndex === index ? value : item
      ));
      const nextModel = current.model.trim() === previousValue
        ? resolveDraftActiveModel(value.trim() || current.model, nextSavedModels)
        : resolveDraftActiveModel(current.model, nextSavedModels);
      return {
        ...current,
        savedModels: nextSavedModels,
        model: nextModel,
      };
    });
  }, [resolveDraftActiveModel]);

  const handleRemoveSavedModel = useCallback((index: number) => {
    setSettingsDraft((current) => {
      const nextSavedModels = current.savedModels.filter((_, itemIndex) => itemIndex !== index);
      const nextModel = resolveDraftActiveModel(current.model, nextSavedModels);
      return {
        ...current,
        savedModels: nextSavedModels.length > 0 ? nextSavedModels : (nextModel ? [nextModel] : ['']),
        model: nextModel,
      };
    });
  }, [resolveDraftActiveModel]);

  const handleSelectActiveModel = useCallback((model: string) => {
    const normalizedModel = model.trim();
    if (!normalizedModel) {
      return;
    }

    setSettingsDraft((current) => ({
      ...current,
      model: normalizedModel,
      savedModels: current.savedModels.some((item) => item.trim() === normalizedModel)
        ? current.savedModels
        : [...current.savedModels, normalizedModel],
    }));
  }, []);

  const handleApplySettings = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    const normalizedSavedModels = buildDraftValidSavedModels(settingsDraft.savedModels, settingsDraft.model);
    const activeModel = resolveDraftActiveModel(settingsDraft.model, normalizedSavedModels);
    updateConfig(settingsDraft.id, {
      name: settingsDraft.name.trim() || 'Untitled AI',
      provider: settingsDraft.provider,
      apiKey: settingsDraft.apiKey,
      baseURL: settingsDraft.baseURL,
      model: activeModel,
      savedModels: normalizedSavedModels,
      contextWindowTokens: settingsDraft.contextWindowTokens,
      customHeaders: settingsDraft.customHeaders,
    });
    syncModelCatalog(
      settingsDraft.provider,
      settingsDraft.baseURL,
      mergeModelCandidates(settingsModelOptions, normalizedSavedModels, [activeModel]),
    );
    setTestState('success');
    setTestMessage(`Saved ${settingsDraft.name.trim() || 'current AI config'}.`);
  }, [
    buildDraftValidSavedModels,
    mergeModelCandidates,
    resolveDraftActiveModel,
    settingsDraft,
    settingsModelOptions,
    syncModelCatalog,
    updateConfig,
  ]);

  const handleToggleEnabled = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    if (!settingsDraft.enabled && !isSettingsDraftComplete) {
      setTestState('error');
      setTestMessage('Complete API key and model before enabling this AI config.');
      return;
    }

    if (!settingsDraft.enabled) {
      const normalizedSavedModels = buildDraftValidSavedModels(settingsDraft.savedModels, settingsDraft.model);
      const activeModel = resolveDraftActiveModel(settingsDraft.model, normalizedSavedModels);
      updateConfig(settingsDraft.id, {
        name: settingsDraft.name.trim() || 'Untitled AI',
        provider: settingsDraft.provider,
        apiKey: settingsDraft.apiKey,
        baseURL: settingsDraft.baseURL,
        model: activeModel,
        savedModels: normalizedSavedModels,
        contextWindowTokens: settingsDraft.contextWindowTokens,
        customHeaders: settingsDraft.customHeaders,
      });
    }

    const changed = setConfigEnabled(settingsDraft.id, !settingsDraft.enabled);
    if (!changed) {
      setTestState('error');
      setTestMessage('This config is still incomplete and cannot be enabled.');
      return;
    }

    setTestState('success');
    setTestMessage(!settingsDraft.enabled ? 'Enabled current AI config.' : 'Disabled current AI config.');
  }, [
    buildDraftValidSavedModels,
    isSettingsDraftComplete,
    resolveDraftActiveModel,
    setConfigEnabled,
    settingsDraft,
    updateConfig,
  ]);

  const handleCreateConfig = useCallback(() => {
    const nextId = addConfig({
      name: `AI 閰嶇疆 ${aiConfigs.length + 1}`,
      provider: settingsDraft.provider,
      baseURL: settingsDraft.baseURL || getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset),
      model: settingsDraft.model,
      savedModels: buildDraftValidSavedModels(settingsDraft.savedModels, settingsDraft.model),
      contextWindowTokens: settingsDraft.contextWindowTokens,
    });
    setSelectedSettingsConfigId(nextId);
    setTestState('idle');
    setTestMessage('');
  }, [
    addConfig,
    aiConfigs.length,
    buildDraftValidSavedModels,
    getSuggestedBaseURL,
    selectedSettingsPreset,
    settingsDraft,
  ]);

  const handleDeleteConfig = useCallback(() => {
    if (!settingsDraft.id || aiConfigs.length <= 1) {
      setTestState('error');
      setTestMessage(aiConfigs.length <= 1 ? 'Keep at least one AI config.' : '');
      return;
    }

    deleteConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage('Deleted current AI config.');
  }, [aiConfigs.length, deleteConfig, settingsDraft.id]);

  const handleSelectConfig = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    selectConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage(`Switched to "${settingsDraft.name || 'current AI config'}".`);
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
        throw new Error('Clipboard not available');
      }
      setTestState('success');
      setTestMessage('Copied AI config JSON to clipboard.');
    } catch {
      setTestState('error');
      setTestMessage('Export failed: clipboard unavailable.');
    }
  }, [aiConfigs]);

  const handleImportConfigs = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonImportText);
      const importEntries = Array.isArray(parsed) ? parsed : parsed.configs;
      if (!Array.isArray(importEntries) || importEntries.length === 0) {
        setTestState('error');
        setTestMessage('JSON is missing a configs array.');
        return;
      }

      let importedCount = 0;
      for (const entry of importEntries) {
        if (entry.provider && entry.apiKey) {
          addConfig({
            name: entry.name || `Imported ${entry.provider}`,
            provider: entry.provider,
            apiKey: entry.apiKey,
            baseURL: entry.baseURL,
            model: entry.model,
            savedModels: Array.isArray(entry.savedModels) ? entry.savedModels : undefined,
            contextWindowTokens: entry.contextWindowTokens,
            customHeaders: entry.customHeaders || '',
            enabled: false,
          });
          importedCount += 1;
        }
      }

      setShowJsonImport(false);
      setJsonImportText('');
      setTestState('success');
      setTestMessage(`Imported ${importedCount} AI configs.`);
    } catch (error) {
      console.warn('AI config import failed:', error);
      setTestState('error');
      setTestMessage('JSON format is invalid.');
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
    modelCatalog,
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
    resetSettingsTransientUi,
  };
};
