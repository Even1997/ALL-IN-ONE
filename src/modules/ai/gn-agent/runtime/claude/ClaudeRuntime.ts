import { aiService } from '../../../core/AIService';
import type { AITextStreamEvent } from '../../../core/AIService';
import type { AIConfigEntry } from '../../../store/aiConfigState';
import { toRuntimeAIConfig } from '../../../store/aiConfigState';
import type { GNAgentRuntimeContext, GNAgentRuntimeStatus } from '../types';

export class ClaudeRuntime {
  readonly providerId = 'claude' as const;

  getMatchingConfigs(configs: AIConfigEntry[]) {
    return configs.filter((config) => config.provider === 'anthropic');
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
    if (config.provider !== 'anthropic') {
      throw new Error('Claude runtime requires an Anthropic config.');
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
    const hasAnthropicConfig = Boolean(
      selectedConfig &&
        selectedConfig.provider === 'anthropic' &&
        selectedConfig.enabled &&
        selectedConfig.apiKey.trim() &&
        selectedConfig.model.trim()
    );
    const hasClaudeSettings = Boolean(localSnapshot?.claudeSettings.exists);

    if (hasAnthropicConfig && hasClaudeSettings) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'mixed',
        summary: 'Claude runtime is ready.',
        details: [
          `Current config: ${selectedConfig?.name || 'unknown'}`,
          `Model: ${selectedConfig?.model || 'unknown'}`,
          'Detected local .claude/settings.json',
        ],
      };
    }

    if (hasAnthropicConfig) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'app-config',
        summary: 'Claude runtime will use the current Anthropic app config.',
        details: [
          `Current config: ${selectedConfig?.name || 'unknown'}`,
          `Model: ${selectedConfig?.model || 'unknown'}`,
        ],
      };
    }

    if (hasClaudeSettings) {
      return {
        providerId: this.providerId,
        ready: false,
        source: 'local-config',
        summary: 'Claude runtime found local .claude settings but no runnable Anthropic config.',
        details: [
          localSnapshot?.claudeSettings.path || '.claude/settings.json',
          'Bind a usable Anthropic config first, otherwise the app will fall back to built-in AI.',
        ],
      };
    }

    return {
      providerId: this.providerId,
      ready: false,
      source: 'missing',
      summary: 'Claude runtime has no usable configuration yet.',
      details: ['Missing Anthropic config and no local .claude/settings.json was found.'],
    };
  }
}

