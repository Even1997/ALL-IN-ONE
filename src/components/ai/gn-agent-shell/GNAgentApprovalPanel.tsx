import React from 'react';
import type { ApprovalRecord, SandboxPolicy } from '../../../modules/ai/runtime/approval/approvalTypes';

export const GNAgentApprovalPanel: React.FC<{
  approvals: ApprovalRecord[];
  sandboxPolicy: SandboxPolicy;
  onSandboxPolicyChange: (policy: SandboxPolicy) => void;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}> = ({ approvals, sandboxPolicy, onSandboxPolicyChange, onApprove, onDeny }) => (
  <section className="gn-agent-approval-panel">
    <div className="gn-agent-approval-panel-head">
      <div>
        <strong>Pending approvals</strong>
        <span>高风险动作会先停在这里，等你放行后再继续执行。</span>
      </div>
      <div className="gn-agent-approval-policy-group" role="group" aria-label="Sandbox policy">
        {(['allow', 'ask', 'deny'] as SandboxPolicy[]).map((policy) => (
          <button
            key={policy}
            type="button"
            className={sandboxPolicy === policy ? 'active' : ''}
            onClick={() => onSandboxPolicyChange(policy)}
          >
            {policy}
          </button>
        ))}
      </div>
    </div>

    {approvals.length === 0 ? (
      <p className="gn-agent-approval-empty">当前没有待处理审批。</p>
    ) : (
      <div className="gn-agent-approval-list">
        {approvals.map((approval) => (
          <article key={approval.id} className={`gn-agent-approval-card ${approval.riskLevel}`}>
            <div className="gn-agent-approval-card-head">
              <strong>{approval.summary}</strong>
              <span>{approval.riskLevel}</span>
            </div>
            <div className="gn-agent-approval-card-meta">
              <span>{approval.actionType}</span>
              <span>{new Date(approval.createdAt).toLocaleTimeString('zh-CN')}</span>
            </div>
            <div className="gn-agent-approval-card-actions">
              <button type="button" onClick={() => onApprove(approval.id)}>
                Approve
              </button>
              <button type="button" onClick={() => onDeny(approval.id)}>
                Deny
              </button>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);
