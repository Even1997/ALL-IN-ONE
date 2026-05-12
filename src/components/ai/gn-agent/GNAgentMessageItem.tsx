import React, { useEffect, useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore.ts';
import type { StreamingLatencyTrace } from '../../../modules/ai/runtime/streamingLatencyTrace.ts';
import {
  buildAssistantRenderModel,
  type AssistantDraftState,
  type AssistantStreamingState,
} from '../../workspace/assistantRenderModel.ts';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import {
  buildChatMessageTimelineRenderModel,
  type ChatMessageTimelineRenderGroup,
  type ChatMessageTimelineRenderItem,
} from '../../workspace/timeline/chatMessageTimelineRenderModel.ts';

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

type GNAgentMessageItemProps = {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  streamingState?: AssistantStreamingState;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
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
  processSummary?: {
    elapsedSeconds?: number;
  } | null;
};

const formatProcessElapsedLabel = (elapsedSeconds: number | undefined) => {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds)) {
    return '';
  }

  return `\u5df2\u5904\u7406 ${Math.max(0, Math.floor(elapsedSeconds))} \u79d2`;
};

const renderProcessGroups = (
  processGroups: ChatMessageTimelineRenderGroup[],
  messageId: string,
  variant: 'inline' | 'fold',
) =>
  processGroups.map((group, groupIndex) =>
    group.kind === 'thinking_lane' ? (
      <div key={`${messageId}-process-${variant}-${groupIndex}`} className="chat-message-thinking-lane">
        {group.items.map((item) => (
          <React.Fragment key={item.key}>{item.node}</React.Fragment>
        ))}
      </div>
    ) : (
      <div key={`${messageId}-process-${variant}-${groupIndex}`} className="chat-message-bubble">
        <div className="chat-message-content chat-message-content-timeline">
          {group.items.map((item) => (
            <React.Fragment key={item.key}>{item.node}</React.Fragment>
          ))}
        </div>
      </div>
    ),
  );

