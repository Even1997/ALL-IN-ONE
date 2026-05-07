import type { AITextStreamEvent } from '../../core/AIService.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import {
  applyAssistantReasoningProgress,
  buildAssistantStreamingTimeline,
  buildAssistantTimelineUpdate,
  getAssistantTimelineReasoning,
  syncAssistantTimelineWithToolCalls,
  type AssistantTimelineEvent,
} from '../../store/assistantTimeline.ts';
import { createRuntimeStreamingMessageAssembler } from './agentTurnRunner.ts';
import type { RuntimeChatMessageBridge, RuntimeChatStateBridge } from './runtimeChatTurnStoreBridge.ts';

export const createRuntimeChatStreamingController = (input: {
  assistantMessageId: string;
  bridge: RuntimeChatMessageBridge & Pick<RuntimeChatStateBridge, 'patchLiveState'>;
  runtimeStoreThreadId: string;
  baseTimeline: AssistantTimelineEvent[];
  pushStreamingDraft?: (assistantMessageId: string, draft: { timeline: AssistantTimelineEvent[] }) => void;
  clearStreamingDraft?: (assistantMessageId: string) => void;
  estimateTokenCount?: (content: string) => number;
}) => {
  const streamingAssembler = createRuntimeStreamingMessageAssembler();

  return {
    onModelEvent(event: AITextStreamEvent): void {
      if (event.kind !== 'thinking' && event.kind !== 'text') {
        return;
      }

      const draftState = streamingAssembler.append(event);
      input.bridge.patchLiveState(input.runtimeStoreThreadId, (state) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: event.kind === 'thinking' ? 'Reasoning' : 'Streaming response',
        activeThinking: event.kind === 'thinking',
        streamingToolInput: event.kind === 'thinking' ? state.streamingToolInput : '',
        streamingText: event.kind === 'text' ? `${state.streamingText}${event.delta}` : state.streamingText,
        tokenUsage: {
          ...state.tokenUsage,
          outputTokens: state.tokenUsage.outputTokens + (input.estimateTokenCount?.(event.delta) || 0),
        },
      }));
      input.pushStreamingDraft?.(input.assistantMessageId, {
        timeline: applyAssistantReasoningProgress(
          buildAssistantStreamingTimeline(draftState.content, input.baseTimeline, {
            fallbackThinkingContent: draftState.thinkingContent,
            preferredAssistantParts: draftState.assistantParts,
          }),
          {
            active: event.kind === 'thinking',
            referenceTime: Date.now(),
          },
        ),
      });
    },
    markToolBoundary(): void {
      const boundaryDraft = streamingAssembler.markToolBoundary();
      input.pushStreamingDraft?.(input.assistantMessageId, {
        timeline: applyAssistantReasoningProgress(
          buildAssistantStreamingTimeline(boundaryDraft.content, input.baseTimeline, {
            fallbackThinkingContent: boundaryDraft.thinkingContent,
            preferredAssistantParts: boundaryDraft.assistantParts,
          }),
          {
            active: false,
            referenceTime: Date.now(),
          },
        ),
      });
    },
    finalize(finalContent: string, toolCalls: RuntimeToolStep[]): string {
      const finalDraft = streamingAssembler.buildFinal(finalContent);
      input.clearStreamingDraft?.(input.assistantMessageId);
      input.bridge.updateAssistantTimeline(input.assistantMessageId, (timeline) =>
        applyAssistantReasoningProgress(
          buildAssistantTimelineUpdate(
            finalDraft.content,
            syncAssistantTimelineWithToolCalls(timeline, toolCalls),
            {
              fallbackThinkingContent: getAssistantTimelineReasoning(timeline),
              preferredAssistantParts: finalDraft.assistantParts,
            },
          ),
          {
            active: false,
            referenceTime: Date.now(),
          },
        ),
      );
      return finalDraft.content;
    },
    clear(): void {
      input.clearStreamingDraft?.(input.assistantMessageId);
    },
  };
};
