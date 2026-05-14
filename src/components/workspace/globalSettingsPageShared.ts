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
  | 'ai'
  | 'permissions'
  | 'general'
  | 'adapters'
  | 'terminal'
  | 'skills'
  | 'mcp'
  | 'agents'
  | 'plugins'
  | 'computerUse'
  | 'diagnostics'
  | 'about';

export const SETTINGS_TABS: Array<{
  id: SettingsTabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'ai',
    label: 'AI',
    eyebrow: 'Model Settings',
    title: 'AI 设置',
    description: '管理当前聊天使用的模型配置与 Provider。',
  },
  {
    id: 'permissions',
    label: '权限',
    eyebrow: 'Permissions',
    title: '权限设置',
    description: '管理审批、sandbox 和自动执行边界。',
  },
  {
    id: 'general',
    label: '通用',
    eyebrow: 'General',
    title: '通用设置',
    description: '管理 Agent 工作台的默认行为与显示偏好。',
  },
  {
    id: 'adapters',
    label: '适配器',
    eyebrow: 'Adapters',
    title: '适配器设置',
    description: '管理本地模型、外部 CLI 与运行时桥接能力。',
  },
  {
    id: 'terminal',
    label: '终端',
    eyebrow: 'Terminal',
    title: '终端设置',
    description: '管理 shell、工作目录和命令执行偏好。',
  },
  {
    id: 'skills',
    label: '技能',
    eyebrow: 'Skills Library',
    title: '技能设置',
    description: '统一管理技能导入、查看与删除，不再放在 Agent 里单独维护。',
  },
  {
    id: 'mcp',
    label: 'MCP',
    eyebrow: 'Runtime MCP',
    title: 'MCP 设置',
    description: '统一管理 MCP server 的查看、编辑、启停与运行记录。',
  },
  {
    id: 'agents',
    label: 'Agents',
    eyebrow: 'Agents',
    title: 'Agents 设置',
    description: '管理本地 Agent、团队执行与默认分工。',
  },
  {
    id: 'plugins',
    label: '插件',
    eyebrow: 'Plugins',
    title: '插件设置',
    description: '管理扩展入口与未来插件能力。',
  },
  {
    id: 'computerUse',
    label: 'Computer Use',
    eyebrow: 'Computer Use',
    title: 'Computer Use 设置',
    description: '管理桌面自动化与可视操作能力。',
  },
  {
    id: 'diagnostics',
    label: '诊断',
    eyebrow: 'Diagnostics',
    title: '诊断信息',
    description: '查看运行时状态、连接情况与故障排查信息。',
  },
  {
    id: 'about',
    label: '关于',
    eyebrow: 'About',
    title: '关于 GoodNight Agent',
    description: '查看版本、能力边界与本地运行说明。',
  },
];

const SETTINGS_TAB_IDS = new Set<SettingsTabId>(SETTINGS_TABS.map((tab) => tab.id));

export const resolveSettingsTabId = (tab: string | null | undefined): SettingsTabId =>
  tab && SETTINGS_TAB_IDS.has(tab as SettingsTabId) ? (tab as SettingsTabId) : SETTINGS_TABS[0].id;

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
  note: '用于接入未内置的平台。你可以自行切换 API 类型、Base URL、模型和自定义请求头。',
};

const SETTINGS_PROVIDER_PRESETS = [...PROVIDER_PRESETS, CUSTOM_PROVIDER_PRESET];

export const AI_PROVIDER_TYPE_OPTIONS: AIProviderTypeOption[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible',
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
  provider === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible';

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
  savedModels: config?.savedModels || (config?.model ? [config.model] : (PROVIDER_PRESETS[0]?.models[0] ? [PROVIDER_PRESETS[0].models[0]] : [])),
  contextWindowTokens: config?.contextWindowTokens || 258000,
  customHeaders: config?.customHeaders || '',
  enabled: config?.enabled || false,
});
