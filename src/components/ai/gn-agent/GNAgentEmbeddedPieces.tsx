import React from 'react';
import type { ChatSession, StoredChatMessage } from '../../../modules/ai/store/aiChatStore';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';

type MessagePartRenderer = (messageId: string, part: AIChatMessagePart, index: number) => React.ReactNode;
type MessagePartsParser = (content: string) => AIChatMessagePart[];

export const GNAgentHistoryMenu: React.FC<{
  sessions: ChatSession[];
  activeSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  buildSessionPreview: (content: string) => string;
}> = ({ sessions, activeSessionId, onCreateSession, onSelectSession, buildSessionPreview }) => (
  <div className="chat-history-menu">
    <button className="chat-history-new-btn" type="button" onClick={onCreateSession}>
      {'\u65b0\u5efa\u5bf9\u8bdd'}
    </button>
    <div className="chat-history-menu-list">
      {sessions.map((session) => {
        const lastMessage = session.messages[session.messages.length - 1];
        return (
          <button
            key={session.id}
            type="button"
            className={`chat-history-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <strong>{session.title}</strong>
            <span>{lastMessage ? buildSessionPreview(lastMessage.content) : '\u7a7a\u4f1a\u8bdd'}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export const GNAgentMessageList: React.FC<{
  messages: StoredChatMessage[];
  draftContents?: Record<string, string>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  renderKnowledgeProposal?: (message: StoredChatMessage) => React.ReactNode;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: React.ReactNode;
}> = ({
  messages,
  draftContents,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  renderKnowledgeProposal,
  messagesEndRef,
  leadingContent,
}) => (
  <div className="chat-message-list">
    {leadingContent}
    {messages.map((message) => {
      const content = draftContents?.[message.id] ?? message.content;
      const parts = parseMessageParts(content);
      return (
        <article
          key={message.id}
          className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}
        >
          <div className="chat-message-bubble">
            <div className="chat-message-content">
              {parts.map((part, index) => renderMessagePart(message.id, part, index))}
              {renderKnowledgeProposal ? renderKnowledgeProposal(message) : null}
            </div>
            <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
          </div>
        </article>
      );
    })}
    <div ref={messagesEndRef} />
  </div>
);

export const GNAgentEmbeddedComposer: React.FC<{
  entrySwitch?: React.ReactNode;
  input: string;
  setInput: (value: string) => void;
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
  input,
  setInput,
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
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="chat-composer-input chat-composer-input-embedded"
          rows={1}
        />

        <div className="chat-composer-embedded-toolbar">
          <div className="chat-composer-embedded-toolbar-start">
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

        <div className="chat-composer-hints">
          <span>Enter 发送</span>
          <span>Shift + Enter 换行</span>
          <span>用 @skill 精准触发能力</span>
        </div>
      </div>
    </div>
  </div>
);

export const GNAgentActivityPanel: React.FC<{
  activityEntries: ActivityEntry[];
  formatTimestamp: (value: number) => string;
}> = ({ activityEntries, formatTimestamp }) => (
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
                <code key={changedPath}>{changedPath}</code>
              ))}
            </div>
          ) : null}
        </article>
      ))}
      {activityEntries.length === 0 ? <div className="chat-panel-note">还没有可记录的操作日志。</div> : null}
    </div>
  </div>
);
