import React from 'react';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';

const toolStatusLabels: Record<RuntimeToolStep['status'], string> = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  blocked: 'blocked',
};

export const GNAgentToolCallPanel: React.FC<{
  toolCalls: RuntimeToolStep[];
}> = ({ toolCalls }) => (
  <section className="gn-agent-runtime-panel">
    <div className="gn-agent-runtime-panel-head">
      <strong>Tools</strong>
      <span>{toolCalls.length} calls</span>
    </div>
    {toolCalls.length === 0 ? (
      <p className="gn-agent-runtime-panel-empty">No tool calls have been recorded for this thread yet.</p>
    ) : (
      <div className="gn-agent-runtime-panel-list">
        {toolCalls.map((toolCall) => (
          <article key={toolCall.id} className="gn-agent-runtime-card">
            <strong>{toolCall.name}</strong>
            <span>{toolCall.resultPreview || 'Waiting for tool result...'}</span>
            <code>{toolStatusLabels[toolCall.status]}</code>
          </article>
        ))}
      </div>
    )}
  </section>
);
