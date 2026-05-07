import React from 'react';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

type AgentFloatingPlanCardProps = {
  session: AgentTurnSession | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenInspector: () => void;
};

export const AgentFloatingPlanCard: React.FC<AgentFloatingPlanCardProps> = ({
  session,
  collapsed,
  onToggleCollapsed,
  onOpenInspector,
}) => {
  if (!session?.plan) {
    return null;
  }

  return (
    <section className={`agent-floating-plan-card${collapsed ? ' is-collapsed' : ''}`}>
      <header>
        <div className="agent-floating-plan-head-copy">
          <span className="agent-floating-plan-icon">
            <WorkbenchIcon name="spark" />
          </span>
          <div>
            <strong>进度 / 计划</strong>
            <span>
              {session.plan.steps.length} 步 · {session.plan.riskLevel}
            </span>
          </div>
        </div>
        <button type="button" className="agent-floating-plan-toggle" onClick={onToggleCollapsed}>
          {collapsed ? '展开' : '收起'}
        </button>
      </header>

      {!collapsed ? (
        <div className="agent-floating-plan-body">
          <p>{session.plan.summary}</p>
          <ul>
            {session.plan.steps.slice(0, 3).map((step, index) => (
              <li key={step.id}>
                <span className="agent-floating-plan-step-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.summary}</span>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="agent-floating-plan-action" onClick={onOpenInspector}>
            查看完整详情
          </button>
        </div>
      ) : null}
    </section>
  );
};
