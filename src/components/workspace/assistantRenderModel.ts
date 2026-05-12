import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import {
  type AssistantTimelineTextEvent,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';

export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
  isStreaming?: boolean;
  streamingStartedAt?: number;
  streamingUpdatedAt?: number;
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'feedback_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'answer_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number };

type AssistantThinkingRenderItem = Extract<AssistantRenderItem, { kind: 'thinking_lane' }>;
type AssistantFeedbackRenderItem = Extract<AssistantRenderItem, { kind: 'feedback_lane' }>;
type AssistantAnswerRenderItem = Extract<AssistantRenderItem, { kind: 'answer_lane' }>;
type AssistantProcessRenderItem = AssistantThinkingRenderItem | AssistantFeedbackRenderItem;

export type AssistantRenderModel = {
  content: string;
  isStreaming: boolean;
  items: AssistantRenderItem[];
  processItems: AssistantProcessRenderItem[];
  finalAnswerItem: AssistantAnswerRenderItem | null;
  hasFinalAnswer: boolean;
  copyText: string;
};

const normalizeAssistantCopy = (value: string) => value.replace(/\s+/g, ' ').trim();

type AssistantTextTimelineBlock = {
  firstEventId: string;
  content: string;
  createdAt: number;
  timelineOrder: number;
};

const buildAssistantTextTimelineBlocks = (timeline: AssistantTimelineEvent[]) => {
  const blocks: AssistantTextTimelineBlock[] = [];
  let currentBlock:
    | {
        firstEventId: string;
        segments: string[];
        createdAt: number;
        timelineOrder: number;
      }
    | null = null;

  const flushCurrentBlock = () => {
    if (!currentBlock) {
      return;
    }

    const content = currentBlock.segments.join('\n\n').trim();
    if (content) {
      blocks.push({
        firstEventId: currentBlock.firstEventId,
        content,
        createdAt: currentBlock.createdAt,
        timelineOrder: currentBlock.timelineOrder,
      });
    }

    currentBlock = null;
  };

  timeline.forEach((event, timelineOrder) => {
    if (event.kind !== 'text') {
      flushCurrentBlock();
      return;
    }

    const content = event.content.trim();
    if (!content) {
      return;
    }

    if (!currentBlock) {
      currentBlock = {
        firstEventId: event.id,
        segments: [content],
        createdAt: event.createdAt,
        timelineOrder,
      };
      return;
    }

    currentBlock.segments.push(content);
  });

  flushCurrentBlock();
  return blocks;
};

export const buildAssistantRenderModel = (
  message: StoredChatMessage,
  draftState?: AssistantDraftState,
): AssistantRenderModel => {
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
  const processItems: AssistantProcessRenderItem[] = [];
  const textBlocks = buildAssistantTextTimelineBlocks(timeline);
  const lastTimelineEvent = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const finalTextBlock =
    lastTimelineEvent?.kind === 'text' && textBlocks.length > 0
      ? textBlocks[textBlocks.length - 1]!
      : null;
  const feedbackTextBlocks = finalTextBlock ? textBlocks.slice(0, -1) : textBlocks;
  const content = finalTextBlock?.content || '';
  const fallbackAnswerCreatedAt =
    finalTextBlock?.createdAt
    ?? [...timeline]
      .reverse()
      .find((event): event is AssistantTimelineTextEvent => event.kind === 'text')
      ?.createdAt
    ?? message.createdAt;
  const answerCreatedAt = isStreaming
    ? draftState?.streamingStartedAt ?? fallbackAnswerCreatedAt
    : fallbackAnswerCreatedAt;

  timeline.forEach((event, timelineOrder, events) => {
    if (event.kind === 'reasoning') {
      const part = {
        type: 'thinking' as const,
        content: event.content,
        collapsed: event.collapsed,
        status: event.status,
        elapsedSeconds: event.elapsedSeconds,
        createdAt: event.createdAt,
      };
      if (part.content.trim().length === 0) {
        return;
      }

      processItems.push({
        kind: 'thinking_lane',
        key: `${message.id}-${event.id}`,
        part,
        index: processItems.length,
        timelineOrder,
      });
      return;
    }

    if (event.kind !== 'text' || finalTextBlock?.firstEventId === event.id) {
      return;
    }

    const previousEvent = timelineOrder > 0 ? events[timelineOrder - 1] : null;
    if (previousEvent?.kind === 'text') {
      return;
    }

    const feedbackBlock = feedbackTextBlocks.find((block) => block.firstEventId === event.id);
    if (!feedbackBlock) {
      return;
    }

    processItems.push({
      kind: 'feedback_lane',
      key: `${message.id}-${feedbackBlock.firstEventId}`,
      part: {
        type: 'text',
        content: feedbackBlock.content,
        createdAt: feedbackBlock.createdAt,
      },
      index: processItems.length,
      timelineOrder: feedbackBlock.timelineOrder,
    });
  });

  const normalizedContent = normalizeAssistantCopy(content);
  const shouldRenderAnswer = normalizedContent.length > 0;
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
        timelineOrder: finalTextBlock?.timelineOrder ?? timeline.length,
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
