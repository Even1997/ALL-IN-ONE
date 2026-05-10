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
