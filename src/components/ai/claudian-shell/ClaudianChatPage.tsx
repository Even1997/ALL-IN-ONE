import React from 'react';
import { useClaudianShellStore } from '../../../modules/ai/claudian/claudianShellStore';
import { AIChat } from '../../workspace/AIChat';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianStatusPanel } from './ClaudianStatusPanel';
import { ClaudianRuntimeBinding } from './ClaudianRuntimeBinding';
import { ClaudianRuntimeSummary } from './ClaudianRuntimeSummary';

const PROVIDER_COPY: Record<
  'classic' | 'claude' | 'codex',
  { badge: string; title: string; subtitle: string }
> = {
  classic: {
    badge: 'Classic',
    title: 'Classic AI Chat',
    subtitle: '保留现有 AIChat 兼容路径，便于你对照迁移前后的行为差异。',
  },
  claude: {
    badge: 'Claude',
    title: 'Claude Workspace',
    subtitle: '底层执行走 ClaudeRuntime，页面结构朝 Claudian 的 provider workspace 继续对齐。',
  },
  codex: {
    badge: 'Codex',
    title: 'Codex Workspace',
    subtitle: '底层执行走 CodexRuntime，并绑定应用内 OpenAI Compatible 配置与本地 .codex 环境。',
  },
};

export const ClaudianChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page', localSnapshot = null }) => {
  const runtimeConfigIdOverride = useClaudianShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null
  );
  const variant =
    providerId === 'classic'
      ? 'default'
      : mode === 'full-page'
        ? 'claudian-full-page'
        : 'claudian-embedded';
  const copy = PROVIDER_COPY[providerId];

  return (
    <section className={`claudian-shell-page claudian-shell-chat-page claudian-shell-chat-page-${providerId}`}>
      <header className="claudian-shell-page-header claudian-shell-page-header-stack">
        <div className="claudian-shell-page-header-copy">
          <span className="claudian-context-badge">{copy.badge}</span>
          <h3>{copy.title}</h3>
          <p>{copy.subtitle}</p>
        </div>
        <div className="claudian-shell-page-overview">
          <span>{mode === 'full-page' ? 'Full Page' : 'Panel'}</span>
          <span>{providerId === 'classic' ? 'Fallback' : 'Provider Runtime'}</span>
        </div>
      </header>
      <div className="claudian-shell-chat-body">
        <div className="claudian-shell-chat-stack">
          {providerId === 'claude' || providerId === 'codex' ? (
            <div className="claudian-shell-runtime-grid">
              <ClaudianRuntimeSummary providerId={providerId} localSnapshot={localSnapshot} />
              <ClaudianRuntimeBinding providerId={providerId} />
            </div>
          ) : null}
          <ClaudianStatusPanel />
          <AIChat
            variant={variant}
            runtimeConfigIdOverride={runtimeConfigIdOverride}
            providerExecutionMode={providerId === 'classic' ? null : providerId}
          />
        </div>
      </div>
    </section>
  );
};
