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
  streamingStartedAt?: number;
  streamingUpdatedAt?: number;
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'answer_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number };

type AssistantThinkingRenderItem = Extract<AssistantRenderItem, { kind: 'thinking_lane' }>;
type AssistantAnswerRenderItem = Extract<AssistantRenderItem, { kind: 'answer_lane' }>;

export type AssistantRenderModel = {
  content: string;
  isStreaming: boolean;
  items: AssistantRenderItem[];
  processItems: AssistantThinkingRenderItem[];
  finalAnswerItem: AssistantAnswerRenderItem | null;
  hasFinalAnswer: boolean;
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
): AssistantRenderModel => {
  const thinkingItems: Array<{
    part: Extract<AIChatMessagePart, { type: 'thinking' }>;
    timelineOrder: number;
  }> = [];
  const isStreaming = draftState?.isStreaming ?? Boolean(draftState);
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
  const streamingText = draftState?.streamingText;
  const hasVisibleDraftText = Boolean(
    isStreaming && draftState && Object.prototype.hasOwnProperty.call(draftState, 'streamingText'),
  );
  const content = hasVisibleDraftText ? streamingText || '' : timelineText;
  const fallbackAnswerCreatedAt =
    [...timeline]
      .reverse()
      .find((event): event is Extract<AssistantTimelineEvent, { kind: 'text' }> => event.kind === 'text')
      ?.createdAt ?? message.createdAt;
  const answerCreatedAt = isStreaming
    ? draftState?.streamingStartedAt ?? fallbackAnswerCreatedAt
    : fallbackAnswerCreatedAt;

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

  const processItems = thinkingItems
    .filter(({ part }) => part.status === 'streaming')
    .map(({ part, timelineOrder }, index) => ({
      kind: 'thinking_lane',
      key: `${message.id}-part-${index}`,
      part,
      index,
      timelineOrder,
    })) as AssistantThinkingRenderItem[];
  const normalizedContent = normalizeAssistantCopy(content);
  const shouldRenderAnswer =
    hasVisibleDraftText ||
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
  const finalAnswerItem: AssistantAnswerRenderItem | null = shouldRenderAnswer
    ? {
        kind: 'answer_lane',
        key: `${message.id}-answer-text`,
        part: {
          type: 'text',
          content,
          createdAt: answerCreatedAt,
        },
        index: processItems.length,
        timelineOrder: timeline.length,
      }
    : null;
  const items: AssistantRenderItem[] = finalAnswerItem ? [...processItems, finalAnswerItem] : processItems;

  return {
    content,
    isStreaming,
    items,
    processItems,
    finalAnswerItem,
    hasFinalAnswer: Boolean(finalAnswerItem),
    copyText: content,
  };
};
