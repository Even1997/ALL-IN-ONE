import React from 'react';
import type { AgentMemoryCandidate } from '../../../modules/ai/runtime/agentRuntimeStore';

type GNAgentMemoryInboxProps = {
  candidates: AgentMemoryCandidate[];
  onSave: (candidate: AgentMemoryCandidate) => void | Promise<void>;
  onDismiss: (candidateId: string) => void;
  message?: string | null;
};

const kindLabel: Record<AgentMemoryCandidate['kind'], string> = {
  projectFact: 'projectFact',
  userPreference: 'userPreference',
};

export const GNAgentMemoryInbox: React.FC<GNAgentMemoryInboxProps> = ({
  candidates,
  onSave,
  onDismiss,
  message,
}) => {
  const pendingCandidates = candidates.filter((candidate) => candidate.status === 'pending');

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Memory Inbox</strong>
        <span>{pendingCandidates.length} pending</span>
      </div>
      {message ? <p className="gn-agent-runtime-panel-empty">{message}</p> : null}
      {pendingCandidates.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">No pending memory suggestions.</p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {pendingCandidates.map((candidate) => (
            <article key={candidate.id} className="gn-agent-runtime-card">
              <strong>{candidate.title}</strong>
              <span>{candidate.summary}</span>
              <code>{kindLabel[candidate.kind]}</code>
              <div className="gn-agent-runtime-card-actions">
                <button type="button" onClick={() => onSave(candidate)}>
                  保存
                </button>
                <button type="button" onClick={() => onDismiss(candidate.id)}>
                  忽略
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
