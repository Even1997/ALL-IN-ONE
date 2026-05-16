// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useState } from 'react';
import type { ChatSession } from '../../../modules/ai/store/aiChatStore';
import { getAssistantTimelineText } from '../../../modules/ai/store/assistantTimeline';

const formatThreadTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const GNAgentThreadList: React.FC<{
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteSession?: (threadId: string) => void;
}> = ({ sessions, activeSessionId, onSelectThread, onDeleteSession }) => {
  const [query, setQuery] = useState('');
  const orderedSessions = [...sessions].sort(
    (left, right) => right.createdAt - left.createdAt || right.updatedAt - left.updatedAt,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSessions = orderedSessions.filter((session) => {
    if (!normalizedQuery) {
      return true;
    }

    const lastMessage = session.messages[session.messages.length - 1];
    const preview =
      lastMessage?.role === 'assistant'
        ? getAssistantTimelineText(lastMessage.timeline)
        : lastMessage?.content || '';

    return (
      session.title.toLowerCase().includes(normalizedQuery) ||
      preview.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>对话历史</strong>
        <span>{sessions.length} 条</span>
      </div>
      {sessions.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">还没有对话。点击左上角的新对话后，这里会开始积累对话历史。</p>
      ) : (
        <>
          <label className="gn-agent-runtime-search">
            <input
              type="search"
              value={query}
              placeholder="搜索对话历史"
              aria-label="搜索对话历史"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filteredSessions.length === 0 ? (
            <p className="gn-agent-runtime-panel-empty">没有匹配的对话。</p>
          ) : (
            <div className="gn-agent-runtime-panel-list">
              {filteredSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const lastMessage = session.messages[session.messages.length - 1];
                const preview =
                  lastMessage?.role === 'assistant'
                    ? getAssistantTimelineText(lastMessage.timeline)
                    : lastMessage?.content || '';

                return (
                  <article
                    key={session.id}
                    className={`gn-agent-runtime-card ${isActive ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectThread(session.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectThread(session.id);
                      }
                    }}
                  >
                    {onDeleteSession ? (
                      <button
                        type="button"
                        className="gn-agent-runtime-card-delete"
                        aria-label={`删除 ${session.title}`}
                        title="删除"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                    <strong className="gn-agent-thread-title">{session.title}</strong>
                    <span className="gn-agent-thread-preview">{preview.trim() || '空会话'}</span>
                    <code>{formatThreadTime(session.createdAt)}</code>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};
