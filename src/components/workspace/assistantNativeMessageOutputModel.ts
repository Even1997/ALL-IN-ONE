import type React from 'react';
import { getAssistantTimelineText } from '../../modules/ai/store/assistantTimeline.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { StreamingLatencyTrace } from '../../modules/ai/runtime/streamingLatencyTrace.ts';
import type { AssistantDraftState } from './assistantRenderModel.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';
import {
  sortChatMessageTimelineItems,
  type ChatMessageTimelineRenderItem,
} from './timeline/chatMessageTimelineRenderModel.ts';

type MessagePartRenderer = (
  message: StoredChatMessage,
  messageId: string,
  part: AIChatMessagePart,
  index: number,
  options?: {
    content: string;
    isStreaming: boolean;
    streamingLatencyTrace?: StreamingLatencyTrace | null;
    onFirstVisibleChar?: () => void;
    onFinalVisibleDone?: () => void;
  }
) => React.ReactNode;

export type AssistantNativeMessageOutputModel = {
  items: ChatMessageTimelineRenderItem[];
  copyText: string;
  hasVisibleContent: boolean;
  isStreaming: boolean;
};

export const buildAssistantNativeMessageOutputModel = (input: {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  renderMessagePart: MessagePartRenderer;
}): AssistantNativeMessageOutputModel => {
  const { message, draftState, renderMessagePart } = input;
  const isStreaming = draftState?.isStreaming ?? Boolean(draftState);
  const timeline =
    isStreaming
      ? Array.isArray(draftState?.timeline)
        ? draftState.timeline
        : message.role === 'assistant' && Array.isArray(message.timeline)
          ? message.timeline
          : []
      : message.role === 'assistant' && Array.isArray(message.timeline)
        ? message.timeline
        : [];
  const answerContent = getAssistantTimelineText(timeline);
  const lastStreamingTextEventId = isStreaming
    ? [...timeline]
        .reverse()
        .find((event): event is Extract<(typeof timeline)[number], { kind: 'text' }> => event.kind === 'text')
        ?.id ?? null
    : null;

  const items = sortChatMessageTimelineItems(
    timeline.flatMap((event, index): ChatMessageTimelineRenderItem[] => {
      if (event.kind === 'reasoning') {
        const part: Extract<AIChatMessagePart, { type: 'thinking' }> = {
          type: 'thinking',
          content: draftState?.streamingReasoningTextByEventId?.[event.id] ?? event.content,
          collapsed: event.collapsed,
          status: event.status,
          elapsedSeconds: event.elapsedSeconds,
          createdAt: event.createdAt,
        };

        if (!part.content.trim()) {
          return [];
        }

        return [
          {
            key: `${message.id}-${event.id}`,
            node: renderMessagePart(message, message.id, part, index, {
              content: answerContent,
              isStreaming: false,
            }),
            createdAt: event.createdAt,
            timelineOrder: index,
            laneKind: 'thinking_lane',
          },
        ];
      }

      if (event.kind === 'text' && event.content.trim()) {
        const part: Extract<AIChatMessagePart, { type: 'text' }> = {
          type: 'text',
          content: event.content,
          createdAt: event.createdAt,
        };

        return [
          {
            key: `${message.id}-${event.id}`,
            node: renderMessagePart(message, message.id, part, index, {
              content: answerContent,
              isStreaming: lastStreamingTextEventId === event.id,
            }),
            createdAt: event.createdAt,
            timelineOrder: index,
            laneKind: 'answer_lane',
          },
        ];
      }

      return [];
    }),
  );

  return {
    items,
    copyText: answerContent,
    hasVisibleContent: items.length > 0,
    isStreaming,
  };
};
