import React, { useState } from 'react';
import type { StoredChatMessage } from '../../../modules/ai/store/aiChatStore.ts';
import type { StreamingLatencyTrace } from '../../../modules/ai/runtime/streamingLatencyTrace.ts';
import type { AssistantDraftState } from '../../workspace/assistantRenderModel.ts';
import { buildAssistantMessageOutputModel } from '../../workspace/assistantMessageOutputModel.ts';
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
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  timelineItems: Array<{
    key?: string;
    node: React.ReactNode;
    createdAt?: number;
    timelineOrder?: number;
  }>;
  processSummary?: {
    elapsedSeconds?: number;
  } | null;
};

const renderProcessGroups = (
  processGroups: ChatMessageTimelineRenderGroup[],
  messageId: string,
  variant: 'inline',
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
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  timelineItems,
  processSummary: _processSummary,
}: GNAgentMessageItemProps) {
  void _processSummary;
  const content = message.role === 'assistant' ? '' : message.content;
  const assistantOutputModel =
    message.role === 'assistant'
      ? buildAssistantMessageOutputModel({
          message,
          draftState,
          renderMessagePart,
          timelineItems,
        })
      : null;
  const isStreaming = assistantOutputModel?.isStreaming ?? false;
  const nonAssistantRenderItems: ChatMessageTimelineRenderItem[] = [];

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

  const processGroups = assistantOutputModel?.timelineRenderModel.processGroups || [];
  const hasProcessArtifacts = (assistantOutputModel?.processItems.length || 0) > 0;
  const answerBodyRenderItem = assistantOutputModel?.finalAnswerItem ?? null;
  const hasVisibleContent =
    message.role === 'assistant'
      ? (assistantOutputModel?.hasVisibleContent ?? false)
      : nonAssistantRenderItems.length > 0;

  return (
    <article className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
      {message.role === 'assistant' && hasVisibleContent ? (
        <>
          {hasProcessArtifacts ? (
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
                : assistantOutputModel?.copyText
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
