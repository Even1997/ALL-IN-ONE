import React, { type CSSProperties } from 'react';
import { GNAgentThreadList } from '../../../components/ai/gn-agent-shell/GNAgentThreadList';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { ChatSession } from '../../../modules/ai/store/aiChatStore';

type AgentWorkbenchSidebarProps = {
  projectName?: string | null;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteSession: (threadId: string) => void;
  onNewThread: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  panelWidth: number;
};

const SIDEBAR_ITEMS: Array<{
  id: 'newThread' | 'search';
  label: string;
  icon: React.ComponentProps<typeof WorkbenchIcon>['name'];
}> = [
  { id: 'newThread', label: '新对话', icon: 'plus' },
  { id: 'search', label: '搜索', icon: 'search' },
];

export const AgentWorkbenchSidebar: React.FC<AgentWorkbenchSidebarProps> = ({
  projectName = null,
  sessions,
  activeSessionId,
  onSelectThread,
  onDeleteSession,
  onNewThread,
  onOpenSearch,
  collapsed,
  onToggleCollapsed,
  panelWidth,
}) => {
  const sessionMeta =
    sessions.length > 0
      ? `${sessions.length} 条对话${projectName ? ` · ${projectName}` : ''}`
      : projectName || '等待第一条对话';

  return (
    <div
      className={`agent-workbench-sidebar${collapsed ? ' is-collapsed' : ''}${sessions.length === 0 && !collapsed ? ' is-empty' : ''}`}
      style={
        {
          '--agent-sidebar-panel-width': `${panelWidth}px`,
          '--agent-sidebar-panel-track-width': collapsed ? '0px' : `${panelWidth}px`,
        } as CSSProperties
      }
    >
      <div className="agent-workbench-left-rail">
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
                }
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

      <div className="agent-workbench-left-panel" aria-hidden={collapsed}>
        <header className="agent-sidebar-panel-head">
          <div className="agent-sidebar-panel-head-copy">
            <span className="agent-sidebar-panel-head-icon">
              <WorkbenchIcon name="note" />
            </span>
            <div>
              <strong>对话历史</strong>
              <span>{sessionMeta}</span>
            </div>
          </div>
        </header>

        <section className="agent-sidebar-panel-body agent-sidebar-panel-body-threads">
          <GNAgentThreadList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectThread={onSelectThread}
            onDeleteSession={onDeleteSession}
          />
        </section>
      </div>
    </div>
  );
};
