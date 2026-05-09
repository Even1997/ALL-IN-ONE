import { useCallback } from 'react';
import type { ChatAgentId } from '../../modules/ai/chat/chatAgents';
import type { AIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { useAIChatStore } from '../../modules/ai/store/aiChatStore';
import type { AgentProviderId } from '../../modules/ai/runtime/agentRuntimeTypes';
import {
  createRuntimeSidecarSession,
  submitRuntimeSidecarTurn,
} from '../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';

type UseAIChatSidecarSessionActionsInput = {
  currentProjectId: string | null;
  runtimeProviderId: AgentProviderId;
  activeSessionId: string | null;
  activeSession: {
    id: string;
    runtimeThreadId: string | null;
    title: string;
  } | null;
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
  runtimeProviderId,
  activeSessionId,
  activeSession,
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
      const effectiveChatAgentId =
        selectedChatAgentId !== 'built-in' && !isSelectedChatAgentReady
          ? 'built-in'
          : selectedChatAgentId;
      if (selectedChatAgentId !== effectiveChatAgentId) {
        setSelectedChatAgentId('built-in');
      }

      await submitRuntimeSidecarTurn({
        projectId: currentProjectId || '',
        providerId: runtimeProviderId,
        sessionId: activeSession?.runtimeThreadId || activeSessionId || null,
        title: activeSession?.title || '新对话',
        prompt: promptValue,
        runtimeConfig: selectedRuntimeConfig,
      });
    },
    [
      activeSession,
      activeSessionId,
      currentProjectId,
      isSelectedChatAgentReady,
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
