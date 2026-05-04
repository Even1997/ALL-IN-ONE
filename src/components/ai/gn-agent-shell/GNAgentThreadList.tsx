import React from 'react';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { AgentThreadRecord } from '../../../modules/ai/runtime/agentRuntimeTypes';
import { canResumeFromRecovery } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { useProjectStore } from '../../../store/projectStore';

const EMPTY_THREADS: AgentThreadRecord[] = [];

const formatThreadTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const GNAgentThreadList: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const setActiveSession = useAIChatStore((state) => state.setActiveSession);
  const threads = useAgentRuntimeStore((state) =>
    currentProject ? state.threadsByProject[currentProject.id] || EMPTY_THREADS : EMPTY_THREADS
  );
  const recoveryByThread = useAgentRuntimeStore((state) => state.recoveryByThread);
  const requestReplayResumeFromRecovery = useAgentRuntimeStore((state) => state.requestReplayResumeFromRecovery);

  const handleSelectThread = (threadId: string) => {
    if (!currentProject) {
      return;
    }

    setActiveSession(currentProject.id, threadId);
  };

  return (
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
            const recoveryState = recoveryByThread[thread.id];

            return (
              <article
                key={thread.id}
                className="gn-agent-runtime-card"
                role="button"
                tabIndex={0}
                onClick={() => handleSelectThread(thread.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelectThread(thread.id);
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
                      handleSelectThread(thread.id);
                      requestReplayResumeFromRecovery(thread.id, recoveryState);
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
};
