import React from 'react';
import type { AgentContextSnapshot } from '../../../modules/ai/runtime/context/agentContextTypes';

export const GNAgentContextPanel: React.FC<{
  context: AgentContextSnapshot | null;
}> = ({ context }) => {
  const budget = context?.budget || null;
  const contextSections = context?.sections || [];

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Context</strong>
        {budget ? (
          <span>
            {budget.usedTokens}/{budget.limitTokens} tokens
          </span>
        ) : (
          <span>no snapshot</span>
        )}
      </div>
      {!context ? (
        <p className="gn-agent-runtime-panel-empty">No context snapshot has been built for this thread yet.</p>
      ) : contextSections.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">This context snapshot does not include any sections.</p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {contextSections.map((section) => {
            const status = section.included ? 'included' : 'excluded';

            return (
              <article key={section.id} className="gn-agent-runtime-card">
                <strong>{section.title}</strong>
                <span>{section.sourceLabel}</span>
                <code>{status}</code>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
