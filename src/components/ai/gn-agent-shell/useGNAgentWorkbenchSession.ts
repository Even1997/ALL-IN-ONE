// 文件作用：状态或行为封装 Hook，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { useCallback } from 'react';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import { AI_CHAT_COMMAND_EVENT } from '../../../modules/ai/chat/chatCommands';
import { buildWelcomeMessage } from '../../workspace/aiChatViewState';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import type { PermissionMode } from '../../../modules/ai/runtime/approval/approvalTypes';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import type { AgentMemoryCandidate, AgentRuntimeLiveState } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { AgentContextSnapshot } from '../../../modules/ai/runtime/context/agentContextTypes';
import { useRuntimeConversationGateway } from '../../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import type { RuntimeMcpToolCall } from '../../../modules/ai/runtime/mcp/runtimeMcpTypes';
import type { AgentReplayRecoveryState } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';
import type { AgentTeamRunRecord } from '../../../modules/ai/runtime/teams/teamTypes';
import type { AgentMemoryEntry, AgentThreadRecord } from '../../../modules/ai/runtime/agentRuntimeTypes';
import type { ChatSession } from '../../../modules/ai/store/aiChatStore';
import { createChatSession, useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { deleteRuntimeSidecarSession } from '../../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';
import { useProjectStore } from '../../../store/projectStore';

export type GNAgentWorkbenchSession = {
  currentProjectId: string | null;
  currentProjectName: string | null;
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  sessions: ChatSession[];
  latestTurnSession: AgentTurnSession | null;
  threads: AgentThreadRecord[];
  recoveryByThread: Record<string, AgentReplayRecoveryState | undefined>;
  sessionCount: number;
  activityEntries: ActivityEntry[];
  latestTeamRun: AgentTeamRunRecord | null;
  activeLiveState: AgentRuntimeLiveState | null;
  contextSnapshot: AgentContextSnapshot | null;
  toolCalls: RuntimeToolStep[];
  mcpToolCalls: RuntimeMcpToolCall[];
  memoryCandidates: AgentMemoryCandidate[];
  memoryEntries: AgentMemoryEntry[];
  pendingApprovalCount: number;
  permissionMode: PermissionMode;
  statusActions: {
    prefillChatPrompt: (prompt: string, autoSubmit?: boolean) => void;
    dispatchChatGuidance: (prompt: string, guidance: string) => void;
    dispatchPauseRequest: (prompt: string) => void;
    selectThread: (threadId: string) => void;
    deleteSession: (threadId: string) => void;
    createThread: () => void;
  };
};

export const useGNAgentWorkbenchSession = (): GNAgentWorkbenchSession => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const conversation = useRuntimeConversationGateway({
    projectId: currentProject?.id || null,
  });
  const permissionMode = useApprovalStore((state) => state.permissionMode);
  const setActiveSession = useAIChatStore((state) => state.setActiveSession);
  const upsertSession = useAIChatStore((state) => state.upsertSession);

  const prefillChatPrompt = useCallback((prompt: string, autoSubmit = false) => {
    window.dispatchEvent(
      new CustomEvent(AI_CHAT_COMMAND_EVENT, {
        detail: {
          prompt,
          autoSubmit,
        },
      }),
    );
  }, []);

  const dispatchChatGuidance = useCallback(
    (prompt: string, guidance: string) => {
      const nextPrompt = `${prompt}\n\nAdditional guidance:\n${guidance}`;
      prefillChatPrompt(nextPrompt, true);
    },
    [prefillChatPrompt],
  );

  const dispatchPauseRequest = useCallback(
    (prompt: string) => {
      dispatchChatGuidance(
        prompt,
        'Pause after the current step and wait for more instructions before continuing.',
      );
    },
    [dispatchChatGuidance],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      if (!currentProject) {
        return;
      }

      setActiveSession(currentProject.id, threadId);
    },
    [currentProject, setActiveSession],
  );

  const deleteSession = useCallback(
    (threadId: string) => {
      if (!currentProject) {
        return;
      }

      const session = conversation.sessions.find((entry) => entry.id === threadId) || null;
      void deleteRuntimeSidecarSession({
        projectId: currentProject.id,
        sessionId: threadId,
        runtimeThreadId: session?.runtimeThreadId || null,
      });
    },
    [conversation.sessions, currentProject],
  );

  const createThread = useCallback(() => {
    if (!currentProject) {
      return;
    }

    const session = {
      ...createChatSession(currentProject.id, '新对话'),
      messages: [buildWelcomeMessage()],
    };
    upsertSession(currentProject.id, session);
    setActiveSession(currentProject.id, session.id);
  }, [currentProject, setActiveSession, upsertSession]);

  return {
    currentProjectId: currentProject?.id || null,
    currentProjectName: currentProject?.name || null,
    activeSessionId: conversation.activeSessionId,
    activeSession: conversation.activeSession,
    sessions: conversation.sessions,
    latestTurnSession: conversation.latestTurnSession,
    threads: conversation.threads,
    recoveryByThread: conversation.recoveryByThread,
    sessionCount: conversation.sessions.length,
    activityEntries: conversation.activityEntries,
    latestTeamRun: conversation.latestTeamRun,
    activeLiveState: conversation.liveState,
    contextSnapshot: conversation.contextSnapshot,
    toolCalls: conversation.toolCalls,
    mcpToolCalls: conversation.mcpToolCalls,
    memoryCandidates: conversation.memoryCandidates,
    memoryEntries: conversation.memoryEntries,
    pendingApprovalCount: conversation.pendingApprovalCount,
    permissionMode,
    statusActions: {
      prefillChatPrompt,
      dispatchChatGuidance,
      dispatchPauseRequest,
      selectThread,
      deleteSession,
      createThread,
    },
  };
};
