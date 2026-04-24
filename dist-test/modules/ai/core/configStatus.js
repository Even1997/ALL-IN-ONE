export const hasUsableAIConfiguration = (input) => Boolean(input.apiKey.trim() && input.model.trim());
export const buildAIConfigurationError = () => new Error('AI is not configured. Please open AI settings and add your provider, API key, and model.');
export const listModelsSupportMode = (provider) => provider === 'anthropic' ? 'preset-only' : 'remote-list';
