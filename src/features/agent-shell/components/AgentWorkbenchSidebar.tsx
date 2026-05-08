import React from 'react';
import { GNAgentThreadList } from '../../../components/ai/gn-agent-shell/GNAgentThreadList';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { AgentReplayRecoveryState } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import type { AgentThreadRecord } from '../../../modules/ai/runtime/agentRuntimeTypes';

type AgentWorkbenchSidebarProps = {
  projectName?: string | null;
  threads: AgentThreadRecord[];
  activeSessionId: string | null;
  recoveryByThread: Record<string, AgentReplayRecoveryState | undefined>;
  onSelectThread: (threadId: string) => void;
  onResumeThread: (threadId: string) => void;
  onNewThread: () => void;
  onOpenSearch: () => void;
  onOpenSkills: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const SIDEBAR_ITEMS: Array<{
  id: 'newThread' | 'search' | 'skills';
  label: string;
  icon: React.ComponentProps<typeof WorkbenchIcon>['name'];
}> = [
  { id: 'newThread', label: '新对话', icon: 'plus' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'skills', label: '技能', icon: 'spark' },
];

export const AgentWorkbenchSidebar: React.FC<AgentWorkbenchSidebarProps> = ({
  projectName = null,
  threads,
  activeSessionId,
  recoveryByThread,
  onSelectThread,
  onResumeThread,
  onNewThread,
  onOpenSearch,
  onOpenSkills,
  collapsed,
  onToggleCollapsed,
}) => (
  <div className={`agent-workbench-sidebar${collapsed ? ' is-collapsed' : ''}`}>
    <div className="agent-workbench-left-rail">
      <button
        type="button"
        className="agent-workbench-brand"
        onClick={() => {
          if (collapsed) {
            onToggleCollapsed();
          }
        }}
        aria-label="Agent 工作台"
        title="Agent 工作台"
      >
        <span className="agent-workbench-brand-mark">
          <WorkbenchIcon name="terminal" />
        </span>
        <span>Agent</span>
      </button>

      <nav className="agent-workbench-rail-nav" aria-label="Agent workbench actions">
        {SIDEBAR_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="agent-workbench-rail-item"
            onClick={() => {
              if (item.id === 'newThread') {
                onNewThread();
                if (collapsed) {
                  onToggleCollapsed();
                }
                return;
              }

              if (item.id === 'search') {
                onOpenSearch();
                return;
              }

              onOpenSkills();
            }}
            title={item.label}
            aria-label={item.label}
          >
            <WorkbenchIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="agent-workbench-rail-foot">
        <button
          type="button"
          className="agent-workbench-rail-item agent-workbench-rail-collapse"
          onClick={onToggleCollapsed}
          title={collapsed ? '展开左侧面板' : '收起左侧面板'}
          aria-label={collapsed ? '展开左侧面板' : '收起左侧面板'}
        >
          <WorkbenchIcon name="chevronRight" />
          <span>{collapsed ? '展开' : '收起'}</span>
        </button>
      </div>
    </div>

    {!collapsed ? (
      <div className="agent-workbench-left-panel">
        <header className="agent-sidebar-panel-head">
          <div className="agent-sidebar-panel-head-copy">
            <span className="agent-sidebar-panel-head-icon">
              <WorkbenchIcon name="page" />
            </span>
            <div>
              <strong>最近对话</strong>
              <span>{projectName || '当前项目会话'}</span>
            </div>
          </div>
          <button
            type="button"
            className="agent-sidebar-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label="收起左侧面板"
            title="收起左侧面板"
          >
            <WorkbenchIcon name="chevronRight" />
          </button>
        </header>

        <section className="agent-sidebar-panel-body agent-sidebar-panel-body-threads">
          <GNAgentThreadList
            threads={threads}
            activeSessionId={activeSessionId}
            recoveryByThread={recoveryByThread}
            onSelectThread={onSelectThread}
            onResumeThread={(threadId) => {
              if (recoveryByThread[threadId]) {
                onResumeThread(threadId);
              }
            }}
          />
        </section>
      </div>
    ) : null}
  </div>
);
