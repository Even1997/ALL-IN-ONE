import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import {
  getAssistantTimelineText,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';

export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
  streamingText?: string;
  isStreaming?: boolean;
  streamingReasoningTextByEventId?: Record<string, string>;
};

export type AssistantStreamingState = {
  streamingText?: string;
  isStreaming?: boolean;
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'answer_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number };

export type AssistantRenderModel = {
  content: string;
  isStreaming: boolean;
  items: AssistantRenderItem[];
  copyText: string;
};

const normalizeAssistantCopy = (value: string) => value.replace(/\s+/g, ' ').trim();

const shouldSuppressAssistantTextPart = (
  _message: StoredChatMessage,
  part: AIChatMessagePart,
  bubbleCardCount: number
) => {
  if (part.type !== 'text') {
    return false;
  }

  if (bubbleCardCount === 0) {
    return false;
  }

  const normalized = normalizeAssistantCopy(part.content);
  return normalized.length === 0;
};

export const buildAssistantRenderModel = (
  message: StoredChatMessage,
  draftState?: AssistantDraftState,
  bubbleCardCount = 0,
  streamingState?: AssistantStreamingState,
): AssistantRenderModel => {
  const thinkingItems: Array<{ part: AIChatMessagePart; timelineOrder: number }> = [];
  const isStreaming = streamingState?.isStreaming ?? draftState?.isStreaming ?? Boolean(draftState);
  const timeline = isStreaming
    ? Array.isArray(draftState?.timeline)
      ? draftState.timeline
      : message.role === 'assistant' && Array.isArray(message.timeline)
        ? message.timeline
        : []
    : message.role === 'assistant' && Array.isArray(message.timeline)
      ? message.timeline
      : [];
  const timelineText = getAssistantTimelineText(timeline);
  const streamingText =
    streamingState && Object.prototype.hasOwnProperty.call(streamingState, 'streamingText')
      ? streamingState.streamingText
      : draftState?.streamingText;
  const hasStreamingText = isStreaming && streamingText !== undefined;
  const content = hasStreamingText ? streamingText || '' : timelineText;
  const answerCreatedAt =
    [...timeline]
      .reverse()
      .find((event): event is Extract<AssistantTimelineEvent, { kind: 'text' }> => event.kind === 'text')
      ?.createdAt ?? message.createdAt;

  timeline.forEach((event, timelineOrder) => {
    if (event.kind === 'reasoning') {
      thinkingItems.push({
        part: {
          type: 'thinking',
          content: draftState?.streamingReasoningTextByEventId?.[event.id] ?? event.content,
          collapsed: event.collapsed,
          status: event.status,
          elapsedSeconds: event.elapsedSeconds,
          createdAt: event.createdAt,
        },
        timelineOrder,
      });
    }
  });

  const baseItems = thinkingItems
    .filter(({ part }) => !shouldSuppressAssistantTextPart(message, part, bubbleCardCount))
    .map(({ part, timelineOrder }, index) => ({
      kind: 'thinking_lane',
      key: `${message.id}-part-${index}`,
      part,
      index,
      timelineOrder,
    })) as AssistantRenderItem[];
  const normalizedContent = normalizeAssistantCopy(content);
  const shouldRenderAnswer =
    hasStreamingText ||
    (normalizedContent.length > 0 &&
      !shouldSuppressAssistantTextPart(
        message,
        {
          type: 'text',
          content,
          createdAt: answerCreatedAt,
        },
        bubbleCardCount,
      ));
  const items: AssistantRenderItem[] = shouldRenderAnswer
    ? [
        ...baseItems,
        {
          kind: 'answer_lane',
          key: `${message.id}-answer-text`,
          part: {
            type: 'text',
            content,
            createdAt: answerCreatedAt,
          },
          index: baseItems.length,
          timelineOrder: timeline.length,
        },
      ]
    : baseItems;

  return {
    content,
    isStreaming,
    items,
    copyText: content,
  };
};
