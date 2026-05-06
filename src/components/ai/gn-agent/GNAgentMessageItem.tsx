import React, { useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore.ts';
import { buildAssistantRenderModel, type AssistantDraftState } from '../../workspace/assistantRenderModel.ts';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import { sortMessageRenderItems } from './messageTimelineOrdering.ts';

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
  }
) => React.ReactNode;

type MessagePartsParser = (content: string) => AIChatMessagePart[];

type MessageRenderItem = {
  key: string;
  node: React.ReactNode;
  createdAt?: number;
};

type GNAgentMessageItemProps = {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  bubbleCards: Array<{
    node: React.ReactNode;
    createdAt?: number;
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
  }));
  const assistantRenderModel =
    message.role === 'assistant' ? buildAssistantRenderModel(message, draftState, bubbleRenderItems.length) : null;
  const isStreaming = assistantRenderModel?.isStreaming ?? false;
  const assistantCopyText = assistantRenderModel?.copyText;
  const partRenderItems: MessageRenderItem[] = [];

  if (message.role === 'assistant' && assistantRenderModel) {
    assistantRenderModel.items.forEach((item) => {
      const thinkingKey = `${message.id}-thinking-${item.index}`;
      const thinkingExpanded =
        item.part.type === 'thinking' ? expandedThinkingKeys[thinkingKey] ?? false : undefined;
      partRenderItems.push({
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
      });
    });
  } else {
    const parts = parseMessageParts(content);
    parts.forEach((part, index) => {
      partRenderItems.push({
        key: `${message.id}-part-${index}`,
        node: renderMessagePart(message, message.id, part, index, {
          content,
          isStreaming: false,
        }),
        createdAt: part.createdAt,
      });
    });
  }

  const timelineItems = sortMessageRenderItems(partRenderItems, bubbleRenderItems);
  const hasVisibleContent = timelineItems.length > 0;

  return (
    <article className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
      {hasVisibleContent ? (
        <div className="chat-message-bubble">
          <div className="chat-message-content chat-message-content-timeline">
            {timelineItems.map((item) => (
              <React.Fragment key={item.key}>{item.node}</React.Fragment>
            ))}
          </div>
          {message.role === 'assistant' ? (
            <AssistantMessageActionBar copyText={isStreaming ? undefined : assistantCopyText} />
          ) : null}
          <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
        </div>
      ) : null}
      {!hasVisibleContent ? (
        <div className="chat-message-meta chat-message-meta-standalone">{formatTimestamp(message.createdAt)}</div>
      ) : null}
    </article>
  );
});
