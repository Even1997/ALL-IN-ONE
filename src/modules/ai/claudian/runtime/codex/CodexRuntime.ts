import { aiService } from '../../../core/AIService';
import type { AIConfigEntry } from '../../../store/aiConfigState';
import { toRuntimeAIConfig } from '../../../store/aiConfigState';
import type { ClaudianRuntimeContext, ClaudianRuntimeStatus } from '../types';

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
  }) {
    const { config, systemPrompt = '', prompt, onChunk } = options;
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
      });
    } finally {
      aiService.setConfig(previousConfig);
    }
  }

  getStatus(context: ClaudianRuntimeContext): ClaudianRuntimeStatus {
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
        summary: 'Codex runtime 已具备运行条件',
        details: [
          `当前选择配置：${selectedConfig?.name || 'unknown'}`,
          `模型：${selectedConfig?.model || 'unknown'}`,
          '检测到本地 .codex 目录',
        ],
      };
    }

    if (hasOpenAICompatibleConfig) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'app-config',
        summary: 'Codex runtime 将使用当前应用内 OpenAI Compatible 配置',
        details: [
          `当前选择配置：${selectedConfig?.name || 'unknown'}`,
          `模型：${selectedConfig?.model || 'unknown'}`,
        ],
      };
    }

    if (hasCodexHome) {
      return {
        providerId: this.providerId,
        ready: true,
        source: 'local-config',
        summary: 'Codex runtime 检测到本地 .codex 配置来源',
        details: [localSnapshot?.codexHome.path || '.codex'],
      };
    }

    return {
      providerId: this.providerId,
      ready: false,
      source: 'missing',
      summary: 'Codex runtime 还没有可用配置',
      details: ['缺少 OpenAI Compatible 配置，并且未发现本地 .codex 目录'],
    };
  }
}
