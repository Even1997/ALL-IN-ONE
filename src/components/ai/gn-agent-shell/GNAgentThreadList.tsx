import React from 'react';
import type { AgentThreadRecord } from '../../../modules/ai/runtime/agentRuntimeTypes';
import {
  canResumeFromRecovery,
  type AgentReplayRecoveryState,
} from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';

const formatThreadTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const GNAgentThreadList: React.FC<{
  threads: AgentThreadRecord[];
  activeSessionId: string | null;
  recoveryByThread: Record<string, AgentReplayRecoveryState | undefined>;
  onSelectThread: (threadId: string) => void;
  onResumeThread: (threadId: string, recoveryState: AgentReplayRecoveryState) => void;
}> = ({ threads, activeSessionId, recoveryByThread, onSelectThread, onResumeThread }) => (
  <section className="gn-agent-runtime-panel">
    <div className="gn-agent-runtime-panel-head">
      <strong>Threads</strong>
      <span>{threads.length} active</span>
    </div>
    {threads.length === 0 ? (
      <p className="gn-agent-runtime-panel-empty">还没有 runtime thread。开始一次对话后会在这里出现。</p>
    ) : (
      <div className="gn-agent-runtime-panel-list">
        {threads.slice(0, 6).map((thread) => {
          const recoveryState = recoveryByThread[thread.id] || null;
          const isActive = thread.id === activeSessionId;

          return (
            <article
              key={thread.id}
              className={`gn-agent-runtime-card ${isActive ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectThread(thread.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectThread(thread.id);
                }
              }}
            >
              <strong>{thread.title}</strong>
              <span>{thread.providerId}</span>
              <code>{formatThreadTime(thread.updatedAt)}</code>
              {canResumeFromRecovery(recoveryState) ? (
                <button
                  type="button"
                  className="gn-agent-runtime-inline-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (recoveryState) {
                      onResumeThread(thread.id, recoveryState);
                    }
                  }}
                >
                  {recoveryState?.resumeActionLabel || '恢复继续'}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    )}
  </section>
);
