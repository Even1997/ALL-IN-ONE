import React from 'react';
import type { ChatAgentId } from '../../../modules/ai/chat/chatAgents';
import { CHAT_AGENTS } from '../../../modules/ai/chat/chatAgents';
import type { ChatSession, StoredChatMessage } from '../../../modules/ai/store/aiChatStore';
import type { ActivityEntry } from '../../../modules/ai/skills/activityLog';
import type { SkillDiscoveryEntry } from '../../../modules/ai/skills/skillLibrary';
import type { AIChatMessagePart } from '../../workspace/aiChatMessageParts';

type AgentIconRenderer = (agentId: ChatAgentId) => React.ReactNode;
type MessagePartRenderer = (messageId: string, part: AIChatMessagePart, index: number) => React.ReactNode;
type MessagePartsParser = (content: string) => AIChatMessagePart[];
type AgentAvailabilityMap = Record<ChatAgentId, { ready: boolean; title: string }>;

export const ClaudianHistoryMenu: React.FC<{
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

export const ClaudianEmbeddedTopbar: React.FC<{
  selectedChatAgentId: ChatAgentId;
  setSelectedChatAgentId: (id: ChatAgentId) => void;
  agentAvailability: AgentAvailabilityMap;
  renderAgentIcon: AgentIconRenderer;
  onToggleHistory: () => void;
  onCreateSession: () => void;
  onOpenSettings: () => void;
  historyMenu: React.ReactNode;
  HistoryIcon: React.ComponentType;
  ComposeIcon: React.ComponentType;
  SettingsIcon: React.ComponentType;
}> = ({
  selectedChatAgentId,
  setSelectedChatAgentId,
  agentAvailability,
  renderAgentIcon,
  onToggleHistory,
  onCreateSession,
  onOpenSettings,
  historyMenu,
  HistoryIcon,
  ComposeIcon,
  SettingsIcon,
}) => (
  <div className="chat-composer-embedded-topbar">
    <div className="chat-shell-agent-tabs" role="tablist" aria-label="AI agent">
      {CHAT_AGENTS.map((agent) => (
        <button
          key={agent.id}
          type="button"
          role="tab"
          aria-label={agent.label}
          aria-selected={agent.id === selectedChatAgentId}
          className={`chat-agent-tab ${agent.id === selectedChatAgentId ? 'active' : ''}`}
          title={agentAvailability[agent.id].title}
          disabled={agent.id !== 'built-in' && !agentAvailability[agent.id].ready}
          onClick={() => setSelectedChatAgentId(agent.id)}
        >
          {renderAgentIcon(agent.id)}
        </button>
      ))}
    </div>
    <div className="chat-composer-embedded-actions">
      <button
        className="chat-shell-icon-btn"
        type="button"
        aria-label="\u5386\u53f2\u4f1a\u8bdd"
        title="\u5386\u53f2\u4f1a\u8bdd"
        onClick={onToggleHistory}
      >
        <HistoryIcon />
      </button>
      <button
        className="chat-shell-icon-btn"
        type="button"
        aria-label="\u65b0\u5bf9\u8bdd"
        title="\u65b0\u5bf9\u8bdd"
        onClick={onCreateSession}
      >
        <ComposeIcon />
      </button>
      <button
        className="chat-shell-icon-btn"
        type="button"
        aria-label="\u8bbe\u7f6e"
        title="\u8bbe\u7f6e"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
      {historyMenu}
    </div>
  </div>
);

export const ClaudianMessageList: React.FC<{
  messages: StoredChatMessage[];
  draftContents?: Record<string, string>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: React.ReactNode;
}> = ({
  messages,
  draftContents,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
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
            </div>
            <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
          </div>
        </article>
      );
    })}
    <div ref={messagesEndRef} />
  </div>
);

export const ClaudianEmbeddedComposer: React.FC<{
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
      {entrySwitch ? <div className="chat-composer-claudian-entry">{entrySwitch}</div> : null}
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

export const ClaudianSkillsPanel: React.FC<{
  skillsState: 'idle' | 'loading' | 'ready' | 'error';
  skillsMessage: string;
  githubSkillRepo: string;
  setGithubSkillRepo: (value: string) => void;
  githubSkillPath: string;
  setGithubSkillPath: (value: string) => void;
  githubSkillRef: string;
  setGithubSkillRef: (value: string) => void;
  onImportGitHubSkill: (event: React.FormEvent<HTMLFormElement>) => void;
  skills: SkillDiscoveryEntry[];
  onImportSkill: (skill: SkillDiscoveryEntry) => void;
  onSyncSkill: (skill: SkillDiscoveryEntry, runtime: 'codex' | 'claude') => void;
}> = ({
  skillsState,
  skillsMessage,
  githubSkillRepo,
  setGithubSkillRepo,
  githubSkillPath,
  setGithubSkillPath,
  githubSkillRef,
  setGithubSkillRef,
  onImportGitHubSkill,
  skills,
  onImportSkill,
  onSyncSkill,
}) => (
  <div className="chat-skill-library">
    <div className="chat-panel-header">
      <strong>Skills</strong>
      <span>发现本机可导入技能，并纳入 `.goodnight/skills`。</span>
    </div>
    {skillsState === 'loading' ? <div className="chat-panel-note">正在扫描本机 skills...</div> : null}
    {skillsMessage ? <div className="chat-panel-note">{skillsMessage}</div> : null}
    <form className="chat-skill-github-form" onSubmit={onImportGitHubSkill}>
      <label>
        <span>GitHub Repo</span>
        <input value={githubSkillRepo} onChange={(event) => setGithubSkillRepo(event.target.value)} placeholder="owner/repo" />
      </label>
      <label>
        <span>Skill Path</span>
        <input value={githubSkillPath} onChange={(event) => setGithubSkillPath(event.target.value)} placeholder="skills/my-skill" />
      </label>
      <label>
        <span>Git Ref</span>
        <input value={githubSkillRef} onChange={(event) => setGithubSkillRef(event.target.value)} placeholder="main" />
      </label>
      <button type="submit">Import from GitHub</button>
    </form>
    <div className="chat-skill-list">
      {skills.map((skill) => (
        <article key={`${skill.id}:${skill.path}`} className="chat-skill-card">
          <div className="chat-skill-card-copy">
            <strong>{skill.name}</strong>
            <span>{skill.source}</span>
            <small>{skill.path}</small>
            <div className="chat-skill-sync-row">
              <span>{skill.syncedToCodex ? 'Codex synced' : 'Codex not synced'}</span>
              <span>{skill.syncedToClaude ? 'Claude synced' : 'Claude not synced'}</span>
            </div>
          </div>
          <div className="chat-skill-card-actions">
            <button type="button" onClick={() => onImportSkill(skill)} disabled={skill.imported}>
              {skill.imported ? '已导入' : 'Import'}
            </button>
            <button type="button" onClick={() => onSyncSkill(skill, 'codex')} disabled={!skill.imported}>
              Sync to Codex
            </button>
            <button type="button" onClick={() => onSyncSkill(skill, 'claude')} disabled={!skill.imported}>
              Sync to Claude
            </button>
          </div>
        </article>
      ))}
      {skillsState === 'ready' && skills.length === 0 ? <div className="chat-panel-note">当前没有发现可导入的本机技能。</div> : null}
    </div>
  </div>
);

export const ClaudianActivityPanel: React.FC<{
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
