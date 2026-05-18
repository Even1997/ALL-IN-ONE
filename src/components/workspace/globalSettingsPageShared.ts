// 文件作用：沉淀全局设置页共享的 AI 配置元数据、草稿构建和协议预览逻辑。
// 所在链路：设置页 UI -> 配置草稿 -> provider protocol adapters。
// 排查入口：先看 AI_PROTOCOL_OPTIONS 和 buildProviderEndpointPreview，再看 buildSettingsDraft。

import type { AIProviderType } from '../../modules/ai/core/AIService';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import {
  normalizeAIProtocol,
  type AIConfigEntry,
  type AIProtocolType,
} from '../../modules/ai/store/aiConfigState';

export type AISettingsDraft = {
  id: string | null;
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

export type AIProviderTypeOption = {
  value: AIProviderType;
  label: string;
  description: string;
};

export type AIProtocolOption = {
  value: AIProtocolType;
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
  { id: 'general', label: '甯歌', eyebrow: '鍩虹', title: '甯歌璁剧疆', description: '璇█銆佸惎鍔ㄤ笌鐗堟湰淇℃伅銆?' },
  { id: 'ai', label: 'AI', eyebrow: '妯″瀷涓庢湇鍔?', title: 'AI 璁剧疆', description: '绠＄悊妯″瀷閰嶇疆銆佹湇鍔″晢涓庤繛鎺ユ祴璇曘€?' },
  { id: 'permissions', label: '鏉冮檺', eyebrow: '杩愯杈圭晫', title: '鏉冮檺璁剧疆', description: '瀹℃壒妯″紡銆佹矙绠变笌鎭㈠绛栫暐銆?' },
  { id: 'mcp', label: 'MCP', eyebrow: '宸ュ叿鎺ュ叆', title: 'MCP 璁剧疆', description: '绠＄悊 MCP 鏈嶅姟涓庢渶杩戣皟鐢ㄣ€?' },
  { id: 'skills', label: '鎶€鑳?', eyebrow: '鎶€鑳藉簱', title: '鎶€鑳借缃?', description: '绠＄悊绯荤粺鎶€鑳姐€佷釜浜烘妧鑳藉拰瀵煎叆鏉ユ簮銆?' },
  { id: 'appearance', label: '澶栬', eyebrow: '鏄剧ず涓庨槄璇?', title: '澶栬璁剧疆', description: '涓婚銆佸瘑搴﹀拰杩囩▼鏄剧ず銆?' },
  { id: 'storage', label: '瀛樺偍', eyebrow: '椤圭洰鐩綍', title: '瀛樺偍璁剧疆', description: '椤圭洰鏍圭洰褰曘€佺储寮曚笌璺緞璇婃柇銆?' },
  { id: 'advanced', label: '楂樼骇', eyebrow: '杩愯涓庣粦瀹?', title: '楂樼骇璁剧疆', description: '杩愯妯″紡銆佹湇鍔＄粦瀹氫笌璇婃柇銆?' },
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
  label: '鑷畾涔?Provider',
  type: 'openai-compatible',
  baseURL: '',
  docsUrl: 'https://platform.openai.com/docs/api-reference',
  iconText: 'CU',
  accent: 'gray',
  enabled: true,
  models: [],
  keyHint: '濉啓浣犵殑骞冲彴 API Key',
  note: '鐢ㄤ簬鎺ュ叆鏈唴缃殑骞冲彴锛屽彲鑷閰嶇疆鍗忚銆丅ase URL銆佹ā鍨嬪拰璇锋眰澶淬€?',
};

const SETTINGS_PROVIDER_PRESETS = [...PROVIDER_PRESETS, CUSTOM_PROVIDER_PRESET];

export const AI_PROVIDER_TYPE_OPTIONS: AIProviderTypeOption[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI 鍏煎',
    description: '閫傜敤浜?OpenAI銆丱penRouter銆丏eepSeek銆丱llama 绛夊吋瀹瑰钩鍙般€?',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: '閫傜敤浜?Claude 鍘熺敓 Messages 鍗忚銆?',
  },
];

export const AI_PROTOCOL_OPTIONS: AIProtocolOption[] = [
  {
    value: 'anthropic-messages',
    label: 'Anthropic Messages',
    description: '浣跨敤 `/messages` 鍗忚銆?',
  },
  {
    value: 'openai-chat-completions',
    label: 'OpenAI Chat Completions',
    description: '浣跨敤 `/chat/completions` 鍗忚銆?',
  },
  {
    value: 'openai-responses',
    label: 'OpenAI Responses API',
    description: '浣跨敤 `/responses` 鍗忚銆?',
  },
];

export const findPresetByConfig = (provider: AIProviderType, baseURL: string) =>
  SETTINGS_PROVIDER_PRESETS.find(
    (item) => item.id !== CUSTOM_PROVIDER_PRESET.id && item.type === provider && item.baseURL === baseURL,
  ) || null;

export const providerTypeLabel = (provider: AIProviderType) =>
  provider === 'anthropic' ? 'Anthropic' : 'OpenAI 鍏煎';

const normalizeProviderBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, '');

export const buildProviderEndpointPreview = (
  provider: AIProviderType,
  baseURL: string,
  protocol?: AIProtocolType,
) => {
  const normalizedBaseURL = normalizeProviderBaseURL(baseURL);
  const resolvedProtocol = normalizeAIProtocol(provider, protocol);

  if (resolvedProtocol === 'anthropic-messages') {
    return `${normalizedBaseURL}/messages`;
  }

  if (resolvedProtocol === 'openai-responses') {
    return `${normalizedBaseURL}/responses`;
  }

  return `${normalizedBaseURL}/chat/completions`;
};

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
  protocol: normalizeAIProtocol(config?.provider || 'openai-compatible', config?.protocol),
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
