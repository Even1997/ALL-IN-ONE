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
          title={agent.title}
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
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}> = ({ messages, formatTimestamp, parseMessageParts, renderMessagePart, messagesEndRef }) => (
  <div className="chat-message-list">
    {messages.map((message) => {
      const parts = parseMessageParts(message.content);
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
  selectedReferenceFiles: Array<{ id: string; title: string; path: string }>;
  onRemoveReferenceFile: (fileId: string) => void;
  input: string;
  setInput: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  onToggleReferenceMenu: () => void;
  onToggleSkillMenu: () => void;
  selectedRuntimeLabel: string;
  contextUsageLabel: string;
  contextUsageWarning: boolean;
  isLoading: boolean;
  disabled: boolean;
  onSubmit: () => void;
  PlusIcon: React.ComponentType;
  SparkIcon: React.ComponentType;
  SendIcon: React.ComponentType;
  FileIcon: React.ComponentType;
}> = ({
  entrySwitch,
  selectedReferenceFiles,
  onRemoveReferenceFile,
  input,
  setInput,
  textareaRef,
  onKeyDown,
  placeholder,
  onToggleReferenceMenu,
  onToggleSkillMenu,
  selectedRuntimeLabel,
  contextUsageLabel,
  contextUsageWarning,
  isLoading,
  disabled,
  onSubmit,
  PlusIcon,
  SparkIcon,
  SendIcon,
  FileIcon,
}) => (
  <div className="chat-composer">
    <div className="chat-composer-shell">
      {entrySwitch ? <div className="chat-composer-claudian-entry">{entrySwitch}</div> : null}
      <div className="chat-composer-embedded-input">
        {selectedReferenceFiles.length > 0 ? (
          <div className="chat-selected-reference-chips chat-selected-reference-chips-embedded">
            {selectedReferenceFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className="chat-reference-chip compact"
                onClick={() => onRemoveReferenceFile(file.id)}
                title={file.path}
              >
                <FileIcon />
                <span>{file.title}</span>
              </button>
            ))}
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
            <button
              type="button"
              className="chat-composer-plus-btn"
              aria-label="\u4e0a\u4e0b\u6587\u4e0e\u5f15\u7528"
              title="\u4e0a\u4e0b\u6587\u4e0e\u5f15\u7528"
              onClick={onToggleReferenceMenu}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="chat-composer-icon-btn"
              aria-label={'Skill \u83dc\u5355'}
              title={'Skill \u83dc\u5355'}
              onClick={onToggleSkillMenu}
            >
              <SparkIcon />
            </button>
            <div className="chat-composer-meta chat-composer-meta-embedded">
              <span>{selectedRuntimeLabel}</span>
              <span className={contextUsageWarning ? 'warning' : ''}>{contextUsageLabel}</span>
            </div>
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

export const ClaudianReferenceMenu: React.FC<{
  referenceScopeMode: 'current' | 'directory' | 'open-tabs' | 'all';
  onApplyReferenceScope: (mode: 'current' | 'directory' | 'open-tabs' | 'all') => void;
  onRebuildContextIndex: () => void;
  selectedReferenceDirectory: string | null;
  onReferenceDirectoryChange: (value: string) => void;
  availableReferenceDirectories: string[];
  referenceFiles: Array<{ id: string; title: string; path: string }>;
  referencePickerValue: string;
  setReferencePickerValue: (value: string) => void;
  onAddReferenceFile: (id: string) => void;
  openedKnowledgeEntryIds: string[];
  disableRebuild: boolean;
}> = ({
  referenceScopeMode,
  onApplyReferenceScope,
  onRebuildContextIndex,
  selectedReferenceDirectory,
  onReferenceDirectoryChange,
  availableReferenceDirectories,
  referenceFiles,
  referencePickerValue,
  setReferencePickerValue,
  onAddReferenceFile,
  openedKnowledgeEntryIds,
  disableRebuild,
}) => (
  <div className="chat-reference-menu">
    <button
      type="button"
      className={`chat-reference-menu-action ${referenceScopeMode === 'current' ? 'active' : ''}`}
      onClick={() => onApplyReferenceScope('current')}
      disabled={referenceFiles.length === 0}
    >
      {'\u5f15\u7528\u5f53\u524d'}
    </button>
    <button
      type="button"
      className={`chat-reference-menu-action ${referenceScopeMode === 'directory' ? 'active' : ''}`}
      onClick={() => onApplyReferenceScope('directory')}
      disabled={referenceFiles.length === 0}
    >
      {'\u5f15\u7528\u76ee\u5f55'}
    </button>
    <button
      type="button"
      className={`chat-reference-menu-action ${referenceScopeMode === 'open-tabs' ? 'active' : ''}`}
      onClick={() => onApplyReferenceScope('open-tabs')}
      disabled={openedKnowledgeEntryIds.length === 0}
    >
      {'\u5df2\u6253\u5f00\u6587\u6863'}
    </button>
    <button
      type="button"
      className={`chat-reference-menu-action ${referenceScopeMode === 'all' ? 'active' : ''}`}
      onClick={() => onApplyReferenceScope('all')}
      disabled={referenceFiles.length === 0}
    >
      {'\u5f15\u7528\u5168\u90e8'}
    </button>
    <button
      type="button"
      className="chat-reference-menu-action"
      onClick={onRebuildContextIndex}
      disabled={disableRebuild}
    >
      {'\u6574\u7406\u7d22\u5f15'}
    </button>
    <label className="chat-reference-menu-select">
      <span>{'\u76ee\u5f55'}</span>
      <select
        value={selectedReferenceDirectory || ''}
        onChange={(event) => onReferenceDirectoryChange(event.target.value)}
        disabled={availableReferenceDirectories.length === 0}
      >
        <option value="">{'\u9009\u62e9\u76ee\u5f55'}</option>
        {availableReferenceDirectories.map((directory) => (
          <option key={directory} value={directory}>
            {directory}
          </option>
        ))}
      </select>
    </label>
    <label className="chat-reference-menu-select">
      <span>{'\u6587\u4ef6'}</span>
      <select
        value={referencePickerValue}
        onChange={(event) => {
          setReferencePickerValue(event.target.value);
          onAddReferenceFile(event.target.value);
        }}
        disabled={referenceFiles.length === 0}
      >
        <option value="">{'\u6dfb\u52a0\u6587\u4ef6'}</option>
        {referenceFiles.map((file) => (
          <option key={file.id} value={file.id}>
            {`${file.title} / ${file.path}`}
          </option>
        ))}
      </select>
    </label>
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
