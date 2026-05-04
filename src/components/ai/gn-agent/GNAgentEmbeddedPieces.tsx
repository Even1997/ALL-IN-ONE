import React from 'react';
import type { ChatSession, StoredChatMessage } from '../../../modules/ai/store/aiChatStore';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';
import { GNAgentMessageItem } from './GNAgentMessageItem';

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
        const lastPreviewSource =
          lastMessage?.role === 'assistant'
            ? lastMessage.answerContent || lastMessage.thinkingContent || lastMessage.content
            : lastMessage?.content || '';
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
              <span>{lastMessage ? buildSessionPreview(lastPreviewSource) : '\u7a7a\u4f1a\u8bdd'}</span>
            </button>
            {onDeleteSession && (
              <button
                type="button"
                className="chat-history-item-delete"
                title="\u5220\u9664\u5bf9\u8bdd"
                onClick={(event) => {
                  event.stopPropagation();
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

type GNAgentMessageListProps = {
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
};

const areMessageListPropsEqual = (
  prev: GNAgentMessageListProps,
  next: GNAgentMessageListProps
) => {
  const prevLen = prev.messages.length;
  const nextLen = next.messages.length;
  if (prevLen !== nextLen) return false;
  if (prevLen > 0 && prev.messages[0].id !== next.messages[0].id) return false;
  if (prevLen > 0 && prev.messages[prevLen - 1].id !== next.messages[nextLen - 1].id) return false;
  if (prev.draftContents !== next.draftContents) return false;
  if (prev.renderMessagePart !== next.renderMessagePart) return false;
  if (prev.renderStructuredCards !== next.renderStructuredCards) return false;
  if (prev.renderKnowledgeProposal !== next.renderKnowledgeProposal) return false;
  if (prev.renderProjectFileProposal !== next.renderProjectFileProposal) return false;
  if (prev.renderToolExecutionCard !== next.renderToolExecutionCard) return false;
  if (prev.renderRunSummaryCard !== next.renderRunSummaryCard) return false;
  if (prev.renderRuntimeApproval !== next.renderRuntimeApproval) return false;
  if (prev.renderRuntimeQuestion !== next.renderRuntimeQuestion) return false;
  if (prev.formatTimestamp !== next.formatTimestamp) return false;
  if (prev.parseMessageParts !== next.parseMessageParts) return false;
  if (prev.leadingContent !== next.leadingContent) return false;
  return true;
};

export const GNAgentMessageList = React.memo(function GNAgentMessageList({
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
}: GNAgentMessageListProps) {
  const bubbleCardsByMessage = React.useMemo(() => {
    const map: Record<string, React.ReactNode[]> = {};
    for (const message of messages) {
      map[message.id] = [
        renderStructuredCards?.(message),
        renderKnowledgeProposal?.(message),
        renderProjectFileProposal?.(message),
        renderToolExecutionCard?.(message),
        renderRunSummaryCard?.(message),
        renderRuntimeApproval?.(message),
        renderRuntimeQuestion?.(message),
      ].filter((node): node is React.ReactNode => Boolean(node));
    }
    return map;
  }, [
    messages,
    renderStructuredCards,
    renderKnowledgeProposal,
    renderProjectFileProposal,
    renderToolExecutionCard,
    renderRunSummaryCard,
    renderRuntimeApproval,
    renderRuntimeQuestion,
  ]);

  const FOLD_THRESHOLD = 30;
  const KEEP_VISIBLE = 10;
  const shouldFold = messages.length > FOLD_THRESHOLD;
  const foldCount = shouldFold ? messages.length - KEEP_VISIBLE : 0;

  const renderMessageItem = (message: StoredChatMessage) => (
    <GNAgentMessageItem
      key={message.id}
      message={message}
      draftState={draftContents?.[message.id]}
      formatTimestamp={formatTimestamp}
      parseMessageParts={parseMessageParts}
      renderMessagePart={renderMessagePart}
      bubbleCards={bubbleCardsByMessage[message.id] ?? []}
    />
  );

  return (
    <div ref={listRef} className="chat-message-list">
      {leadingContent}
      {shouldFold ? (
        <details className="chat-message-list-fold">
          <summary>{`Show earlier ${foldCount} messages`}</summary>
          {messages.slice(0, foldCount).map(renderMessageItem)}
        </details>
      ) : null}
      {messages.slice(foldCount).map(renderMessageItem)}
      <div ref={messagesEndRef} />
    </div>
  );
}, areMessageListPropsEqual);

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
      <span>{'\u53ea\u8bb0\u5f55\u771f\u5b9e\u6539\u52a8\u3001\u4ea7\u7269\u843d\u5730\u548c\u5931\u8d25\u8282\u70b9\u3002'}</span>
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
              {entry.changedPaths.map((changedPath) =>
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
              )}
            </div>
          ) : null}
        </article>
      ))}
      {activityEntries.length === 0 ? <div className="chat-panel-note">{'\u8fd8\u6ca1\u6709\u53ef\u8bb0\u5f55\u7684\u64cd\u4f5c\u65e5\u5fd7\u3002'}</div> : null}
    </div>
  </div>
);
