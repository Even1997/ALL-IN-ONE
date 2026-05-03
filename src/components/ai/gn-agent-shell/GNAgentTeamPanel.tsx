import React from 'react';
import { useAIChatStore } from '../../../modules/ai/store/aiChatStore';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { useProjectStore } from '../../../store/projectStore';

const formatPreview = (value: string | null | undefined, fallback: string, maxLength = 220) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() || '';
  if (!normalized) {
    return fallback;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const phaseLabelMap: Record<string, string> = {
  product_architecture: '产品/架构',
  ui_interaction: 'UI/交互',
  implementation: '实现',
  qa_review: 'QA/Review',
};

export const GNAgentTeamPanel: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const activeSessionId = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
  );
  const latestTeamRun = useAgentRuntimeStore((state) =>
    activeSessionId ? state.teamRunsByThread[activeSessionId]?.[0] || null : null
  );

  if (!latestTeamRun) {
    return (
      <section className="gn-agent-runtime-panel">
        <div className="gn-agent-runtime-panel-head">
          <strong>Team Run</strong>
          <span>idle</span>
        </div>
        <p className="gn-agent-runtime-panel-empty">Choose the Team agent to see the staged multi-agent delivery run.</p>
      </section>
    );
  }

  const completedMembers = latestTeamRun.members.filter((member) => member.status === 'completed').length;
  const failedMembers = latestTeamRun.members.filter((member) => member.status === 'failed').length;
  const runningMembers = latestTeamRun.members.filter((member) => member.status === 'running').length;
  const pendingMembers = latestTeamRun.members.filter((member) => member.status === 'pending').length;

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Team Run</strong>
        <span>{latestTeamRun.status}</span>
      </div>
      <div className="gn-agent-runtime-panel-list">
        <article className="gn-agent-runtime-card">
          <strong>{latestTeamRun.summary}</strong>
          <span>{latestTeamRun.strategy}</span>
        </article>
        <article className="gn-agent-runtime-card">
          <strong>Task Summary</strong>
          <span>
            总计 {latestTeamRun.members.length} · 运行中 {runningMembers} · 待处理 {pendingMembers} · 已完成{' '}
            {completedMembers} · 失败 {failedMembers}
          </span>
        </article>
        {latestTeamRun.phases.map((phase) => {
          const members = latestTeamRun.members.filter((member) => member.phaseId === phase.id);

          return (
            <details key={phase.id} className="gn-agent-runtime-card gn-agent-runtime-details" open>
              <summary className="gn-agent-runtime-details-summary">
                <strong>{phase.title}</strong>
                <span>
                  {phaseLabelMap[phase.id] || phase.id} · {members.length} tasks · {phase.status}
                </span>
              </summary>
              <span>{phase.goal}</span>
              {members.map((member) => (
                <details key={member.id} className="gn-agent-runtime-subcard gn-agent-runtime-details">
                  <summary className="gn-agent-runtime-details-summary">
                    <strong>{member.title}</strong>
                    <span>
                      {member.agentId} · {member.status}
                    </span>
                  </summary>
                  <span>{formatPreview(member.error || member.result, 'No member output yet.')}</span>
                  {member.error || member.result ? (
                    <pre className="gn-agent-runtime-pre">{member.error || member.result}</pre>
                  ) : null}
                </details>
              ))}
            </details>
          );
        })}
        <details className="gn-agent-runtime-card gn-agent-runtime-details">
          <summary className="gn-agent-runtime-details-summary">
            <strong>Coordinator Summary</strong>
            <span>{latestTeamRun.finalSummary ? 'ready' : 'pending'}</span>
          </summary>
          <span>{formatPreview(latestTeamRun.finalSummary, 'No final synthesis yet.', 260)}</span>
          {latestTeamRun.finalSummary ? <pre className="gn-agent-runtime-pre">{latestTeamRun.finalSummary}</pre> : null}
        </details>
      </div>
    </section>
  );
};
