import React, { useState } from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

export const GNAgentTurnSummaryCards: React.FC<{
  session: AgentTurnSession | null;
  onRetryTurn?: ((prompt: string) => void) | null;
  onResumeTurn?: ((prompt: string) => void) | null;
  onFeedTurn?: ((prompt: string, guidance: string) => void) | null;
  onPauseTurn?: ((prompt: string) => void) | null;
}> = ({ session, onRetryTurn = null, onResumeTurn = null, onFeedTurn = null, onPauseTurn = null }) => {
  const [feedDraft, setFeedDraft] = useState('');

  if (!session) {
    return null;
  }

  const canFeedTurn =
    Boolean(onFeedTurn) &&
    (session.status === 'resumable' ||
      session.status === 'failed' ||
      session.status === 'waiting_approval' ||
      session.status === 'blocked');
  const canPauseTurn =
    Boolean(onPauseTurn) &&
    (session.status === 'classifying' ||
      session.status === 'planning' ||
      session.status === 'executing' ||
      session.status === 'waiting_approval');

  return (
    <div className="chat-structured-cards gn-agent-turn-summary-cards">
      <section className="chat-structured-card summary">
        <strong>{session.status}</strong>
        <p>{session.plan?.summary || session.userPrompt}</p>
        {canPauseTurn ? (
          <button
            type="button"
            className="gn-agent-runtime-inline-btn"
            onClick={() => onPauseTurn?.(session.userPrompt)}
          >
            Pause turn
          </button>
        ) : null}
      </section>
      {session.executionSteps.slice(-3).map((step) => (
        <section key={step.id} className="chat-structured-card next-step">
          <strong>{step.title}</strong>
          <p>{step.userVisibleDetail || step.resultSummary}</p>
        </section>
      ))}
      {session.resumeSnapshot ? (
        <section className="chat-structured-card conflict">
          <strong>{session.resumeSnapshot.resumeActionLabel || 'Resume available'}</strong>
          <p>{session.resumeSnapshot.resumeReason}</p>
          {onResumeTurn ? (
            <button
              type="button"
              className="gn-agent-runtime-inline-btn"
              onClick={() => onResumeTurn(session.userPrompt)}
            >
              {session.resumeSnapshot.resumeActionLabel || 'Resume turn'}
            </button>
          ) : null}
        </section>
      ) : null}
      {session.status === 'failed' && onRetryTurn ? (
        <section className="chat-structured-card conflict">
          <strong>Retry available</strong>
          <p>Retry the last turn with the same prompt.</p>
          <button
            type="button"
            className="gn-agent-runtime-inline-btn"
            onClick={() => onRetryTurn(session.userPrompt)}
          >
            Retry turn
          </button>
        </section>
      ) : null}
      {canFeedTurn ? (
        <section className="chat-structured-card next-step">
          <strong>Feed guidance</strong>
          <p>Add one more instruction and continue this turn without rewriting the whole request.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!feedDraft.trim() || !onFeedTurn) {
                return;
              }

              onFeedTurn(session.userPrompt, feedDraft.trim());
              setFeedDraft('');
            }}
          >
            <input
              type="text"
              value={feedDraft}
              onChange={(event) => setFeedDraft(event.target.value)}
              placeholder="Add guidance for the current turn"
            />
            <button type="submit" className="gn-agent-runtime-inline-btn" disabled={!feedDraft.trim()}>
              Send guidance
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
};
