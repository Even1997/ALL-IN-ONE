import type React from 'react';
import type { StreamingLatencyTrace } from '../../modules/ai/runtime/streamingLatencyTrace.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type {
  AssistantDraftState,
  AssistantRenderModel,
} from './assistantRenderModel.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';
import {
  buildChatMessageTimelineRenderModel,
  type ChatMessageTimelineRenderItem,
  type ChatMessageTimelineRenderModel,
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

export type AssistantMessageOutputModel = {
  timelineRenderModel: ChatMessageTimelineRenderModel;
  processItems: ChatMessageTimelineRenderItem[];
  finalAnswerItem: ChatMessageTimelineRenderItem | null;
  copyText: string;
  hasVisibleContent: boolean;
};

export const buildAssistantMessageOutputModel = (input: {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  assistantRenderModel: AssistantRenderModel;
  renderMessagePart: MessagePartRenderer;
  timelineCards: Array<{
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
  supplementalCards: Array<{
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
}): AssistantMessageOutputModel => {
  const { message, assistantRenderModel, renderMessagePart, timelineCards, supplementalCards } = input;
  const isStreaming = assistantRenderModel.isStreaming;

  const thinkingItems: ChatMessageTimelineRenderItem[] = assistantRenderModel.processItems.map((item) => ({
    key: item.key,
    node: renderMessagePart(message, message.id, item.part, item.index, {
      content: assistantRenderModel.content,
      isStreaming,
    }),
    createdAt: item.part.createdAt,
    timelineOrder: item.timelineOrder,
    laneKind: 'thinking_lane',
  }));

  const cardItems: ChatMessageTimelineRenderItem[] = [...timelineCards, ...supplementalCards].map((card, index) => ({
    key: `${message.id}-output-card-${index}`,
    node: card.node,
    createdAt: card.createdAt,
    timelineOrder: card.timelineOrder,
    laneKind: 'bubble',
  }));

  const answerRenderItem =
    assistantRenderModel.finalAnswerItem
      ? {
          key: assistantRenderModel.finalAnswerItem.key,
          node: renderMessagePart(
            message,
            message.id,
            assistantRenderModel.finalAnswerItem.part,
            assistantRenderModel.finalAnswerItem.index,
            {
              content: assistantRenderModel.content,
              isStreaming,
            },
          ),
          createdAt: assistantRenderModel.finalAnswerItem.part.createdAt,
          timelineOrder: assistantRenderModel.finalAnswerItem.timelineOrder,
          laneKind: 'answer_lane' as const,
        }
      : null;

  const timelineRenderModel = buildChatMessageTimelineRenderModel({
    thinkingItems,
    timelineCardItems: cardItems,
    activeResponseItem: isStreaming ? answerRenderItem : null,
    finalAnswerItem: isStreaming ? null : answerRenderItem,
  });

  return {
    timelineRenderModel,
    processItems: timelineRenderModel.processItems,
    finalAnswerItem: timelineRenderModel.finalAnswerItem,
    copyText: assistantRenderModel.copyText,
    hasVisibleContent:
      timelineRenderModel.processItems.length > 0 || Boolean(timelineRenderModel.finalAnswerItem),
  };
};
