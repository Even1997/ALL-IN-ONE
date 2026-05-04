import React, { useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore';
import { buildAssistantRenderModel } from '../../workspace/assistantRenderModel';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import { buildGNAgentMessageFlow } from './GNAgentMessageFlow';

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

type MessageRenderItem =
  | { kind: 'thinking_lane'; key: string; node: React.ReactNode; createdAt?: number }
  | { kind: 'bubble_part'; key: string; node: React.ReactNode; createdAt?: number }
  | { kind: 'bubble_card'; key: string; node: React.ReactNode; createdAt?: number };

type GNAgentMessageItemProps = {
  message: StoredChatMessage;
  draftState?: {
    content: string;
    thinkingContent: string;
    answerContent: string;
    assistantParts: AIChatMessagePart[];
  };
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  bubbleCards: React.ReactNode[];
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

const areMessageItemPropsEqual = (
  prev: GNAgentMessageItemProps,
  next: GNAgentMessageItemProps
) => {
  if (prev.message.id !== next.message.id) return false;
  if (prev.draftState !== next.draftState) return false;
  if (prev.bubbleCards.length !== next.bubbleCards.length) return false;
  if (prev.formatTimestamp !== next.formatTimestamp) return false;
  if (prev.parseMessageParts !== next.parseMessageParts) return false;
  if (prev.renderMessagePart !== next.renderMessagePart) return false;
  return true;
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
  const content = draftState?.content ?? message.content;
  const firstRuntimeEventTime = message.runtimeEvents?.reduce<number | undefined>(
    (earliest, event) =>
      typeof earliest === 'number' && earliest <= event.createdAt ? earliest : event.createdAt,
    undefined
  );
  const bubbleRenderItems: MessageRenderItem[] = bubbleCards.map((node, index) => ({
    kind: 'bubble_card',
    key: `${message.id}-card-${index}`,
    node,
    createdAt: firstRuntimeEventTime,
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
        item.part.type === 'thinking' ? (isStreaming ? true : expandedThinkingKeys[thinkingKey] ?? false) : undefined;
      partRenderItems.push({
        kind: item.kind,
        key: item.key,
        node: renderMessagePart(message, message.id, item.part, item.index, {
          content: assistantRenderModel.content,
          isStreaming,
          thinkingExpanded,
          onToggleThinking:
            item.part.type === 'thinking' && !isStreaming
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
        kind: part.type === 'thinking' ? 'thinking_lane' : 'bubble_part',
        key: `${message.id}-part-${index}`,
        node: renderMessagePart(message, message.id, part, index, {
          content,
          isStreaming: false,
        }),
        createdAt: part.createdAt,
      });
    });
  }

  const thinkingItems = partRenderItems.filter((item) => item.kind === 'thinking_lane');
  const bubbleItems = partRenderItems.filter((item) => item.kind !== 'thinking_lane');
  const itemsByKey = new Map([...thinkingItems, ...bubbleItems, ...bubbleRenderItems].map((item) => [item.key, item]));
  const flowSections = buildGNAgentMessageFlow([
    ...thinkingItems.map((item) => ({ kind: 'thinking' as const, key: item.key, createdAt: item.createdAt })),
    ...bubbleItems.map((item) => ({ kind: 'bubble' as const, key: item.key, createdAt: item.createdAt })),
    ...bubbleRenderItems.map((item) => ({ kind: 'cards' as const, key: item.key, createdAt: item.createdAt })),
  ]);

  const renderSectionItems = (keys: string[]) =>
    keys.map((key) => {
      const item = itemsByKey.get(key);
      return item ? <React.Fragment key={item.key}>{item.node}</React.Fragment> : null;
    });

  const hasVisibleContent = flowSections.some((section) => section.keys.length > 0);

  return (
    <article className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
      {flowSections.map((section, sectionIndex) => {
        if (section.kind === 'thinking') {
          return (
            <div key={`thinking-${sectionIndex}`} className="chat-message-thinking-lane">
              {renderSectionItems(section.keys)}
            </div>
          );
        }

        if (section.kind === 'cards') {
          return (
            <div key={`cards-${sectionIndex}`} className="chat-message-card-lane">
              {renderSectionItems(section.keys)}
            </div>
          );
        }

        return (
          <div key={`bubble-${sectionIndex}`} className="chat-message-bubble">
            <div className="chat-message-content">{renderSectionItems(section.keys)}</div>
            {message.role === 'assistant' && sectionIndex === flowSections.length - 1 ? (
              <AssistantMessageActionBar copyText={isStreaming ? undefined : assistantCopyText} />
            ) : null}
            <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
          </div>
        );
      })}
      {!hasVisibleContent ? (
        <div className="chat-message-meta chat-message-meta-standalone">{formatTimestamp(message.createdAt)}</div>
      ) : null}
    </article>
  );
}, areMessageItemPropsEqual);
