// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useMemo } from 'react';
import { ClaudeRuntime } from '../../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import type { GNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import { AIChat } from '../../../components/workspace/AIChat';
import './agentWorkbench.css';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

type AgentChatStageProps = {
  providerId: 'classic' | 'claude' | 'codex';
  mode: 'full' | 'stage-plus' | 'stage-only';
  session: GNAgentWorkbenchSession;
  projectName?: string | null;
};

export const AgentChatStage: React.FC<AgentChatStageProps> = ({
  providerId,
  mode,
  session,
}) => {
  const aiConfigs = useGlobalAIStore((state) => state.aiConfigs);
  const boundConfigId = useGNAgentShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null,
  );
  const preferredConfig = useMemo(() => {
    if (providerId === 'claude') {
      return claudeRuntime.resolvePreferredConfig(aiConfigs);
    }
    if (providerId === 'codex') {
      return codexRuntime.resolvePreferredConfig(aiConfigs);
    }
    return null;
  }, [aiConfigs, providerId]);
  const boundConfig = useMemo(
    () => (boundConfigId ? aiConfigs.find((item) => item.id === boundConfigId) || null : null),
    [aiConfigs, boundConfigId],
  );
  const usableBoundConfig = useMemo(() => {
    if (!boundConfig || !boundConfig.enabled || !hasUsableAIConfigEntry(boundConfig)) {
      return null;
    }
    if (providerId === 'claude' && boundConfig.provider === 'anthropic') {
      return boundConfig;
    }
    if (providerId === 'codex' && boundConfig.provider === 'openai-compatible') {
      return boundConfig;
    }
    return null;
  }, [boundConfig, providerId]);

  const runtimeConfigIdOverride = usableBoundConfig?.id || preferredConfig?.id || null;
  const messages = session.activeSession?.messages || [];
  const showEmptyState = !messages.some((message) => message.role === 'user' || message.role === 'system');

  return (
    <section className={`agent-chat-stage agent-chat-stage-${mode} gn-agent-workspace${showEmptyState ? ' is-empty-thread' : ''}`}>
      <div className="agent-chat-stage-body">
        <AIChat
          variant={providerId === 'classic' ? 'gn-agent-embedded' : 'provider-embedded'}
          runtimeConfigIdOverride={runtimeConfigIdOverride}
          providerExecutionMode={providerId === 'classic' ? null : providerId}
          showHeaderChrome={false}
        />
        {showEmptyState ? (
          <div className="agent-chat-stage-empty" aria-hidden="true">
            <span className="agent-chat-stage-empty-icon">
              <WorkbenchIcon name="spark" />
            </span>
            <strong>开始一段新对话</strong>
            <p>配置模型后，把任务、文件和上下文交给 Agent；需要时你可以暂停、审查，再继续执行。</p>
            <div className="agent-chat-stage-empty-steps">
              <span>配置模型</span>
              <span>描述任务</span>
              <span>继续执行</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
