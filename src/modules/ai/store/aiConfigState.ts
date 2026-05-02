import { PROVIDER_PRESETS, type ProviderPreset } from '../providerPresets.ts';

export type AIProviderType = 'openai-compatible' | 'anthropic';

type RuntimeAIConfig = {
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders?: string;
};

export type AIConfigEntry = {
  id: string;
  name: string;
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};

const createDefaultName = () => `AI 配置 ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;

export const createAIConfigEntry = (overrides: Partial<AIConfigEntry> = {}): AIConfigEntry => ({
  id: overrides.id || `ai-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: overrides.name?.trim() || createDefaultName(),
  provider: overrides.provider || 'openai-compatible',
  apiKey: overrides.apiKey || '',
  baseURL: overrides.baseURL || 'https://openrouter.ai/api/v1',
  model: overrides.model || 'gpt-4o-mini',
  contextWindowTokens: Math.max(1000, overrides.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS),
  customHeaders: overrides.customHeaders || '',
  enabled: overrides.enabled || false,
});

export const buildPresetAIConfigEntry = (preset: ProviderPreset): AIConfigEntry =>
  createAIConfigEntry({
    id: `preset-${preset.id}`,
    name: preset.label,
    provider: preset.type,
    baseURL: preset.baseURL,
    model: preset.models[0] || '',
    contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
    enabled: false,
  });

export const buildDefaultAIConfigEntries = () => PROVIDER_PRESETS.map(buildPresetAIConfigEntry);

export const mergePresetAIConfigEntries = (configs: AIConfigEntry[]) => {
  const normalizedConfigs = configs.map((item) => createAIConfigEntry(item));
  const existingIds = new Set(normalizedConfigs.map((item) => item.id));
  const missingPresets = buildDefaultAIConfigEntries().filter((item) => !existingIds.has(item.id));
  return [...normalizedConfigs, ...missingPresets];
};

export const hasUsableAIConfigEntry = (config: Pick<AIConfigEntry, 'provider' | 'apiKey' | 'model'>) =>
  Boolean(config.provider && config.apiKey.trim() && config.model.trim());

export const getEnabledAIConfigs = (configs: AIConfigEntry[]) =>
  configs.filter((item) => item.enabled && hasUsableAIConfigEntry(item));

export const resolveSelectedAIConfigId = (configs: AIConfigEntry[], previousSelectedId: string | null) => {
  const enabledConfigs = getEnabledAIConfigs(configs);
  if (enabledConfigs.length === 0) {
    return null;
  }

  if (previousSelectedId && enabledConfigs.some((item) => item.id === previousSelectedId)) {
    return previousSelectedId;
  }

  return enabledConfigs[0].id;
};

export const toRuntimeAIConfig = (config: AIConfigEntry): Partial<RuntimeAIConfig> => ({
  provider: config.provider,
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  model: config.model,
  contextWindowTokens: config.contextWindowTokens,
  customHeaders: config.customHeaders,
});
