import React, { useMemo } from 'react';
import type { GNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { UtilitySidebar, WorkbenchIcon } from '../../../components/ui';

type AgentUtilitySidebarProps = {
  session: GNAgentWorkbenchSession;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const compactLabel = (value: string) =>
  value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const clampText = (value: string, fallback: string) => (value.trim() ? value.trim() : fallback);

export const AgentUtilitySidebar: React.FC<AgentUtilitySidebarProps> = ({
  session,
  collapsed,
  onToggleCollapsed,
}) => {
  const latestTurn = session.latestTurnSession;
  const plan = latestTurn?.plan || null;

  const affectedPaths = useMemo(() => {
    const pathSet = new Set<string>(plan?.affectedPaths || []);

    for (const toolCall of session.toolCalls) {
      for (const fileChange of toolCall.fileChanges || []) {
        pathSet.add(fileChange.path);
      }
    }

    return [...pathSet].slice(0, 8);
  }, [plan?.affectedPaths, session.toolCalls]);

  const hasReviewContent = Boolean(
    affectedPaths.length
      || session.pendingApprovalCount
      || latestTurn?.resumeSnapshot
      || latestTurn?.status === 'failed'
      || latestTurn?.status === 'blocked',
  );

  return (
    <UtilitySidebar
      className="agent-utility-sidebar"
      bodyClassName="agent-utility-sidebar-body"
      title="审查"
      subtitle="Review current run"
      icon="eye"
      railLabel="审查侧栏"
      panelLabel="审查面板"
      collapsed={collapsed}
      panelVisible={hasReviewContent}
      onToggleCollapsed={onToggleCollapsed}
      tabs={[
        {
          icon: 'eye',
          label: '审查',
          active: true,
          hasDot: hasReviewContent,
          onClick: () => {
            if (collapsed) {
              onToggleCollapsed();
            }
          },
        },
      ]}
    >
      <>
        {affectedPaths.length > 0 ? (
          <article className="agent-utility-card">
            <div className="agent-utility-section-head">
              <strong>变更文件</strong>
              <span>{affectedPaths.length}</span>
            </div>
            <div className="agent-utility-list">
              {affectedPaths.map((path) => (
                <div key={path} className="agent-utility-row">
                  <span className="agent-utility-row-icon">
                    <WorkbenchIcon name="document" />
                  </span>
                  <div className="agent-utility-row-copy">
                    <strong>{path.split(/[\\/]/).pop() || path}</strong>
                    <span>{path}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {session.pendingApprovalCount > 0 ? (
          <article className="agent-utility-card">
            <div className="agent-utility-section-head">
              <strong>待确认</strong>
              <span>{session.pendingApprovalCount}</span>
            </div>
            <p className="agent-utility-copy-block">
              当前回合还在等待确认，确认后才能继续执行。
            </p>
          </article>
        ) : null}

        {latestTurn?.resumeSnapshot ? (
          <article className="agent-utility-card">
            <div className="agent-utility-section-head">
              <strong>恢复点</strong>
              <span>{clampText(latestTurn.resumeSnapshot.resumeActionLabel || '', 'Resume')}</span>
            </div>
            <p className="agent-utility-copy-block">{latestTurn.resumeSnapshot.resumeReason}</p>
          </article>
        ) : null}

        {latestTurn?.status === 'failed' || latestTurn?.status === 'blocked' ? (
          <article className="agent-utility-card is-danger">
            <div className="agent-utility-section-head">
              <strong>阻塞问题</strong>
              <span>{compactLabel(latestTurn.status)}</span>
            </div>
            <p className="agent-utility-copy-block">
              先从主舞台处理当前阻塞，再继续这一轮执行。
            </p>
          </article>
        ) : null}
      </>
    </UtilitySidebar>
  );
};
