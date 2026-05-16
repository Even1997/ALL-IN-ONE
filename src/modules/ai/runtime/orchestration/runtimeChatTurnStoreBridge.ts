// 文件作用：桥接层，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type { AgentRuntimeLiveState } from '../agentRuntimeStore.ts';
import type { AssistantTimelineEvent } from '../../store/assistantTimeline.ts';

export type RuntimeChatMessageBridge = {
  appendUserMessage: (content: string, runId: string) => string;
  appendAssistantMessage: (runId: string) => string;
  appendCanonicalEvent: (assistantMessageId: string, event: CanonicalEvent) => void;
  updateAssistantTimeline: (
    assistantMessageId: string,
    updater: (timeline: AssistantTimelineEvent[]) => AssistantTimelineEvent[],
  ) => void;
  failAssistantMessage: (assistantMessageId: string, message: string) => void;
};

export type RuntimeChatStateBridge = {
  bindThread: (runtimeThreadId: string) => void;
  startTurn: (input: { turnId: string; prompt: string; createdAt: number }) => void;
  patchLiveState: (
    threadId: string,
    updater:
      | Partial<AgentRuntimeLiveState>
      | ((state: AgentRuntimeLiveState) => AgentRuntimeLiveState),
  ) => void;
  setToolCalls: (threadId: string, toolCalls: RuntimeToolStep[]) => void;
  completeTurn: (finalContent: string) => Promise<void>;
  failTurn: (message: string) => Promise<void>;
};

export const createRuntimeChatTurnStoreBridge = (
  bridge: RuntimeChatMessageBridge & RuntimeChatStateBridge,
) => bridge;
