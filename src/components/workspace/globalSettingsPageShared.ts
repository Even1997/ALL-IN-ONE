import type { AIProviderType } from '../../modules/ai/core/AIService';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import type { AIConfigEntry } from '../../modules/ai/store/aiConfigState';

export type AISettingsDraft = {
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

export type AIProviderTypeOption = {
  value: AIProviderType;
  label: string;
  description: string;
};

export type SettingsTabId =
  | 'general'
  | 'ai'
  | 'permissions'
  | 'mcp'
  | 'skills'
  | 'appearance'
  | 'storage'
  | 'advanced';

export type SettingsTabMeta = {
  id: SettingsTabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

export const SETTINGS_TABS: SettingsTabMeta[] = [
  {
    id: 'general',
    label: '常规',
    eyebrow: '基础',
    title: '常规设置',
    description: '语言、启动与版本信息。',
  },
  {
    id: 'ai',
    label: 'AI',
    eyebrow: '模型与服务',
    title: 'AI 设置',
    description: '管理模型配置、服务商与连接测试。',
  },
  {
    id: 'permissions',
    label: '权限',
    eyebrow: '运行边界',
    title: '权限设置',
    description: '审批模式、沙箱与恢复策略。',
  },
  {
    id: 'mcp',
    label: 'MCP',
    eyebrow: '工具接入',
    title: 'MCP 设置',
    description: '管理 MCP 服务与最近调用。',
  },
  {
    id: 'skills',
    label: '技能',
    eyebrow: '技能库',
    title: '技能设置',
    description: '管理系统技能、个人技能和导入来源。',
  },
  {
    id: 'appearance',
    label: '外观',
    eyebrow: '显示与阅读',
    title: '外观设置',
    description: '主题、密度和过程显示。',
  },
  {
    id: 'storage',
    label: '存储',
    eyebrow: '项目目录',
    title: '存储设置',
    description: '项目根目录、索引与路径诊断。',
  },
  {
    id: 'advanced',
    label: '高级',
    eyebrow: '运行与绑定',
    title: '高级设置',
    description: '运行模式、服务绑定与诊断。',
  },
];

const SETTINGS_TAB_IDS = new Set<SettingsTabId>(SETTINGS_TABS.map((tab) => tab.id));

const LEGACY_SETTINGS_TAB_ID_MAP: Record<string, SettingsTabId> = {
  about: 'general',
  adapters: 'advanced',
  terminal: 'advanced',
  agents: 'advanced',
  plugins: 'advanced',
  computerUse: 'advanced',
  diagnostics: 'advanced',
};

export const resolveSettingsTabId = (tab: string | null | undefined): SettingsTabId => {
  if (tab && SETTINGS_TAB_IDS.has(tab as SettingsTabId)) {
    return tab as SettingsTabId;
  }

  if (tab && LEGACY_SETTINGS_TAB_ID_MAP[tab]) {
    return LEGACY_SETTINGS_TAB_ID_MAP[tab];
  }

  return SETTINGS_TABS[0].id;
};

export const CUSTOM_PROVIDER_PRESET: ProviderPreset = {
  id: 'custom',
  label: '自定义 Provider',
  type: 'openai-compatible',
  baseURL: '',
  docsUrl: 'https://platform.openai.com/docs/api-reference',
  iconText: 'CU',
  accent: 'gray',
  enabled: true,
  models: [],
  keyHint: '填写你的平台 API Key',
  note: '用于接入未内置的平台，可自行配置接口类型、Base URL、模型和请求头。',
};

const SETTINGS_PROVIDER_PRESETS = [...PROVIDER_PRESETS, CUSTOM_PROVIDER_PRESET];

export const AI_PROVIDER_TYPE_OPTIONS: AIProviderTypeOption[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI 兼容',
    description: '适用于 OpenAI、OpenRouter、DeepSeek、Ollama 等兼容 chat/completions 的平台。',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: '适用于 Claude 原生 /messages 协议。',
  },
];

export const findPresetByConfig = (provider: AIProviderType, baseURL: string) =>
  SETTINGS_PROVIDER_PRESETS.find(
    (item) => item.id !== CUSTOM_PROVIDER_PRESET.id && item.type === provider && item.baseURL === baseURL,
  ) || null;

export const providerTypeLabel = (provider: AIProviderType) =>
  provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容';

export const buildProviderEndpointPreview = (provider: AIProviderType, baseURL: string) =>
  `${baseURL.replace(/\/+$/, '')}/${provider === 'anthropic' ? 'messages' : 'chat/completions'}`;

export const getSuggestedBaseURL = (provider: AIProviderType, preset: ProviderPreset) => {
  if (preset.baseURL.trim()) {
    return preset.baseURL;
  }

  return provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
};

export const buildProviderKey = (provider: AIProviderType, baseURL: string) =>
  `${provider}::${baseURL.trim().replace(/\/+$/, '')}`;

export const mergeModelCandidates = (...groups: string[][]) =>
  Array.from(
    new Set(
      groups
        .flat()
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

export const buildSettingsDraft = (config: AIConfigEntry | null): AISettingsDraft => ({
  id: config?.id || null,
  name: config?.name || '',
  provider: config?.provider || 'openai-compatible',
  apiKey: config?.apiKey || '',
  baseURL: config?.baseURL || PROVIDER_PRESETS[0]?.baseURL || '',
  model: config?.model || PROVIDER_PRESETS[0]?.models[0] || '',
  savedModels: config?.savedModels || (config?.model
    ? [config.model]
    : (PROVIDER_PRESETS[0]?.models[0] ? [PROVIDER_PRESETS[0].models[0]] : [])),
  contextWindowTokens: config?.contextWindowTokens || 258000,
  customHeaders: config?.customHeaders || '',
  enabled: config?.enabled || false,
});
