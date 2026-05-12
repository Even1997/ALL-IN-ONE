import React, { useEffect, useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore.ts';
import type { StreamingLatencyTrace } from '../../../modules/ai/runtime/streamingLatencyTrace.ts';
import {
  buildAssistantRenderModel,
  type AssistantDraftState,
} from '../../workspace/assistantRenderModel.ts';
import { buildAssistantMessageOutputModel } from '../../workspace/assistantMessageOutputModel.ts';
import { buildAssistantNativeMessageOutputModel } from '../../workspace/assistantNativeMessageOutputModel.ts';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import {
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
    streamingLatencyTrace?: StreamingLatencyTrace | null;
    onFirstVisibleChar?: () => void;
    onFinalVisibleDone?: () => void;
  }
) => React.ReactNode;

type MessagePartsParser = (content: string) => AIChatMessagePart[];

type GNAgentMessageItemProps = {
  message: StoredChatMessage;
  draftState?: AssistantDraftState;
  assistantDisplayMode?: 'composed' | 'native';
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  timelineCards: Array<{
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
  nativeTimelineItems: Array<{
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
  assistantDisplayMode = 'composed',
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  timelineCards,
  nativeTimelineItems,
  supplementalCards,
  processSummary,
}: GNAgentMessageItemProps) {
  const [processFoldExpanded, setProcessFoldExpanded] = useState<boolean | null>(null);
  const content = message.role === 'assistant' ? '' : message.content;
  const assistantRenderModel =
    message.role === 'assistant'
      ? buildAssistantRenderModel(
          message,
          draftState,
          timelineCards.length + supplementalCards.length,
        )
      : null;
  const isStreaming = assistantRenderModel?.isStreaming ?? false;
  const hasCompletedAnswer =
    message.role === 'assistant' &&
    !isStreaming &&
    Boolean(assistantRenderModel?.content.trim());
  const nonAssistantRenderItems: ChatMessageTimelineRenderItem[] = [];
  const assistantMessageOutputModel =
    message.role === 'assistant' && assistantRenderModel
      ? buildAssistantMessageOutputModel({
          message,
          draftState,
          assistantRenderModel,
          renderMessagePart,
          timelineCards,
          supplementalCards,
        })
      : null;
  const assistantNativeOutputModel =
    message.role === 'assistant' && assistantDisplayMode === 'native'
      ? buildAssistantNativeMessageOutputModel({
          message,
          draftState,
          renderMessagePart,
          timelineItems: nativeTimelineItems,
        })
      : null;
  const activeAssistantOutputModel =
    assistantDisplayMode === 'native'
      ? assistantNativeOutputModel
      : assistantMessageOutputModel;

  if (message.role !== 'assistant') {
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

  const processGroups = activeAssistantOutputModel?.timelineRenderModel.processGroups || [];
  const hasProcessArtifacts = (activeAssistantOutputModel?.processItems.length || 0) > 0;
  const answerBodyRenderItem = activeAssistantOutputModel?.finalAnswerItem ?? null;
  const hasVisibleContent =
    message.role === 'assistant'
      ? (activeAssistantOutputModel?.hasVisibleContent ?? false)
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
              <div className="chat-message-process-fold-body">{renderProcessGroups(processGroups, message.id, 'fold')}</div>
            </details>
          ) : hasProcessArtifacts ? (
            <div className="chat-message-process-inline">{renderProcessGroups(processGroups, message.id, 'inline')}</div>
          ) : null}
          {answerBodyRenderItem ? (
            <div className="chat-message-bubble chat-message-final-answer">
              <div className="chat-message-content chat-message-content-timeline">
                {answerBodyRenderItem.node}
              </div>
            </div>
          ) : null}
          <AssistantMessageActionBar
            copyText={
              isStreaming
                ? undefined
                : activeAssistantOutputModel?.copyText
            }
          />
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
