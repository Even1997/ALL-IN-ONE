import { aiService } from '../../../core/AIService';
import type { AITextStreamEvent } from '../../../core/AIService';
import type { AIConfigEntry } from '../../../store/aiConfigState';
import { toRuntimeAIConfig } from '../../../store/aiConfigState';
import type { ClaudianRuntimeContext, ClaudianRuntimeStatus } from '../types';

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

  getStatus(context: ClaudianRuntimeContext): ClaudianRuntimeStatus {
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
        summary: 'Claude runtime 已具备运行条件',
        details: [
          `当前选择配置：${selectedConfig?.name || 'unknown'}`,
          `模型：${selectedConfig?.model || 'unknown'}`,
          '检测到本地 .claude/settings.json',
        ],
      };
    }

    if (hasAnthropicConfig) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'app-config',
        summary: 'Claude runtime 将使用当前应用内 Anthropic 配置',
        details: [
          `当前选择配置：${selectedConfig?.name || 'unknown'}`,
          `模型：${selectedConfig?.model || 'unknown'}`,
        ],
      };
    }

    if (hasClaudeSettings) {
      return {
        providerId: this.providerId,
        ready: false,
        source: 'local-config',
        summary: 'Claude runtime 检测到本地 .claude，但还缺少可执行的 Anthropic 配置',
        details: [
          localSnapshot?.claudeSettings.path || '.claude/settings.json',
          '请先绑定一个可用的 Anthropic 配置，否则会回退到内置 AI',
        ],
      };
    }

    return {
      providerId: this.providerId,
      ready: false,
      source: 'missing',
      summary: 'Claude runtime 还没有可用配置',
      details: ['缺少 Anthropic 配置，并且未发现本地 .claude/settings.json'],
    };
  }
}
