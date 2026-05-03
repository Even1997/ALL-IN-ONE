import React, { useState } from 'react';
import type { ChatSession, StoredChatMessage } from '../../../modules/ai/store/aiChatStore';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import { buildAssistantMessageParts, type AIChatMessagePart } from '../../workspace/aiChatMessageParts';

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
  | { kind: 'thinking_lane'; key: string; node: React.ReactNode; sourcePart?: AIChatMessagePart }
  | { kind: 'bubble_part'; key: string; node: React.ReactNode; sourcePart?: AIChatMessagePart }
  | { kind: 'bubble_card'; key: string; node: React.ReactNode };

const normalizeAssistantCopy = (value: string) => value.replace(/\s+/g, ' ').trim();

const shouldSuppressAssistantTextPart = (message: StoredChatMessage, part: AIChatMessagePart, cardCount: number) => {
  if (message.role !== 'assistant' || part.type !== 'text' || cardCount === 0) {
    return false;
  }

  if (message.projectFileProposal || message.runtimeQuestion) {
    return true;
  }

  const hasRuntimeCards = Boolean(message.toolCalls?.length || message.runtimeEvents?.length);
  if (!hasRuntimeCards) {
    return false;
  }

  const normalized = normalizeAssistantCopy(part.content);
  if (!normalized) {
    return true;
  }

  return normalized.length <= 120;
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
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
};

