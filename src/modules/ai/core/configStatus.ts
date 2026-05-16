// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { AIProviderType } from './AIService';

export type AIConfigurationStatusInput = {
  provider: AIProviderType;
  apiKey: string;
  model: string;
};

export const hasUsableAIConfiguration = (input: AIConfigurationStatusInput) =>
  Boolean(input.apiKey.trim() && input.model.trim());

export const buildAIConfigurationError = () =>
  new Error('AI is not configured. Please open AI settings and add your provider, API key, and model.');

export const listModelsSupportMode = (provider: AIProviderType) =>
  provider === 'anthropic' ? 'preset-only' : 'remote-list';
