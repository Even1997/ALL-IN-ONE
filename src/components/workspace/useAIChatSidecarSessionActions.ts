// 文件作用：界面侧行为封装 Hook，位于聊天工作台前端展示层。
// 所在链路：负责把 runtime 与 store 投影结果组织成聊天界面。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { useCallback } from 'react';
// 这个 hook 负责把聊天页常用的 sidecar session 动作封装成 UI 可直接调用的方法。
// 典型动作包括创建会话、提交 turn、恢复历史、回答问题和处理审批。
// 如果你在排查“聊天页按钮如何触发 sidecar 会话动作”，先看这里。
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

// 这个 hook 负责聊天页和 node runtime sidecar 之间的“会话动作桥接”：
// - 创建 sidecar session
// - 提交 prompt 到 sidecar
// - sidecar 不可用时，把失败信息回写到本地聊天会话里
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
  getConversationHistory: () => RuntimeConversationHistoryMessage[];
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
  getConversationHistory,
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
    // 优先创建 sidecar session；
    // 如果 sidecar 不可用，再退回到纯本地欢迎会话，保证 UI 至少还能继续工作。
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
      // 这里的本地兜底逻辑很关键：
      // 即便 sidecar 没启动，也要把用户输入和错误消息写进聊天记录，
      // 否则从用户视角会像“点击发送后什么都没发生”。
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
        // 正常路径：把当前 prompt、历史消息、引用文件、上下文标签和 runtime 配置一并发给 sidecar。
        const submitted = await submitRuntimeSidecarTurn({
          projectId: currentProjectId || '',
          providerId: runtimeProviderId,
          sessionId: activeSession?.runtimeThreadId || null,
          title: activeSession?.title || '新对话',
          prompt: promptValue,
          projectName: currentProjectName || currentProjectId || '当前项目',
          projectRoot: projectRoot || undefined,
          permissionMode,
          conversationHistory: getConversationHistory(),
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
        // 异常路径同样写回会话，确保错误对用户可见，也方便后续排查。
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
      getConversationHistory,
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
