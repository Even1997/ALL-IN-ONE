// 文件作用：定义 AI 配置持久化模型，并把设置页配置投影到运行时配置。
// 所在链路：设置页 / store -> 运行时配置映射 -> provider protocol adapters。
// 排查入口：先看 protocol/provider 的归一化规则，再看 createAIConfigEntry 和 toRuntimeAIConfig。

import { PROVIDER_PRESETS, type ProviderPreset } from '../providerPresets.ts';

export type AIProviderType = 'openai-compatible' | 'anthropic';
export type AIProtocolType =
  | 'anthropic-messages'
  | 'openai-chat-completions'
  | 'openai-responses';

type RuntimeAIConfig = {
  provider: AIProviderType;
  protocol: AIProtocolType;
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
  protocol: AIProtocolType;
  apiKey: string;
  baseURL: string;
  model: string;
  savedModels: string[];
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};

const createDefaultName = () => `AI 闁板秶鐤?${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;

export const resolveDefaultAIProtocol = (provider: AIProviderType): AIProtocolType =>
  provider === 'anthropic' ? 'anthropic-messages' : 'openai-chat-completions';

// 中文导航：协议是显式字段，但仍要按 provider 做兜底归一化，避免导入旧配置或切换 provider 后留下非法组合。
export const normalizeAIProtocol = (
  provider: AIProviderType,
  protocol: AIProtocolType | null | undefined,
): AIProtocolType => {
  if (provider === 'anthropic') {
    return 'anthropic-messages';
  }

  if (protocol === 'openai-chat-completions' || protocol === 'openai-responses') {
    return protocol;
  }

  return 'openai-chat-completions';
};

export const normalizeSavedModels = (savedModels: string[] | undefined, model: string) => {
  const normalized = Array.from(
    new Set((savedModels || []).map((item) => item.trim()).filter(Boolean)),
  );
  const fallbackModel = model.trim();
  return normalized.length > 0 ? normalized : (fallbackModel ? [fallbackModel] : []);
};

export const resolveActiveModel = (model: string, savedModels: string[]) => {
  const normalizedModel = model.trim();
  return savedModels.includes(normalizedModel) ? normalizedModel : savedModels[0] || '';
};

export const createAIConfigEntry = (overrides: Partial<AIConfigEntry> = {}): AIConfigEntry => {
  const provider = overrides.provider || 'openai-compatible';
  const defaultModel = overrides.model || 'gpt-4o-mini';
  const savedModels = normalizeSavedModels(overrides.savedModels, defaultModel);
  return {
    id: overrides.id || `ai-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name?.trim() || createDefaultName(),
    provider,
    protocol: normalizeAIProtocol(provider, overrides.protocol),
    apiKey: overrides.apiKey || '',
    baseURL: overrides.baseURL || 'https://openrouter.ai/api/v1',
    model: resolveActiveModel(defaultModel, savedModels),
    savedModels,
    contextWindowTokens: Math.max(1000, overrides.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS),
    customHeaders: overrides.customHeaders || '',
    enabled: overrides.enabled || false,
  };
};

export const buildPresetAIConfigEntry = (preset: ProviderPreset): AIConfigEntry =>
  createAIConfigEntry({
    id: `preset-${preset.id}`,
    name: preset.label,
    provider: preset.type,
    protocol: resolveDefaultAIProtocol(preset.type),
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
  protocol: config.protocol,
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  model: config.model,
  contextWindowTokens: config.contextWindowTokens,
  customHeaders: config.customHeaders,
});
