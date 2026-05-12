import type React from 'react';
import type { StreamingLatencyTrace } from '../../modules/ai/runtime/streamingLatencyTrace.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import { buildAssistantRenderModel, type AssistantDraftState } from './assistantRenderModel.ts';
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
  isStreaming: boolean;
};

export const buildAssistantMessageOutputModel = (input: {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  renderMessagePart: MessagePartRenderer;
  timelineItems?: Array<{
    key?: string;
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
}): AssistantMessageOutputModel => {
  const { message, draftState, renderMessagePart, timelineItems = [] } = input;
  const assistantRenderModel = buildAssistantRenderModel(message, draftState);
  const isStreaming = assistantRenderModel.isStreaming;

  const processItems: ChatMessageTimelineRenderItem[] = assistantRenderModel.processItems.map((item) => ({
    key: item.key,
    node: renderMessagePart(message, message.id, item.part, item.index, {
      content: assistantRenderModel.content,
      isStreaming,
    }),
    createdAt: item.part.createdAt,
    timelineOrder: item.timelineOrder,
    laneKind: item.kind === 'thinking_lane' ? 'thinking_lane' : 'bubble',
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

  const cardItems = timelineItems.map(
    (item, index): ChatMessageTimelineRenderItem => ({
      key: item.key ?? `${message.id}-timeline-${index}`,
      node: item.node,
      createdAt: item.createdAt,
      timelineOrder: item.timelineOrder,
      laneKind: 'bubble',
    }),
  );

  const timelineRenderModel = buildChatMessageTimelineRenderModel({
    thinkingItems: processItems,
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
    isStreaming,
  };
};
