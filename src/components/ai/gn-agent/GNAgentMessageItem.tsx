import React, { useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore.ts';
import type { StreamingLatencyTrace } from '../../../modules/ai/runtime/streamingLatencyTrace.ts';
import {
  buildAssistantRenderModel,
  type AssistantDraftState,
  type AssistantStreamingState,
} from '../../workspace/assistantRenderModel.ts';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import { groupMessageRenderItemsByLane, sortMessageRenderItems } from './messageTimelineOrdering.ts';

type MessagePartRenderer = (
  message: StoredChatMessage,
  messageId: string,
  part: AIChatMessagePart,
  index: number,
  options?: {
    content: string;
    isStreaming: boolean;
    thinkingExpanded?: boolean;
    onToggleThinking?: () => void;
    streamingLatencyTrace?: StreamingLatencyTrace | null;
    onFirstVisibleChar?: () => void;
    onFinalVisibleDone?: () => void;
  }
) => React.ReactNode;

type MessagePartsParser = (content: string) => AIChatMessagePart[];

type MessageRenderItem = {
  key: string;
  node: React.ReactNode;
  createdAt?: number;
  timelineOrder?: number;
  laneKind?: 'thinking_lane' | 'bubble' | 'answer_lane';
};

type GNAgentMessageItemProps = {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  streamingState?: AssistantStreamingState;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  bubbleCards: Array<{
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
};

const AssistantMessageActionBar: React.FC<{
  copyText?: string;
}> = ({ copyText }) => {
  const [copied, setCopied] = useState(false);

  if (!copyText?.trim()) {
    return null;
  }

  return (
    <div className="chat-message-actions" data-align="start">
      <button
        type="button"
        className="chat-message-action-btn"
        onClick={async () => {
          if (!navigator.clipboard) {
            return;
          }
          await navigator.clipboard.writeText(copyText);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? '\u5df2\u590d\u5236' : '\u590d\u5236'}
      </button>
    </div>
  );
};

export const GNAgentMessageItem = React.memo(function GNAgentMessageItem({
  message,
  draftState,
  streamingState,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  bubbleCards,
}: GNAgentMessageItemProps) {
  const [expandedThinkingKeys, setExpandedThinkingKeys] = useState<Record<string, boolean>>({});
  const content = message.role === 'assistant' ? '' : message.content;
  const bubbleRenderItems: MessageRenderItem[] = bubbleCards.map((bubbleCard, index) => ({
    key: `${message.id}-card-${index}`,
    node: bubbleCard.node,
    createdAt: bubbleCard.createdAt,
    timelineOrder: bubbleCard.timelineOrder,
    laneKind: 'bubble',
  }));
  const assistantRenderModel =
    message.role === 'assistant'
      ? buildAssistantRenderModel(message, draftState, bubbleRenderItems.length, streamingState)
      : null;
  const isStreaming = assistantRenderModel?.isStreaming ?? false;
  const assistantCopyText = assistantRenderModel?.copyText;
  const hasCompletedAnswer =
    message.role === 'assistant' &&
    !isStreaming &&
    Boolean(assistantRenderModel?.content.trim());
  const allRenderItems: MessageRenderItem[] = [];

  if (message.role === 'assistant' && assistantRenderModel) {
    assistantRenderModel.items.forEach((item) => {
      const thinkingKey = `${message.id}-thinking-${item.index}`;
      const thinkingExpanded =
        item.part.type === 'thinking'
          ? expandedThinkingKeys[thinkingKey] ?? !hasCompletedAnswer
          : undefined;
      allRenderItems.push({
        key: item.key,
        node: renderMessagePart(message, message.id, item.part, item.index, {
          content: assistantRenderModel.content,
          isStreaming,
          thinkingExpanded,
          onToggleThinking:
            item.part.type === 'thinking'
              ? () =>
                  setExpandedThinkingKeys((current) => ({
                    ...current,
                    [thinkingKey]: !(current[thinkingKey] ?? false),
                  }))
              : undefined,
        }),
        createdAt: item.part.createdAt,
        timelineOrder: item.timelineOrder,
        laneKind: item.kind === 'thinking_lane' ? 'thinking_lane' : 'answer_lane',
      });
    });
  } else {
    const parts = parseMessageParts(content);
    parts.forEach((part, index) => {
      allRenderItems.push({
        key: `${message.id}-part-${index}`,
        node: renderMessagePart(message, message.id, part, index, {
          content,
          isStreaming: false,
        }),
        createdAt: part.createdAt,
        timelineOrder: index,
        laneKind: 'bubble',
      });
    });
  }

  const timelineRenderItems = sortMessageRenderItems([...allRenderItems, ...bubbleRenderItems]);
  const timelineGroups = message.role === 'assistant' ? groupMessageRenderItemsByLane(timelineRenderItems) : [];
  const hasVisibleContent = timelineRenderItems.length > 0;

  return (
    <article className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
      {message.role === 'assistant' && hasVisibleContent ? (
        <>
          {timelineGroups.map((group, groupIndex) =>
            group.kind === 'thinking_lane' ? (
              <div key={`${message.id}-group-${groupIndex}`} className="chat-message-thinking-lane">
                {group.items.map((item) => (
                  <React.Fragment key={item.key}>{item.node}</React.Fragment>
                ))}
              </div>
            ) : (
              <div key={`${message.id}-group-${groupIndex}`} className="chat-message-bubble">
                <div className="chat-message-content chat-message-content-timeline">
                  {group.items.map((item) => (
                    <React.Fragment key={item.key}>{item.node}</React.Fragment>
                  ))}
                </div>
              </div>
            )
          )}
          <AssistantMessageActionBar copyText={isStreaming ? undefined : assistantCopyText} />
          <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
        </>
      ) : null}
      {message.role !== 'assistant' && hasVisibleContent ? (
        <div className="chat-message-bubble">
          <div className="chat-message-content chat-message-content-timeline">
            {timelineRenderItems.map((item) => (
              <React.Fragment key={item.key}>{item.node}</React.Fragment>
            ))}
          </div>
          <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
        </div>
      ) : null}
      {!hasVisibleContent ? (
        <div className="chat-message-meta chat-message-meta-standalone">{formatTimestamp(message.createdAt)}</div>
      ) : null}
    </article>
  );
});
