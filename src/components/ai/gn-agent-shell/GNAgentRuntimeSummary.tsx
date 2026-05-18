// 文件作用：汇总本地 Agent 运行态、审批态、MCP 与恢复态，不再承担云配置绑定壳层判断。
// 所在链路：Agent shell UI composition。
// 排查入口：先看 localSnapshot 派生摘要，再看 live runtime / approval / replay 的聚合结果。
import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import { PERMISSION_MODE_LABELS } from '../../../modules/ai/runtime/approval/permissionMode';
import { useRuntimeMcpStore } from '../../../modules/ai/runtime/mcp/runtimeMcpStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { canResumeFromRecovery } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useProjectStore } from '../../../store/projectStore';

export const GNAgentRuntimeSummary: React.FC<{
  providerId: 'claude' | 'codex';
  localSnapshot: LocalAgentConfigSnapshot | null;
}> = ({ providerId, localSnapshot }) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const activeSessionId = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
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

  const status = useMemo(() => {
    const homeProbe = providerId === 'claude' ? localSnapshot?.claudeHome : localSnapshot?.codexHome;
    const extraProbe = providerId === 'claude' ? localSnapshot?.claudeSettings : localSnapshot?.codexSkills;
    const label = providerId === 'claude' ? 'Claude Agent Runtime' : 'Codex Agent Runtime';
    const ready = Boolean(homeProbe?.exists);

    return {
      ready,
      source: ready ? 'local runtime detected' : 'local runtime missing',
      summary: ready
        ? `${label} 的本地目录已检测到；实际执行状态以下方 live runtime 数据为准。`
        : `${label} 的本地目录尚未检测到；当前摘要仅展示审批、MCP 与恢复态。`,
      details: [
        homeProbe?.path ? `home: ${homeProbe.path}` : null,
        extraProbe?.path ? `config: ${extraProbe.path}` : null,
      ].filter((detail): detail is string => Boolean(detail)),
    };
  }, [localSnapshot, providerId]);

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
        <strong>{providerId === 'claude' ? 'Claude Agent Runtime' : 'Codex Agent Runtime'}</strong>
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
        <code>approval policy: {PERMISSION_MODE_LABELS[permissionMode]}</code>
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
