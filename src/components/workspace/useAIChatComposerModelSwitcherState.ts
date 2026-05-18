// 文件作用：状态或行为封装 Hook，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { useCallback, useMemo } from 'react';
import type { ProviderPreset } from '../../modules/ai/providerPresets';
import { hasUsableAIConfigEntry, type AIConfigEntry, type AIProviderType } from '../../modules/ai/store/aiConfigState';

type ModelCatalog = Record<string, string[]>;

type UseAIChatComposerModelSwitcherStateInput = {
  aiConfigs: AIConfigEntry[];
  modelCatalog: ModelCatalog;
  selectedConfigId: string | null;
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
      enabledRuntimeConfigs.find((item) => item.id === selectedConfigId)
      || enabledRuntimeConfigs[0]
      || null,
    [enabledRuntimeConfigs, selectedConfigId],
  );

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
    selectConfig(configId);
  }, [selectConfig]);

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
    handleSelectRuntimeConfig,
    handleSelectRuntimeModel,
  };
};
