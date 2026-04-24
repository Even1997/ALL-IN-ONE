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
