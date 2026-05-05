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
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number }
  | { kind: 'bubble_part'; key: string; part: AIChatMessagePart; index: number };

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
  const timeline = Array.isArray(draftState?.timeline)
    ? draftState.timeline
    : message.role === 'assistant' && Array.isArray(message.timeline)
      ? message.timeline
      : [];
  const content = getAssistantTimelineText(timeline);
  const isStreaming = Boolean(draftState);
  const parts = timeline.flatMap((event): AIChatMessagePart[] => {
    if (event.kind === 'reasoning') {
      return [
        {
          type: 'thinking',
          content: event.content,
          collapsed: event.collapsed,
          createdAt: event.createdAt,
        },
      ];
    }

    if (event.kind === 'text') {
      return [
        {
          type: 'text',
          content: event.content,
          createdAt: event.createdAt,
        },
      ];
    }

    return [];
  });

  const items = parts
    .filter((part) => !shouldSuppressAssistantTextPart(message, part, bubbleCardCount))
    .map((part, index) => ({
      kind: part.type === 'thinking' ? 'thinking_lane' : 'bubble_part',
      key: `${message.id}-part-${index}`,
      part,
      index,
    })) as AssistantRenderItem[];

  return {
    content,
    isStreaming,
    items,
    copyText: getAssistantTimelineText(timeline),
  };
};
