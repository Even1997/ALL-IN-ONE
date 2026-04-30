import { aiService } from '../../../core/AIService';
import type { AITextStreamEvent } from '../../../core/AIService';
import type { AIConfigEntry } from '../../../store/aiConfigState';
import { toRuntimeAIConfig } from '../../../store/aiConfigState';
import type { GNAgentRuntimeContext, GNAgentRuntimeStatus } from '../types';

export class CodexRuntime {
  readonly providerId = 'codex' as const;

  getMatchingConfigs(configs: AIConfigEntry[]) {
    return configs.filter((config) => config.provider === 'openai-compatible');
  }

  resolvePreferredConfig(configs: AIConfigEntry[]) {
    const enabled = this.getMatchingConfigs(configs).find(
      (config) => config.enabled && config.apiKey.trim() && config.model.trim()
    );
    return enabled || this.getMatchingConfigs(configs)[0] || null;
  }

  async executePrompt(options: {
    sessionId: string;
    config: AIConfigEntry;
    systemPrompt?: string;
    prompt: string;
    onChunk?: (text: string) => void;
    onEvent?: (event: AITextStreamEvent) => void;
  }) {
    const { config, systemPrompt = '', prompt, onChunk, onEvent } = options;
    if (config.provider !== 'openai-compatible') {
      throw new Error('Codex runtime requires an OpenAI Compatible config.');
    }

    const previousConfig = aiService.getConfig();
    aiService.setConfig(toRuntimeAIConfig(config));
    try {
      return await aiService.completeText({
        systemPrompt,
        prompt,
        onChunk,
        onEvent,
      });
    } finally {
      aiService.setConfig(previousConfig);
    }
  }

  getStatus(context: GNAgentRuntimeContext): GNAgentRuntimeStatus {
    const { selectedConfig, localSnapshot } = context;
    const hasOpenAICompatibleConfig = Boolean(
      selectedConfig &&
        selectedConfig.provider === 'openai-compatible' &&
        selectedConfig.enabled &&
        selectedConfig.apiKey.trim() &&
        selectedConfig.model.trim()
    );
    const hasCodexHome = Boolean(localSnapshot?.codexHome.exists);

    if (hasOpenAICompatibleConfig && hasCodexHome) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'mixed',
        summary: 'Codex runtime is ready.',
        details: [
          `Current config: ${selectedConfig?.name || 'unknown'}`,
          `Model: ${selectedConfig?.model || 'unknown'}`,
          'Detected local .codex directory',
        ],
      };
    }

    if (hasOpenAICompatibleConfig) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'app-config',
        summary: 'Codex runtime will use the current OpenAI Compatible app config.',
        details: [
          `Current config: ${selectedConfig?.name || 'unknown'}`,
          `Model: ${selectedConfig?.model || 'unknown'}`,
        ],
      };
    }

    if (hasCodexHome) {
      return {
        providerId: this.providerId,
        ready: false,
        source: 'local-config',
        summary: 'Codex runtime found local .codex settings but no runnable OpenAI Compatible config.',
        details: [
          localSnapshot?.codexHome.path || '.codex',
          'Bind a usable OpenAI Compatible config first, otherwise the app will fall back to built-in AI.',
        ],
      };
    }

    return {
      providerId: this.providerId,
      ready: false,
      source: 'missing',
      summary: 'Codex runtime has no usable configuration yet.',
      details: ['Missing OpenAI Compatible config and no local .codex directory was found.'],
    };
  }
}

