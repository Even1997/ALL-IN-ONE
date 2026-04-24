import type { AIProviderType } from './core/AIService';

export type ProviderPreset = {
  id: string;
  label: string;
  type: AIProviderType;
  baseURL: string;
  docsUrl: string;
  iconText: string;
  accent: string;
  enabled: boolean;
  models: string[];
  keyHint: string;
  note: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'minimax',
    label: 'MiniMax',
    type: 'openai-compatible',
    baseURL: 'https://api.minimax.chat/v1',
    docsUrl: 'https://platform.minimaxi.com/document',
    iconText: 'MM',
    accent: 'coral',
    enabled: false,
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    keyHint: 'sk-...',
    note: '适合国内第三方 API 接入，可按 OpenAI-compatible 模式配置。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    type: 'openai-compatible',
    baseURL: 'https://api.siliconflow.cn/v1',
    docsUrl: 'https://docs.siliconflow.cn/',
    iconText: 'SF',
    accent: 'violet',
    enabled: false,
    models: ['Qwen/Qwen3-Coder-480B-A35B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    keyHint: 'sk-...',
    note: '聚合模型平台，适合统一接入多家推理模型。',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    type: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/docs',
    iconText: 'OR',
    accent: 'blue',
    enabled: false,
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro'],
    keyHint: 'sk-or-...',
    note: '推荐作为第三方主入口，模型覆盖最广。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    type: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    docsUrl: 'https://platform.deepseek.com/',
    iconText: 'DS',
    accent: 'indigo',
    enabled: false,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    note: '推理和代码类模型适合开发辅助。',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    type: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    docsUrl: 'https://docs.anthropic.com/',
    iconText: 'AI',
    accent: 'mono',
    enabled: false,
    models: ['claude-sonnet-4-5', 'claude-opus-4-1'],
    keyHint: 'sk-ant-...',
    note: '原生 Anthropic provider，适合直连 Claude。',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs',
    iconText: 'OA',
    accent: 'dark',
    enabled: false,
    models: ['gpt-4o-mini', 'gpt-4.1-mini'],
    keyHint: 'sk-...',
    note: '官方 OpenAI 接口，也兼容当前 provider 层。',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    type: 'openai-compatible',
    baseURL: 'http://127.0.0.1:11434/v1',
    docsUrl: 'https://ollama.com/',
    iconText: 'OL',
    accent: 'gray',
    enabled: false,
    models: ['qwen2.5-coder:latest', 'deepseek-coder-v2:latest'],
    keyHint: '本地可留空',
    note: '适合本地模型部署，Base URL 指向本机 Ollama。',
  },
];
