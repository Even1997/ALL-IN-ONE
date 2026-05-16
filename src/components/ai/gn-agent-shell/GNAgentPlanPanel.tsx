// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

export const GNAgentPlanPanel: React.FC<{
  session: AgentTurnSession | null;
}> = ({ session }) => {
  if (!session?.plan) {
    return (
      <section className="gn-agent-runtime-panel">
        <div className="gn-agent-runtime-panel-head">
          <strong>Plan</strong>
          <span>empty</span>
        </div>
        <p className="gn-agent-runtime-panel-empty">No structured plan for the current turn yet.</p>
      </section>
    );
  }

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Plan</strong>
        <span>{session.plan.riskLevel}</span>
      </div>
      <div className="gn-agent-runtime-panel-list">
        <article className="gn-agent-runtime-card">
          <strong>{session.plan.summary}</strong>
          <span>{session.plan.reason}</span>
        </article>
        {session.plan.steps.map((step) => (
          <article key={step.id} className="gn-agent-runtime-card">
            <strong>{step.title}</strong>
            <span>{step.summary}</span>
            <code>{step.needsApproval ? 'approval' : 'auto'}</code>
          </article>
        ))}
      </div>
    </section>
  );
};
