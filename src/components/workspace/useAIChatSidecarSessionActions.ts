import { useCallback } from 'react';
import type { ChatAgentId } from '../../modules/ai/chat/chatAgents';
import type { AIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { createStoredChatMessage, useAIChatStore } from '../../modules/ai/store/aiChatStore';
import type { AgentProviderId } from '../../modules/ai/runtime/agentRuntimeTypes';
import type { RuntimeConversationHistoryMessage, RuntimeReferenceFileRecord } from '@goodnight/runtime-protocol';
import {
  createRuntimeSidecarSession,
  submitRuntimeSidecarTurn,
} from '../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';
import { getDesktopRuntimeSidecarStatus } from '../../modules/runtime-sidecar/desktopRuntimeSidecar.ts';

type UseAIChatSidecarSessionActionsInput = {
  currentProjectId: string | null;
  currentProjectName: string | null;
  projectRoot: string | null;
  runtimeProviderId: AgentProviderId;
  activeSession: {
    id: string;
    runtimeThreadId: string | null;
    title: string;
  } | null;
  permissionMode: 'ask' | 'plan' | 'auto' | 'bypass';
  conversationHistory: RuntimeConversationHistoryMessage[];
  referenceFiles: RuntimeReferenceFileRecord[];
  contextLabels: string[];
  selectedRuntimeConfig: AIConfigEntry | null;
  selectedChatAgentId: ChatAgentId;
  isSelectedChatAgentReady: boolean;
  setSelectedChatAgentId: (agentId: ChatAgentId) => void;
  setInput: (value: string) => void;
  setShowHistoryMenu: (open: boolean) => void;
  createWelcomeSession: (projectId: string, providerId: AgentProviderId) => ReturnType<typeof useAIChatStore.getState>['projects'][string]['sessions'][number];
  upsertSession: ReturnType<typeof useAIChatStore.getState>['upsertSession'];
  setActiveSession: ReturnType<typeof useAIChatStore.getState>['setActiveSession'];
};

export const useAIChatSidecarSessionActions = ({
  currentProjectId,
  currentProjectName,
  projectRoot,
  runtimeProviderId,
  activeSession,
  permissionMode,
  conversationHistory,
  referenceFiles,
  contextLabels,
  selectedRuntimeConfig,
  selectedChatAgentId,
  isSelectedChatAgentReady,
  setSelectedChatAgentId,
  setInput,
  setShowHistoryMenu,
  createWelcomeSession,
  upsertSession,
  setActiveSession,
}: UseAIChatSidecarSessionActionsInput) => {
  const handleCreateSession = useCallback(() => {
    if (!currentProjectId) {
      return;
    }

    void (async () => {
      const sidecarSessionId = await createRuntimeSidecarSession({
        projectId: currentProjectId,
        providerId: runtimeProviderId,
        title: '新对话',
      });

      if (!sidecarSessionId) {
        const session = createWelcomeSession(currentProjectId, runtimeProviderId);
        upsertSession(currentProjectId, session);
        setActiveSession(currentProjectId, session.id);
      }

      setInput('');
      setShowHistoryMenu(false);
    })();
  }, [
    createWelcomeSession,
    currentProjectId,
    runtimeProviderId,
    setActiveSession,
    setInput,
    setShowHistoryMenu,
    upsertSession,
  ]);

  const submitPrompt = useCallback(
    async (promptValue: string) => {
      const ensureLocalSubmissionSession = (promptValue: string) => {
        if (!currentProjectId) {
          return null;
        }

        if (activeSession?.id) {
          useAIChatStore
            .getState()
            .appendMessage(currentProjectId, activeSession.id, createStoredChatMessage('user', promptValue));
          return activeSession.id;
        }

        const session = createWelcomeSession(currentProjectId, runtimeProviderId);
        const sessionWithPrompt = {
          ...session,
          messages: [...session.messages, createStoredChatMessage('user', promptValue)],
        };
        upsertSession(currentProjectId, sessionWithPrompt);
        setActiveSession(currentProjectId, sessionWithPrompt.id);
        return sessionWithPrompt.id;
      };

      const appendSubmissionError = (sessionId: string | null, message: string) => {
        if (!currentProjectId || !sessionId) {
          return;
        }
        useAIChatStore
          .getState()
          .appendMessage(currentProjectId, sessionId, createStoredChatMessage('system', message, 'error'));
      };
      const effectiveChatAgentId =
        selectedChatAgentId !== 'built-in' && !isSelectedChatAgentReady
          ? 'built-in'
          : selectedChatAgentId;
      if (selectedChatAgentId !== effectiveChatAgentId) {
        setSelectedChatAgentId('built-in');
      }

      try {
        const submitted = await submitRuntimeSidecarTurn({
          projectId: currentProjectId || '',
          providerId: runtimeProviderId,
          sessionId: activeSession?.runtimeThreadId || null,
          title: activeSession?.title || '新对话',
          prompt: promptValue,
          projectName: currentProjectName || currentProjectId || '当前项目',
          projectRoot: projectRoot || undefined,
          permissionMode,
          conversationHistory,
          referenceFiles,
          contextLabels,
          runtimeConfig: selectedRuntimeConfig,
        });

        if (!submitted) {
          const fallbackSessionId = ensureLocalSubmissionSession(promptValue);
          const sidecarStatus = getDesktopRuntimeSidecarStatus();
          appendSubmissionError(
            fallbackSessionId,
            sidecarStatus.error
              ? `Node runtime sidecar 未启动：${sidecarStatus.error}`
              : 'Node runtime sidecar 未启动，本次消息没有发送。请确认正在桌面端运行，并重新发送。',
          );
        }
      } catch (error) {
        const fallbackSessionId = ensureLocalSubmissionSession(promptValue);
        appendSubmissionError(
          fallbackSessionId,
          `Node runtime sidecar 提交失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [
      activeSession,
      currentProjectName,
      currentProjectId,
      conversationHistory,
      contextLabels,
      isSelectedChatAgentReady,
      permissionMode,
      projectRoot,
      referenceFiles,
      runtimeProviderId,
      selectedChatAgentId,
      selectedRuntimeConfig,
      setSelectedChatAgentId,
    ],
  );

  return {
    handleCreateSession,
    submitPrompt,
  };
};
