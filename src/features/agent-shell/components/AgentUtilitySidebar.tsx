// 文件作用：侧边栏组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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

export const hasAgentReviewContent = (session: GNAgentWorkbenchSession) => {
  const latestTurn = session.latestTurnSession;
  const plan = latestTurn?.plan || null;
  const pathSet = new Set<string>(plan?.affectedPaths || []);

  for (const toolCall of session.toolCalls) {
    for (const fileChange of toolCall.fileChanges || []) {
      pathSet.add(fileChange.path);
    }
  }

  return Boolean(
    pathSet.size
      || session.pendingApprovalCount
      || latestTurn?.resumeSnapshot
      || latestTurn?.status === 'failed'
      || latestTurn?.status === 'blocked',
  );
};

export const AgentUtilitySidebar: React.FC<AgentUtilitySidebarProps> = ({
  session,
  collapsed,
  onToggleCollapsed,
}) => {
  const latestTurn = session.latestTurnSession;
  const plan = latestTurn?.plan || null;
  const latestStatusLabel = latestTurn ? compactLabel(latestTurn.status) : 'Ready';

  const affectedPaths = useMemo(() => {
    const pathSet = new Set<string>(plan?.affectedPaths || []);

    for (const toolCall of session.toolCalls) {
      for (const fileChange of toolCall.fileChanges || []) {
        pathSet.add(fileChange.path);
      }
    }

    return [...pathSet].slice(0, 8);
  }, [plan?.affectedPaths, session.toolCalls]);

  const hasReviewContent = hasAgentReviewContent(session);

  if (!hasReviewContent) {
    return null;
  }

  return (
    <UtilitySidebar
      className="agent-utility-sidebar"
      bodyClassName="agent-utility-sidebar-body"
      title="审查"
      subtitle="检查当前运行"
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
        <article className="agent-utility-card agent-utility-card-hero">
          <div className="agent-utility-card-head">
            <strong>当前回合</strong>
            <span
              className={`agent-utility-status-pill ${
                latestTurn?.status === 'failed'
                  ? 'is-danger'
                  : latestTurn?.status === 'blocked' || latestTurn?.status === 'waiting_approval'
                    ? 'is-warning'
                    : 'is-neutral'
              }`}
            >
              {latestStatusLabel}
            </span>
          </div>
          <p className="agent-utility-copy-block agent-utility-summary-lead">
            {session.pendingApprovalCount > 0
              ? '当前回合正在等待确认，处理完确认项后才能继续执行。'
              : affectedPaths.length > 0
                ? '这一轮已经产生了可审查的文件和上下文变化。'
                : latestTurn?.resumeSnapshot
                  ? '当前存在恢复点，可以在处理完上下文后继续这一轮执行。'
                  : '当前回合没有额外的审查项。'}
          </p>
          <div className="agent-utility-mini-stats">
            <div>
              <span>变更文件</span>
              <strong>{affectedPaths.length}</strong>
            </div>
            <div>
              <span>待确认</span>
              <strong>{session.pendingApprovalCount}</strong>
            </div>
            <div>
              <span>恢复点</span>
              <strong>{latestTurn?.resumeSnapshot ? '1' : '0'}</strong>
            </div>
          </div>
        </article>

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
            <div className="agent-utility-row">
              <span className="agent-utility-row-icon is-warning">
                <WorkbenchIcon name="clock" />
              </span>
              <div className="agent-utility-row-copy">
                <strong>等待你的确认</strong>
                <span>确认完成后，Agent 会继续当前回合的后续步骤。</span>
              </div>
            </div>
          </article>
        ) : null}

        {latestTurn?.resumeSnapshot ? (
          <article className="agent-utility-card">
            <div className="agent-utility-section-head">
              <strong>恢复点</strong>
              <span>{clampText(latestTurn.resumeSnapshot.resumeActionLabel || '', 'Resume')}</span>
            </div>
            <div className="agent-utility-row">
              <span className="agent-utility-row-icon">
                <WorkbenchIcon name="refresh" />
              </span>
              <div className="agent-utility-row-copy">
                <strong>继续当前执行</strong>
                <span>{latestTurn.resumeSnapshot.resumeReason}</span>
              </div>
            </div>
          </article>
        ) : null}

        {latestTurn?.status === 'failed' || latestTurn?.status === 'blocked' ? (
          <article className="agent-utility-card is-danger">
            <div className="agent-utility-section-head">
              <strong>阻塞问题</strong>
              <span>{compactLabel(latestTurn.status)}</span>
            </div>
            <div className="agent-utility-row">
              <span className="agent-utility-row-icon is-danger">
                <WorkbenchIcon name="alertTriangle" />
              </span>
              <div className="agent-utility-row-copy">
                <strong>需要先处理当前阻塞</strong>
                <span>先回到主舞台处理问题，再继续这一轮执行。</span>
              </div>
            </div>
          </article>
        ) : null}
      </>
    </UtilitySidebar>
  );
};
