import React, { useCallback, useMemo, useState } from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { listProjectMemoryEntries, saveProjectMemoryEntry } from '../../../modules/ai/runtime/agentRuntimeClient';
import type { AgentMemoryEntry } from '../../../modules/ai/runtime/agentRuntimeTypes';
import { type AgentMemoryCandidate, useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { getLatestTurnSession } from '../../../modules/ai/runtime/session/agentSessionSelectors';
import { AI_CHAT_COMMAND_EVENT } from '../../../modules/ai/chat/chatCommands';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useGlobalAIStore } from '../../../modules/ai/store/globalAIStore';
import { hasUsableAIConfigEntry } from '../../../modules/ai/store/aiConfigState';
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
  const projectChatState = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id] || null : null
  );
  const activeSessionId = projectChatState?.activeSessionId || projectChatState?.sessions[0]?.id || null;
  const latestTurnSession = useAgentRuntimeStore((state) =>
    activeSessionId ? getLatestTurnSession(state.sessionsByThread[activeSessionId]) : null
  );
  const contextSnapshot = useAgentRuntimeStore((state) =>
    activeSessionId ? state.contextByThread[activeSessionId] || null : null
  );
  const toolCalls = useAgentRuntimeStore((state) =>
    activeSessionId ? state.toolCallsByThread[activeSessionId] || [] : []
  );
  const memoryCandidates = useAgentRuntimeStore((state) =>
    activeSessionId ? state.memoryCandidatesByThread[activeSessionId] || [] : []
  );
  const memoryEntries = useAgentRuntimeStore((state) =>
    currentProject ? state.memoryByProject[currentProject.id] || [] : []
  );
  const setMemoryEntries = useAgentRuntimeStore((state) => state.setMemoryEntries);
  const resolveMemoryCandidate = useAgentRuntimeStore((state) => state.resolveMemoryCandidate);
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
  const dispatchChatPrompt = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent(AI_CHAT_COMMAND_EVENT, {
        detail: {
          prompt,
          autoSubmit: true,
        },
      })
    );
  }, []);
  const dispatchChatGuidance = useCallback((prompt: string, guidance: string) => {
    const nextPrompt = `${prompt}\n\nAdditional guidance:\n${guidance}`;
    dispatchChatPrompt(nextPrompt);
  }, [dispatchChatPrompt]);
  const dispatchPauseRequest = useCallback((prompt: string) => {
    dispatchChatGuidance(
      prompt,
      'Pause after the current step and wait for more instructions before continuing.',
    );
  }, [dispatchChatGuidance]);

  const persistMemoryCandidate = useCallback(
    async (candidate: AgentMemoryCandidate, overrides?: { id?: string; title?: string }) => {
      if (!activeSessionId || !currentProject) {
        return;
      }

      const savedEntry = await saveProjectMemoryEntry({
        id: overrides?.id ?? candidate.id,
        projectId: currentProject.id,
        title: overrides?.title ?? candidate.title,
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
    },
    [activeSessionId, currentProject, memoryEntries, resolveMemoryCandidate, setMemoryEntries]
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
        await persistMemoryCandidate(candidate);
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
          <GNAgentThreadList />
          <GNAgentTimelinePanel latestTurnSession={latestTurnSession} />
        </aside>
        <div className="gn-agent-runtime-main gn-agent-shell-chat-stack">
          <GNAgentStatusPanel latestTurnSession={latestTurnSession} />
          <GNAgentTurnSummaryCards
            session={latestTurnSession}
            onRetryTurn={dispatchChatPrompt}
            onResumeTurn={dispatchChatPrompt}
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
          <GNAgentPlanPanel session={latestTurnSession} />
          <GNAgentContextPanel context={contextSnapshot} />
          <GNAgentToolCallPanel toolCalls={toolCalls} />
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
