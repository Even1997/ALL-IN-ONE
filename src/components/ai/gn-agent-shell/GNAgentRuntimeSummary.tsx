import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import { PERMISSION_MODE_LABELS } from '../../../modules/ai/runtime/approval/permissionMode';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { useRuntimeMcpStore } from '../../../modules/ai/runtime/mcp/runtimeMcpStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { ClaudeRuntime } from '../../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
import { canResumeFromRecovery } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();

export const GNAgentRuntimeSummary: React.FC<{
  providerId: 'claude' | 'codex';
  localSnapshot: LocalAgentConfigSnapshot | null;
}> = ({ providerId, localSnapshot }) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const activeSessionId = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
  );
  const { aiConfigs } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
    }))
  );
  const { approvalsByThread, permissionMode } = useApprovalStore(
    useShallow((state) => ({
      approvalsByThread: state.approvalsByThread,
      permissionMode: state.permissionMode,
    }))
  );
  const { activeSkillsByThread, replayEventsByThread, recoveryByThread, liveStateByThread } = useAgentRuntimeStore(
    useShallow((state) => ({
      activeSkillsByThread: state.activeSkillsByThread,
      replayEventsByThread: state.replayEventsByThread,
      recoveryByThread: state.recoveryByThread,
      liveStateByThread: state.liveStateByThread,
    }))
  );
  const { runtimeMcpServers, toolCallsByThread } = useRuntimeMcpStore(
    useShallow((state) => ({
      runtimeMcpServers: state.servers,
      toolCallsByThread: state.toolCallsByThread,
    }))
  );
  const { claudeConfigId, codexConfigId } = useGNAgentShellStore(
    useShallow((state) => ({
      claudeConfigId: state.claudeConfigId,
      codexConfigId: state.codexConfigId,
    }))
  );

  const runtime = providerId === 'claude' ? claudeRuntime : codexRuntime;
  const boundConfigId = providerId === 'claude' ? claudeConfigId : codexConfigId;
  const selectedConfig = useMemo(() => {
    const boundConfig = boundConfigId ? aiConfigs.find((item) => item.id === boundConfigId) || null : null;
    const usableBoundConfig =
      boundConfig &&
      ((providerId === 'claude' && boundConfig.provider === 'anthropic') ||
        (providerId === 'codex' && boundConfig.provider === 'openai-compatible')) &&
      boundConfig.enabled &&
      hasUsableAIConfigEntry(boundConfig)
        ? boundConfig
        : null;
    return usableBoundConfig || runtime.resolvePreferredConfig(aiConfigs);
  }, [aiConfigs, boundConfigId, providerId, runtime]);
  const status = useMemo(
    () => runtime.getStatus({ selectedConfig, localSnapshot }),
    [localSnapshot, runtime, selectedConfig]
  );
  const pendingApprovalCount = useMemo(
    () =>
      Object.values(approvalsByThread)
        .flat()
        .filter((approval) => approval.status === 'pending').length,
    [approvalsByThread]
  );
  const activeSkillCount = useMemo(
    () => Object.values(activeSkillsByThread).reduce((count, skills) => count + skills.length, 0),
    [activeSkillsByThread]
  );
  const mcpCalls = useMemo(
    () => Object.values(toolCallsByThread).reduce((count, calls) => count + calls.length, 0),
    [toolCallsByThread]
  );
  const replayEvents = useMemo(
    () => Object.values(replayEventsByThread).reduce((count, events) => count + events.length, 0),
    [replayEventsByThread]
  );
  const resumableThreads = useMemo(
    () => Object.values(recoveryByThread).filter((state) => canResumeFromRecovery(state)).length,
    [recoveryByThread]
  );
  const resumeState = resumableThreads > 0 ? 'resume-ready' : replayEvents > 0 ? 'resume-idle' : 'resume-empty';
  const activeLiveState = activeSessionId ? liveStateByThread[activeSessionId] || null : null;

  return (
    <section className={`gn-agent-runtime-summary ${status.ready ? 'ready' : 'missing'}`}>
      <div className="gn-agent-runtime-summary-header">
        <strong>{providerId === 'claude' ? 'Claude Runtime' : 'Codex Agent Runtime'}</strong>
        <span>{status.source}</span>
      </div>
      <p>{status.summary}</p>
      <div className="gn-agent-runtime-summary-details">
        <code>session: {activeLiveState?.connectionState || 'disconnected'}</code>
        <code>status: {activeLiveState?.statusVerb || 'idle'}</code>
        <code>tool: {activeLiveState?.activeToolName || 'none'}</code>
        {activeLiveState?.streamingToolInput ? (
          <code>input: {activeLiveState.streamingToolInput}</code>
        ) : null}
        <code>elapsed: {activeLiveState?.elapsedSeconds || 0}s</code>
        <code>tokens: ~{activeLiveState?.tokenUsage.inputTokens || 0} / ~{activeLiveState?.tokenUsage.outputTokens || 0}</code>
        <code>approval: {pendingApprovalCount} pending</code>
        {activeLiveState?.pendingApprovalSummary ? (
          <code>approval summary: {activeLiveState.pendingApprovalSummary}</code>
        ) : null}
        {activeLiveState?.pendingQuestionSummary ? (
          <code>question: {activeLiveState.pendingQuestionSummary}</code>
        ) : null}
        <code>mode: {PERMISSION_MODE_LABELS[permissionMode]}</code>
        <code>skills: {activeSkillCount}</code>
        <code>mcp: {runtimeMcpServers.length}</code>
        <code>mcp calls: {mcpCalls}</code>
        <code>replay: {replayEvents}</code>
        <code>resume-ready: {resumableThreads}</code>
        <code>resume: {resumeState}</code>
        {status.details.map((detail) => (
          <code key={detail}>{detail}</code>
        ))}
      </div>
    </section>
  );
};
