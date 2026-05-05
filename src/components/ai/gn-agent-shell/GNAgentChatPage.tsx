import React, { useCallback, useMemo, useState } from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import {
  appendAgentTimelineEvent as persistRuntimeTimelineEvent,
  listProjectMemoryEntries,
  saveProjectMemoryEntry,
} from '../../../modules/ai/runtime/agentRuntimeClient';
import type { AgentMemoryEntry } from '../../../modules/ai/runtime/agentRuntimeTypes';
import { type AgentMemoryCandidate, useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { AI_CHAT_COMMAND_EVENT } from '../../../modules/ai/chat/chatCommands';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
import { appendRuntimeReplayEvent } from '../../../modules/ai/runtime/replay/runtimeReplayClient';
import { buildReplayRecoveryState } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { buildMemoryWriteLifecycleDescriptor } from '../../../modules/ai/runtime/dispatch/runtimeCapabilityLifecycle';
import { useRuntimeConversationGateway } from '../../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import { useProjectStore } from '../../../store/projectStore';
import { ClaudeRuntime } from '../../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
import { MacDialog } from '../../ui/MacDialog';
import { AIChat } from '../../workspace/AIChat';
import { GNAgentContextPanel } from './GNAgentContextPanel';
import { GNAgentMemoryInbox } from './GNAgentMemoryInbox';
import { GNAgentMemoryPanel } from './GNAgentMemoryPanel';
import { GNAgentPlanPanel } from './GNAgentPlanPanel';
import { GNAgentStatusPanel } from './GNAgentStatusPanel';
import { GNAgentTeamPanel } from './GNAgentTeamPanel';
import { GNAgentThreadList } from './GNAgentThreadList';
import { GNAgentTimelinePanel } from './GNAgentTimelinePanel';
import { GNAgentToolCallPanel } from './GNAgentToolCallPanel';
import { GNAgentTurnSummaryCards } from './GNAgentTurnSummaryCards';
import { buildAutoRenamedMemoryTitle, findMemoryEntryByTitle } from './memorySaveConflict';

const claudeRuntime = new ClaudeRuntime();
const codexRuntime = new CodexRuntime();
type PendingMemorySaveConflict = {
  candidate: AgentMemoryCandidate;
  conflictingEntry: AgentMemoryEntry;
  suggestedTitle: string;
};

export const GNAgentChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'full-page' }) => {
  const [pendingConflict, setPendingConflict] = useState<PendingMemorySaveConflict | null>(null);
  const [memoryInboxMessage, setMemoryInboxMessage] = useState<string | null>(null);
  const [isResolvingMemoryConflict, setIsResolvingMemoryConflict] = useState(false);
  const currentProject = useProjectStore((state) => state.currentProject);
  const conversation = useRuntimeConversationGateway({
    projectId: currentProject?.id || null,
  });
  const syncSessionReplayState = useAIChatStore((state) => state.syncSessionReplayState);
  const setActiveSession = useAIChatStore((state) => state.setActiveSession);
  const activeSessionId = conversation.activeSessionId;
  const activeSession = conversation.activeSession;
  const latestTurnSession = conversation.latestTurnSession;
  const contextSnapshot = conversation.contextSnapshot;
  const toolCalls = conversation.toolCalls;
  const mcpToolCalls = conversation.mcpToolCalls;
  const memoryCandidates = conversation.memoryCandidates;
  const memoryEntries = conversation.memoryEntries;
  const setMemoryEntries = useAgentRuntimeStore((state) => state.setMemoryEntries);
  const resolveMemoryCandidate = useAgentRuntimeStore((state) => state.resolveMemoryCandidate);
  const appendTimelineEvent = useAgentRuntimeStore((state) => state.appendTimelineEvent);
  const appendReplayEventToStore = useAgentRuntimeStore((state) => state.appendReplayEvent);
  const setRecoveryState = useAgentRuntimeStore((state) => state.setRecoveryState);
  const requestReplayResumeFromRecovery = useAgentRuntimeStore((state) => state.requestReplayResumeFromRecovery);
  const permissionMode = useApprovalStore((state) => state.permissionMode);
  const aiConfigs = useGlobalAIStore((state) => state.aiConfigs);
  const boundConfigId = useGNAgentShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null
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
    [aiConfigs, boundConfigId]
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
  const variant =
    providerId === 'classic' && mode === 'panel'
      ? 'gn-agent-embedded'
      : providerId === 'classic'
        ? 'default'
        : 'provider-embedded';
  const prefillChatPrompt = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent(AI_CHAT_COMMAND_EVENT, {
        detail: {
          prompt,
          autoSubmit: false,
        },
      })
    );
  }, []);
  const dispatchChatGuidance = useCallback((prompt: string, guidance: string) => {
    const nextPrompt = `${prompt}\n\nAdditional guidance:\n${guidance}`;
    prefillChatPrompt(nextPrompt);
  }, [prefillChatPrompt]);
  const dispatchPauseRequest = useCallback((prompt: string) => {
    dispatchChatGuidance(
      prompt,
      'Pause after the current step and wait for more instructions before continuing.',
    );
  }, [dispatchChatGuidance]);

  const persistMemoryCandidate = useCallback(
    async (
      candidate: AgentMemoryCandidate,
      options?: { id?: string; title?: string; action?: 'save' | 'overwrite' | 'rename' }
    ) => {
      if (!activeSessionId || !currentProject || !activeSession) {
        return;
      }

      const savedEntry = await saveProjectMemoryEntry({
        id: options?.id ?? candidate.id,
        projectId: currentProject.id,
        title: options?.title ?? candidate.title,
        summary: candidate.summary,
        content: candidate.content,
      });
      const persistedEntries = await listProjectMemoryEntries(currentProject.id);
      setMemoryEntries(
        currentProject.id,
        persistedEntries.length > 0
          ? persistedEntries
          : [savedEntry, ...memoryEntries.filter((entry) => entry.id !== savedEntry.id)]
      );
      resolveMemoryCandidate(activeSessionId, candidate.id, 'saved');

      const replayThreadId = activeSession.runtimeThreadId || activeSessionId;
      const lifecycle = buildMemoryWriteLifecycleDescriptor({
        entryId: savedEntry.id,
        title: savedEntry.title || options?.title || candidate.title,
        kind: candidate.kind,
        action: options?.action || 'save',
      });
      const persistedTimelineEvent = await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: activeSession.providerId,
        summary: lifecycle.timelineSummary,
      });
      appendTimelineEvent(activeSessionId, {
        ...persistedTimelineEvent,
        threadId: activeSessionId,
        providerId: activeSession.providerId,
        summary: lifecycle.timelineSummary,
      });
      const replayEvent = await appendRuntimeReplayEvent({
        threadId: replayThreadId,
        eventType: lifecycle.replayEventType,
        payload: lifecycle.replayPayload,
      });
      appendReplayEventToStore(replayThreadId, replayEvent);
      const replayEvents = useAgentRuntimeStore.getState().replayEventsByThread[replayThreadId] || [];
      const recoveryState = buildReplayRecoveryState(replayThreadId, replayEvents);
      setRecoveryState(activeSessionId, recoveryState);
      syncSessionReplayState(
        currentProject.id,
        activeSessionId,
        replayThreadId,
        replayEvents,
        recoveryState
      );
    },
    [
      activeSession,
      activeSessionId,
      appendReplayEventToStore,
      appendTimelineEvent,
      currentProject,
      memoryEntries,
      resolveMemoryCandidate,
      setMemoryEntries,
      setRecoveryState,
      syncSessionReplayState,
    ]
  );

  const handleSaveMemoryCandidate = useCallback(
    async (candidate: AgentMemoryCandidate) => {
      if (!activeSessionId || !currentProject) {
        return;
      }

      setMemoryInboxMessage(null);
      const conflictingEntry = findMemoryEntryByTitle(memoryEntries, candidate.title);

      if (conflictingEntry && conflictingEntry.id !== candidate.id) {
        setPendingConflict({
          candidate,
          conflictingEntry,
          suggestedTitle: buildAutoRenamedMemoryTitle(memoryEntries, candidate.title),
        });
        return;
      }

      try {
        await persistMemoryCandidate(candidate, { action: 'save' });
        setMemoryInboxMessage(`已保存“${candidate.title}”。`);
      } catch (error) {
        setMemoryInboxMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [activeSessionId, currentProject, memoryEntries, persistMemoryCandidate]
  );

  const closePendingConflict = useCallback(() => {
    if (isResolvingMemoryConflict) {
      return;
    }

    setPendingConflict(null);
  }, [isResolvingMemoryConflict]);

  const handleOverwriteMemoryEntry = useCallback(async () => {
    if (!pendingConflict) {
      return;
    }

    setIsResolvingMemoryConflict(true);
    setMemoryInboxMessage(null);

    try {
      await persistMemoryCandidate(pendingConflict.candidate, {
        id: pendingConflict.conflictingEntry.id,
        action: 'overwrite',
      });
      setMemoryInboxMessage(`已覆盖“${pendingConflict.conflictingEntry.title || pendingConflict.conflictingEntry.label}”。`);
      setPendingConflict(null);
    } catch (error) {
      setMemoryInboxMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsResolvingMemoryConflict(false);
    }
  }, [pendingConflict, persistMemoryCandidate]);

  const handleAutoRenameMemoryEntry = useCallback(async () => {
    if (!pendingConflict) {
      return;
    }

    setIsResolvingMemoryConflict(true);
    setMemoryInboxMessage(null);

    try {
      await persistMemoryCandidate(pendingConflict.candidate, {
        title: pendingConflict.suggestedTitle,
        action: 'rename',
      });
      setMemoryInboxMessage(`已另存为“${pendingConflict.suggestedTitle}”。`);
      setPendingConflict(null);
    } catch (error) {
      setMemoryInboxMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsResolvingMemoryConflict(false);
    }
  }, [pendingConflict, persistMemoryCandidate]);

  return (
    <>
      <section className="gn-agent-runtime-layout">
        <aside className="gn-agent-runtime-sidebar">
          <GNAgentThreadList
            threads={conversation.threads}
            activeSessionId={activeSessionId}
            recoveryByThread={conversation.recoveryByThread}
            onSelectThread={(threadId) => {
              if (!currentProject) {
                return;
              }
              setActiveSession(currentProject.id, threadId);
            }}
            onResumeThread={(threadId, recoveryState) => {
              if (!currentProject) {
                return;
              }
              setActiveSession(currentProject.id, threadId);
              requestReplayResumeFromRecovery(threadId, recoveryState);
            }}
          />
          <GNAgentTimelinePanel latestTurnSession={latestTurnSession} />
        </aside>
        <div className="gn-agent-runtime-main gn-agent-shell-chat-stack">
          <GNAgentStatusPanel
            latestTurnSession={latestTurnSession}
            currentProjectName={currentProject?.name || null}
            sessionCount={conversation.sessions.length}
            activeSessionId={activeSessionId}
            activityEntries={conversation.activityEntries}
            latestTeamRun={conversation.latestTeamRun}
            activeLiveState={conversation.liveState}
            pendingApprovalCount={conversation.pendingApprovalCount}
            permissionMode={permissionMode}
          />
          <GNAgentTurnSummaryCards
            session={latestTurnSession}
            onRetryTurn={prefillChatPrompt}
            onResumeTurn={prefillChatPrompt}
            onFeedTurn={dispatchChatGuidance}
            onPauseTurn={dispatchPauseRequest}
          />
          <AIChat
            variant={variant}
            runtimeConfigIdOverride={runtimeConfigIdOverride}
            providerExecutionMode={providerId === 'classic' ? null : providerId}
          />
        </div>
        <aside className="gn-agent-runtime-sidebar">
          <GNAgentTeamPanel />
          <GNAgentPlanPanel session={latestTurnSession} />
          <GNAgentContextPanel context={contextSnapshot} />
          <GNAgentToolCallPanel toolCalls={toolCalls} mcpToolCalls={mcpToolCalls} />
          <GNAgentMemoryInbox
            candidates={memoryCandidates}
            onSave={handleSaveMemoryCandidate}
            onDismiss={(candidateId) => {
              if (activeSessionId) {
                resolveMemoryCandidate(activeSessionId, candidateId, 'dismissed');
              }
            }}
            message={memoryInboxMessage}
          />
          <GNAgentMemoryPanel />
        </aside>
      </section>
      <MacDialog
        open={Boolean(pendingConflict)}
        onOpenChange={(open) => {
          if (!open) {
            closePendingConflict();
          }
        }}
        title="发现同名记忆"
        description={
          pendingConflict
            ? `“${pendingConflict.candidate.title}” 已存在。你可以覆盖原条目，或自动改名保存为 “${pendingConflict.suggestedTitle}”。`
            : undefined
        }
        footer={
          <>
            <button
              className="mac-button mac-button-secondary"
              type="button"
              onClick={closePendingConflict}
              disabled={isResolvingMemoryConflict}
            >
              取消
            </button>
            <button
              className="mac-button"
              type="button"
              onClick={() => void handleAutoRenameMemoryEntry()}
              disabled={isResolvingMemoryConflict}
            >
              {isResolvingMemoryConflict ? '处理中...' : '自动改名保存'}
            </button>
            <button
              className="mac-button mac-button-danger"
              type="button"
              onClick={() => void handleOverwriteMemoryEntry()}
              disabled={isResolvingMemoryConflict}
            >
              覆盖原条目
            </button>
          </>
        }
      >
        {pendingConflict ? (
          <div>
            <p>现有条目：{pendingConflict.conflictingEntry.title || pendingConflict.conflictingEntry.label}</p>
            <p>自动改名后：{pendingConflict.suggestedTitle}</p>
          </div>
        ) : null}
      </MacDialog>
    </>
  );
};
