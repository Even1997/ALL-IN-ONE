import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import {
  getAssistantTimelineText,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';

export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'bubble_part'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number };

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
  bubbleCardCount = 0
): AssistantRenderModel => {
  const timelineNarrativeItems: Array<{ part: AIChatMessagePart; timelineOrder: number }> = [];
  const timeline = Array.isArray(draftState?.timeline)
    ? draftState.timeline
    : message.role === 'assistant' && Array.isArray(message.timeline)
      ? message.timeline
      : [];
  const content = getAssistantTimelineText(timeline);
  const isStreaming = Boolean(draftState);
  timeline.forEach((event, timelineOrder) => {
    if (event.kind === 'reasoning') {
      timelineNarrativeItems.push({
        part: {
          type: 'thinking',
          content: event.content,
          collapsed: event.collapsed,
          createdAt: event.createdAt,
        },
        timelineOrder,
      });
      return;
    }

    if (event.kind === 'text') {
      timelineNarrativeItems.push({
        part: {
          type: 'text',
          content: event.content,
          createdAt: event.createdAt,
        },
        timelineOrder,
      });
    }
  });

  const items = timelineNarrativeItems
    .filter(({ part }) => !shouldSuppressAssistantTextPart(message, part, bubbleCardCount))
    .map(({ part, timelineOrder }, index) => ({
      kind: part.type === 'thinking' ? 'thinking_lane' : 'bubble_part',
      key: `${message.id}-part-${index}`,
      part,
      index,
      timelineOrder,
    })) as AssistantRenderItem[];

  return {
    content,
    isStreaming,
    items,
    copyText: getAssistantTimelineText(timeline),
  };
};
