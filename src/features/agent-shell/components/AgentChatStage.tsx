import React, { useMemo } from 'react';
import { ClaudeRuntime } from '../../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { GNAgentTurnSummaryCards } from '../../../components/ai/gn-agent-shell/GNAgentTurnSummaryCards';
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
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
};

const PROVIDER_LABELS: Record<AgentChatStageProps['providerId'], string> = {
  classic: 'Agent',
  claude: 'Claude',
  codex: 'Codex',
};

export const AgentChatStage: React.FC<AgentChatStageProps> = ({
  providerId,
  mode,
  session,
  projectName = null,
  inspectorOpen = false,
  onToggleInspector,
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

  const latestTurnSession = session.latestTurnSession;
  const stageTitle = session.activeSession?.title || latestTurnSession?.plan?.summary || 'Agent';
  const stageDescription =
    latestTurnSession?.plan?.reason ||
    latestTurnSession?.userPrompt ||
    '在这里继续对话、查看执行状态，并从右侧切换审查、文件和记忆面板。';
  const stageStatus = session.activeLiveState?.statusVerb || latestTurnSession?.status || 'idle';
  const runtimeConfigIdOverride = usableBoundConfig?.id || preferredConfig?.id || null;
  const runtimeLabel = usableBoundConfig?.name || preferredConfig?.name || '默认运行时';
  const stageEyebrow = projectName || 'Agent Workspace';

  return (
    <section className={`agent-chat-stage agent-chat-stage-${mode}`}>
      <header className="agent-chat-stage-header">
        <div className="agent-chat-stage-copy">
          <div className="agent-chat-stage-meta-row">
            <span className="agent-chat-stage-eyebrow">{stageEyebrow}</span>
            <span className="agent-chat-stage-runtime-mark">{PROVIDER_LABELS[providerId]}</span>
          </div>
          <h2>{stageTitle}</h2>
          <p>{stageDescription}</p>
        </div>
        <div className="agent-chat-stage-actions">
          <span className="agent-chat-stage-pill subtle">{runtimeLabel}</span>
          <span className="agent-chat-stage-pill">{stageStatus}</span>
          {session.pendingApprovalCount > 0 ? (
            <span className="agent-chat-stage-pill warning">
              approvals {session.pendingApprovalCount}
            </span>
          ) : null}
          {onToggleInspector ? (
            <button
              type="button"
              className="agent-chat-stage-toggle"
              onClick={onToggleInspector}
              aria-label={inspectorOpen ? '收起右侧面板' : '展开右侧面板'}
              title={inspectorOpen ? '收起右侧面板' : '展开右侧面板'}
            >
              <WorkbenchIcon name={inspectorOpen ? 'panelRightClose' : 'panelRightOpen'} />
            </button>
          ) : null}
        </div>
      </header>

      {mode !== 'stage-only' && latestTurnSession ? (
        <GNAgentTurnSummaryCards
          session={latestTurnSession}
          onRetryTurn={(prompt) => session.statusActions.prefillChatPrompt(prompt, true)}
          onResumeTurn={(prompt) => session.statusActions.prefillChatPrompt(prompt, true)}
          onFeedTurn={session.statusActions.dispatchChatGuidance}
          onPauseTurn={session.statusActions.dispatchPauseRequest}
        />
      ) : null}

      <div className="agent-chat-stage-body">
        <AIChat
          variant={providerId === 'classic' ? 'gn-agent-embedded' : 'provider-embedded'}
          runtimeConfigIdOverride={runtimeConfigIdOverride}
          providerExecutionMode={providerId === 'classic' ? null : providerId}
        />
      </div>
    </section>
  );
};