const renderSupplementalCards = (
  supplementalCards: ChatMessageTimelineRenderItem[],
  messageId: string,
  variant: 'inline' | 'fold',
) =>
  supplementalCards.map((item, index) => (
    <div key={`${messageId}-supplemental-${variant}-${index}-${item.key}`} className="chat-message-bubble">
      <div className="chat-message-content chat-message-content-timeline">{item.node}</div>
    </div>
  ));

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
  timelineCards,
  supplementalCards,
  processSummary,
}: GNAgentMessageItemProps) {
  const [expandedThinkingKeys, setExpandedThinkingKeys] = useState<Record<string, boolean>>({});
  const [processFoldExpanded, setProcessFoldExpanded] = useState<boolean | null>(null);
  const content = message.role === 'assistant' ? '' : message.content;
  const timelineCardRenderItems: ChatMessageTimelineRenderItem[] = timelineCards.map((timelineCard, index) => ({
    key: `${message.id}-timeline-card-${index}`,
    node: timelineCard.node,
    createdAt: timelineCard.createdAt,
    timelineOrder: timelineCard.timelineOrder,
    laneKind: 'bubble',
  }));
  const supplementalRenderItems: ChatMessageTimelineRenderItem[] = supplementalCards.map((card, index) => ({
    key: `${message.id}-supplemental-card-${index}`,
    node: card.node,
    createdAt: card.createdAt,
    timelineOrder: card.timelineOrder,
    laneKind: 'bubble',
  }));
  const assistantRenderModel =
    message.role === 'assistant'
      ? buildAssistantRenderModel(
          message,
          draftState,
          timelineCardRenderItems.length + supplementalRenderItems.length,
          streamingState,
        )
      : null;
  const isStreaming = assistantRenderModel?.isStreaming ?? false;
  const assistantCopyText = assistantRenderModel?.copyText;
  const hasCompletedAnswer =
    message.role === 'assistant' &&
    !isStreaming &&
    Boolean(assistantRenderModel?.content.trim());
  const thinkingRenderItems: ChatMessageTimelineRenderItem[] = [];
  const nonAssistantRenderItems: ChatMessageTimelineRenderItem[] = [];
  let activeResponseRenderItem: ChatMessageTimelineRenderItem | null = null;
  let finalAnswerRenderItem: ChatMessageTimelineRenderItem | null = null;

  if (message.role === 'assistant' && assistantRenderModel) {
    assistantRenderModel.processItems.forEach((item) => {
      const thinkingKey = `${message.id}-thinking-${item.index}`;
      const thinkingExpanded =
        item.part.type === 'thinking'
          ? expandedThinkingKeys[thinkingKey] ?? !hasCompletedAnswer
          : undefined;
      thinkingRenderItems.push({
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
        laneKind: 'thinking_lane',
      });
    });
    if (assistantRenderModel.finalAnswerItem) {
      const answerRenderItem: ChatMessageTimelineRenderItem = {
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
        laneKind: 'answer_lane',
      };

      if (isStreaming) {
        activeResponseRenderItem = answerRenderItem;
      } else {
        finalAnswerRenderItem = answerRenderItem;
      }
    }
  } else {
    const parts = parseMessageParts(content);
    parts.forEach((part, index) => {
      nonAssistantRenderItems.push({
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

  const hasProjectionTimelineArtifacts = thinkingRenderItems.length > 0 || timelineCardRenderItems.length > 0;
  const timelineRenderModel = buildChatMessageTimelineRenderModel({
    thinkingItems: thinkingRenderItems,
    timelineCardItems: timelineCardRenderItems,
    activeResponseItem: hasProjectionTimelineArtifacts ? activeResponseRenderItem : null,
    finalAnswerItem: finalAnswerRenderItem,
  });
  const processGroups = timelineRenderModel.processGroups;
  const hasProcessArtifacts = hasProjectionTimelineArtifacts || supplementalRenderItems.length > 0;
  const answerBodyRenderItem =
    timelineRenderModel.finalAnswerItem || (!hasProjectionTimelineArtifacts ? activeResponseRenderItem : null);
  const hasVisibleContent =
    message.role === 'assistant'
      ? hasProcessArtifacts || timelineRenderModel.processItems.length > 0 || Boolean(answerBodyRenderItem)
      : nonAssistantRenderItems.length > 0;
  const completedElapsedLabel =
    hasCompletedAnswer
      ? formatProcessElapsedLabel(processSummary?.elapsedSeconds)
      : '';
  const shouldShowCompletedProcessFold =
    hasProcessArtifacts &&
    hasCompletedAnswer &&
    Boolean(completedElapsedLabel);

  useEffect(() => {
    if (shouldShowCompletedProcessFold) {
      if (processFoldExpanded === null) {
        setProcessFoldExpanded(false);
      }
      return;
    }

    setProcessFoldExpanded(null);
  }, [processFoldExpanded, shouldShowCompletedProcessFold]);

  const isProcessFoldExpanded = shouldShowCompletedProcessFold && (processFoldExpanded ?? false);

  return (
    <article className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
      {message.role === 'assistant' && hasVisibleContent ? (
        <>
          {shouldShowCompletedProcessFold ? (
            <details
              className="chat-message-process-fold"
              open={isProcessFoldExpanded}
              onToggle={(event) => {
                const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                setProcessFoldExpanded(nextOpen);
              }}
            >
              <summary className="chat-message-process-summary">
                <span className="chat-message-process-elapsed">{completedElapsedLabel}</span>
                <span className="chat-message-process-caret" aria-hidden="true" />
              </summary>
              <div className="chat-message-process-fold-body">
                {renderProcessGroups(processGroups, message.id, 'fold')}
                {renderSupplementalCards(supplementalRenderItems, message.id, 'fold')}
              </div>
            </details>
          ) : hasProcessArtifacts ? (
            <div className="chat-message-process-inline">
              {renderProcessGroups(processGroups, message.id, 'inline')}
              {renderSupplementalCards(supplementalRenderItems, message.id, 'inline')}
            </div>
          ) : null}
          {answerBodyRenderItem ? (
            <div className="chat-message-bubble chat-message-final-answer">
              <div className="chat-message-content chat-message-content-timeline">
                {answerBodyRenderItem.node}
              </div>
            </div>
          ) : null}
          <AssistantMessageActionBar copyText={isStreaming ? undefined : assistantCopyText} />
          <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
        </>
      ) : null}
      {message.role !== 'assistant' && hasVisibleContent ? (
        <div className="chat-message-bubble">
          <div className="chat-message-content chat-message-content-timeline">
            {nonAssistantRenderItems.map((item) => (
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
