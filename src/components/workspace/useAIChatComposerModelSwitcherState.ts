import { useCallback, useMemo } from 'react';
import type { ProviderPreset } from '../../modules/ai/providerPresets';
import { hasUsableAIConfigEntry, type AIConfigEntry, type AIProviderType } from '../../modules/ai/store/aiConfigState';

type ModelCatalog = Record<string, string[]>;

type UseAIChatComposerModelSwitcherStateInput = {
  aiConfigs: AIConfigEntry[];
  modelCatalog: ModelCatalog;
  selectedConfigId: string | null;
  runtimeConfigIdOverride: string | null;
  selectConfig: (configId: string | null) => void;
  updateConfig: (configId: string, updates: Partial<Omit<AIConfigEntry, 'id'>>) => void;
  findPresetByConfig: (provider: AIProviderType, baseURL: string) => ProviderPreset | null;
  buildProviderKey: (provider: AIProviderType, baseURL: string) => string;
  mergeModelCandidates: (...groups: string[][]) => string[];
};

export const useAIChatComposerModelSwitcherState = ({
  aiConfigs,
  modelCatalog,
  selectedConfigId,
  runtimeConfigIdOverride,
  selectConfig,
  updateConfig,
  findPresetByConfig,
  buildProviderKey,
  mergeModelCandidates,
}: UseAIChatComposerModelSwitcherStateInput) => {
  const enabledRuntimeConfigs = useMemo(
    () => aiConfigs.filter((item) => item.enabled && hasUsableAIConfigEntry(item)),
    [aiConfigs],
  );

  const activeRuntimeConfig = useMemo(
    () =>
      (runtimeConfigIdOverride ? aiConfigs.find((item) => item.id === runtimeConfigIdOverride) : null)
      || enabledRuntimeConfigs.find((item) => item.id === selectedConfigId)
      || enabledRuntimeConfigs[0]
      || null,
    [aiConfigs, enabledRuntimeConfigs, runtimeConfigIdOverride, selectedConfigId],
  );

  const isRuntimeConfigLocked = Boolean(runtimeConfigIdOverride);

  const runtimeModelOptions = useMemo(() => {
    if (!activeRuntimeConfig) {
      return [];
    }

    const preset = findPresetByConfig(activeRuntimeConfig.provider, activeRuntimeConfig.baseURL);
    return mergeModelCandidates(
      preset?.models || [],
      activeRuntimeConfig.savedModels,
      modelCatalog[buildProviderKey(activeRuntimeConfig.provider, activeRuntimeConfig.baseURL)] || [],
      [activeRuntimeConfig.model],
    );
  }, [activeRuntimeConfig, buildProviderKey, findPresetByConfig, mergeModelCandidates, modelCatalog]);

  const handleSelectRuntimeConfig = useCallback((configId: string) => {
    if (!isRuntimeConfigLocked) {
      selectConfig(configId);
    }
  }, [isRuntimeConfigLocked, selectConfig]);

  const handleSelectRuntimeModel = useCallback((model: string) => {
    if (!activeRuntimeConfig) {
      return;
    }

    const normalizedModel = model.trim();
    if (!normalizedModel) {
      return;
    }

    updateConfig(activeRuntimeConfig.id, {
      model: normalizedModel,
      savedModels: mergeModelCandidates(activeRuntimeConfig.savedModels, [normalizedModel]),
    });
  }, [activeRuntimeConfig, mergeModelCandidates, updateConfig]);

  return {
    enabledRuntimeConfigs,
    activeRuntimeConfig,
    runtimeModelOptions,
    isRuntimeConfigLocked,
    handleSelectRuntimeConfig,
    handleSelectRuntimeModel,
  };
};