export const GNAgentHistoryMenu: React.FC<{
  sessions: ChatSession[];
  activeSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  buildSessionPreview: (content: string) => string;
}> = ({ sessions, activeSessionId, onCreateSession, onSelectSession, onDeleteSession, buildSessionPreview }) => (
  <div className="chat-history-menu">
    <button className="chat-history-new-btn" type="button" onClick={onCreateSession}>
      {'\u65b0\u5efa\u5bf9\u8bdd'}
    </button>
    <div className="chat-history-menu-list">
      {sessions.map((session) => {
        const lastMessage = session.messages?.[session.messages.length - 1];
        return (
          <div
            key={session.id}
            className={`chat-history-item ${session.id === activeSessionId ? 'active' : ''}`}
          >
            <button
              type="button"
              className="chat-history-item-main"
              onClick={() => onSelectSession(session.id)}
            >
              <strong>{session.title}</strong>
              <span>{lastMessage ? buildSessionPreview(lastMessage.content) : '\u7a7a\u4f1a\u8bdd'}</span>
            </button>
            {onDeleteSession && (
              <button
                type="button"
                className="chat-history-item-delete"
                title="\u5220\u9664\u5bf9\u8bdd"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export const GNAgentMessageList: React.FC<{
  messages: StoredChatMessage[];
  draftContents?: Record<string, { content: string; thinkingContent: string; answerContent: string; assistantParts: AIChatMessagePart[] }>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  renderStructuredCards?: (message: StoredChatMessage) => React.ReactNode;
  renderKnowledgeProposal?: (message: StoredChatMessage) => React.ReactNode;
  renderProjectFileProposal?: (message: StoredChatMessage) => React.ReactNode;
  renderToolExecutionCard?: (message: StoredChatMessage) => React.ReactNode;
  renderRunSummaryCard?: (message: StoredChatMessage) => React.ReactNode;
  renderRuntimeApproval?: (message: StoredChatMessage) => React.ReactNode;
  renderRuntimeQuestion?: (message: StoredChatMessage) => React.ReactNode;
  listRef?: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: React.ReactNode;
}> = ({
  messages,
  draftContents,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  renderStructuredCards,
  renderKnowledgeProposal,
  renderProjectFileProposal,
  renderToolExecutionCard,
  renderRunSummaryCard,
  renderRuntimeApproval,
  renderRuntimeQuestion,
  listRef,
  messagesEndRef,
  leadingContent,
}) => {
  const [expandedThinkingKeys, setExpandedThinkingKeys] = useState<Record<string, boolean>>({});

  return (
    <div ref={listRef} className="chat-message-list">
      {leadingContent}
      {messages.map((message) => {
      const draftState = draftContents?.[message.id];
      const content = draftState?.content ?? message.content;
      const isStreaming = Boolean(draftState);
      const parts =
        message.role === 'assistant'
          ? buildAssistantMessageParts({
              content,
              assistantParts: draftState?.assistantParts ?? (message.assistantParts as AIChatMessagePart[] | undefined),
              thinkingContent: draftState?.thinkingContent ?? message.thinkingContent,
              answerContent: draftState?.answerContent ?? message.answerContent,
              thinkingCollapsed: isStreaming ? false : undefined,
            })
          : parseMessageParts(content);
      const assistantCopyText =
        message.role === 'assistant'
          ? (draftState?.answerContent ?? message.answerContent ?? content).trim()
          : undefined;
      const renderItems: MessageRenderItem[] = [];

      parts.forEach((part, index) => {
        const thinkingKey = `${message.id}-thinking-${index}`;
        const thinkingExpanded =
          part.type === 'thinking' ? (isStreaming ? true : expandedThinkingKeys[thinkingKey] ?? false) : undefined;
        const renderOptions = {
          content,
          isStreaming,
          thinkingExpanded,
          onToggleThinking:
            part.type === 'thinking' && !isStreaming
              ? () =>
                  setExpandedThinkingKeys((current) => ({
                    ...current,
                    [thinkingKey]: !(current[thinkingKey] ?? false),
                  }))
              : undefined,
        };
        renderItems.push({
          kind: message.role === 'assistant' && part.type === 'thinking' ? 'thinking_lane' : 'bubble_part',
          key: `${message.id}-part-${index}`,
          node: renderMessagePart(message, message.id, part, index, renderOptions),
          sourcePart: part,
        });
      });

      [
        renderStructuredCards?.(message),
        renderKnowledgeProposal?.(message),
        renderProjectFileProposal?.(message),
        renderToolExecutionCard?.(message),
        renderRunSummaryCard?.(message),
        renderRuntimeApproval?.(message),
        renderRuntimeQuestion?.(message),
      ].forEach((node, index) => {
        if (!node) {
          return;
        }

        renderItems.push({
          kind: 'bubble_card',
          key: `${message.id}-card-${index}`,
          node,
        });
      });

      const bubbleCardCount = renderItems.filter((item) => item.kind === 'bubble_card').length;
      const filteredRenderItems = renderItems.filter((item) => {
        if (item.kind !== 'bubble_part') {
          return true;
        }

        const part = item.sourcePart;
        return part ? !shouldSuppressAssistantTextPart(message, part, bubbleCardCount) : true;
      });

      const thinkingItems = filteredRenderItems.filter((item) => item.kind === 'thinking_lane');
      const bubbleItems = filteredRenderItems.filter((item) => item.kind !== 'thinking_lane');
      return (
        <article
          key={message.id}
          className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}
        >
          {thinkingItems.length > 0 ? (
            <div className="chat-message-thinking-lane">
              {thinkingItems.map((item) => (
                <React.Fragment key={item.key}>{item.node}</React.Fragment>
              ))}
            </div>
          ) : null}
          {bubbleItems.length > 0 ? (
            <div className="chat-message-bubble">
              <div className="chat-message-content">
                {bubbleItems.map((item) => (
                  <React.Fragment key={item.key}>{item.node}</React.Fragment>
                ))}
              </div>
              {message.role === 'assistant' ? (
                <AssistantMessageActionBar copyText={isStreaming ? undefined : assistantCopyText} />
              ) : null}
              <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
            </div>
          ) : (
            <div className="chat-message-meta chat-message-meta-standalone">{formatTimestamp(message.createdAt)}</div>
          )}
        </article>
      );
    })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export const GNAgentEmbeddedComposer: React.FC<{
  entrySwitch?: React.ReactNode;
  topContent?: React.ReactNode;
  toolbarStartContent?: React.ReactNode;
  input: string;
  setInput: (value: string) => void;
  onInputChange?: (value: string, cursorPos: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  agentStatusLabel?: string;
  selectedRuntimeLabel: string;
  contextUsageLabel: string;
  contextUsageWarning: boolean;
  runStateLabel?: string;
  runStateTone?: string;
  isLoading: boolean;
  disabled: boolean;
  onSubmit: () => void;
  SendIcon: React.ComponentType;
}> = ({
  entrySwitch,
  topContent,
  toolbarStartContent,
  input,
  setInput,
  onInputChange,
  textareaRef,
  onKeyDown,
  placeholder,
  agentStatusLabel,
  selectedRuntimeLabel,
  contextUsageLabel,
  contextUsageWarning,
  runStateLabel,
  runStateTone,
  isLoading,
  disabled,
  onSubmit,
  SendIcon,
}) => (
  <div className="chat-composer">
    <div className="chat-composer-shell">
      {entrySwitch ? <div className="chat-composer-gn-agent-entry">{entrySwitch}</div> : null}
      <div className="chat-composer-embedded-input">
        {topContent}
        {agentStatusLabel ? (
          <div className="chat-composer-runtime-strip" aria-label="GN Agent status">
            <span>{agentStatusLabel}</span>
            <span>{selectedRuntimeLabel}</span>
            <span className={contextUsageWarning ? 'warning' : ''}>{contextUsageLabel}</span>
            {runStateLabel ? <span className={runStateTone || ''}>{runStateLabel}</span> : null}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => {
            if (onInputChange) {
              onInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length);
              return;
            }

            setInput(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="chat-composer-input chat-composer-input-embedded"
          rows={1}
        />

        <div className="chat-composer-embedded-toolbar">
          <div className="chat-composer-embedded-toolbar-start">
            {toolbarStartContent}
            {!agentStatusLabel ? (
              <div className="chat-composer-meta chat-composer-meta-embedded">
                <span>{selectedRuntimeLabel}</span>
                <span className={contextUsageWarning ? 'warning' : ''}>{contextUsageLabel}</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="chat-send-btn"
            aria-label={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
            title={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
            disabled={disabled}
            onClick={onSubmit}
          >
            <SendIcon />
          </button>
        </div>

      </div>
    </div>
  </div>
);

export const GNAgentActivityPanel: React.FC<{
  activityEntries: ActivityEntry[];
  formatTimestamp: (value: number) => string;
  onOpenChangedPath?: (path: string) => void;
}> = ({ activityEntries, formatTimestamp, onOpenChangedPath }) => (
  <div className="chat-activity-log">
    <div className="chat-panel-header">
      <strong>Activity Log</strong>
      <span>只记录真实改动、产物落地和失败节点。</span>
    </div>
    <div className="chat-activity-list">
      {activityEntries.map((entry) => (
        <article key={entry.id} className="chat-activity-entry">
          <div className="chat-activity-entry-head">
            <strong>{entry.summary}</strong>
            <span>{formatTimestamp(entry.createdAt)}</span>
          </div>
          <div className="chat-activity-entry-meta">
            <span>{entry.type}</span>
            {entry.skill ? <span>{entry.skill}</span> : null}
          </div>
          {entry.changedPaths.length > 0 ? (
            <div className="chat-activity-entry-paths">
              {entry.changedPaths.map((changedPath) => (
                onOpenChangedPath ? (
                  <button
                    key={changedPath}
                    type="button"
                    className="chat-activity-entry-path-btn"
                    onClick={() => onOpenChangedPath(changedPath)}
                    title={changedPath}
                  >
                    {changedPath}
                  </button>
                ) : (
                  <code key={changedPath}>{changedPath}</code>
                )
              ))}
            </div>
          ) : null}
        </article>
      ))}
      {activityEntries.length === 0 ? <div className="chat-panel-note">还没有可记录的操作日志。</div> : null}
    </div>
  </div>
);
