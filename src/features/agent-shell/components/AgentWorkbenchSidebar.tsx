import React, { useMemo, useState } from 'react';
import { GNAgentConfigPage } from '../../../components/ai/gn-agent-shell/GNAgentConfigPage';
import { GNAgentSkillsPage } from '../../../components/ai/gn-agent-shell/GNAgentSkillsPage';
import { GNAgentThreadList } from '../../../components/ai/gn-agent-shell/GNAgentThreadList';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { AgentReplayRecoveryState } from '../../../modules/ai/runtime/replay/runtimeReplayRecovery';
import type { AgentThreadRecord } from '../../../modules/ai/runtime/agentRuntimeTypes';

export type AgentSidebarMode =
  | 'threads'
  | 'search'
  | 'skills'
  | 'plugins'
  | 'automations'
  | 'settings';

type AgentWorkbenchSidebarProps = {
  mode: AgentSidebarMode;
  onModeChange: (mode: AgentSidebarMode) => void;
  projectName?: string | null;
  threads: AgentThreadRecord[];
  activeSessionId: string | null;
  recoveryByThread: Record<string, AgentReplayRecoveryState | undefined>;
  onSelectThread: (threadId: string) => void;
  onResumeThread: (threadId: string) => void;
  onNewThread: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const SIDEBAR_ITEMS: Array<{
  id: Exclude<AgentSidebarMode, 'settings'>;
  label: string;
  icon: React.ComponentProps<typeof WorkbenchIcon>['name'];
}> = [
  { id: 'threads', label: '新对话', icon: 'plus' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'skills', label: '技能', icon: 'spark' },
  { id: 'plugins', label: '插件', icon: 'puzzle' },
  { id: 'automations', label: '自动化', icon: 'gitBranch' },
];

const MODE_META: Record<
  AgentSidebarMode,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentProps<typeof WorkbenchIcon>['name'];
  }
> = {
  threads: {
    title: '对话',
    subtitle: '项目会话与快捷入口',
    icon: 'page',
  },
  search: {
    title: '搜索',
    subtitle: '查找历史线程和上下文',
    icon: 'search',
  },
  skills: {
    title: '技能',
    subtitle: '管理已安装技能',
    icon: 'spark',
  },
  plugins: {
    title: '插件',
    subtitle: '项目扩展与能力入口',
    icon: 'puzzle',
  },
  automations: {
    title: '自动化',
    subtitle: '重复执行、提醒与巡检',
    icon: 'gitBranch',
  },
  settings: {
    title: '设置',
    subtitle: '运行时配置与环境',
    icon: 'settings',
  },
};

const PLACEHOLDER_COPY: Record<
  Extract<AgentSidebarMode, 'plugins' | 'automations'>,
  { title: string; body: string }
> = {
  plugins: {
    title: '插件面板',
    body: '这里先保留成轻量扩展区，后面可以继续接入插件市场、项目扩展和启用状态。',
  },
  automations: {
    title: '自动化面板',
    body: '这里先承接自动化入口，后续适合接提醒、巡检、定时任务和回访工作流。',
  },
};

const renderPlaceholderPanel = (mode: 'plugins' | 'automations') => (
  <section className="agent-sidebar-panel-body agent-sidebar-placeholder">
    <article className="agent-sidebar-note-card agent-sidebar-note-card-emphasis">
      <span className="agent-sidebar-note-icon">
        <WorkbenchIcon name={MODE_META[mode].icon} />
      </span>
      <div>
        <strong>{PLACEHOLDER_COPY[mode].title}</strong>
        <p>{PLACEHOLDER_COPY[mode].body}</p>
      </div>
    </article>
  </section>
);

export const AgentWorkbenchSidebar: React.FC<AgentWorkbenchSidebarProps> = ({
  mode,
  onModeChange,
  projectName = null,
  threads,
  activeSessionId,
  recoveryByThread,
  onSelectThread,
  onResumeThread,
  onNewThread,
  collapsed,
  onToggleCollapsed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return threads;
    }
    return threads.filter((thread) => {
      const haystack = [thread.title, thread.providerId].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, threads]);

  const activeMeta = MODE_META[mode];

  return (
    <div className={`agent-workbench-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="agent-workbench-left-rail">
        <button
          type="button"
          className="agent-workbench-brand"
          onClick={() => {
            onModeChange('threads');
            if (collapsed) {
              onToggleCollapsed();
            }
          }}
        >
          <span className="agent-workbench-brand-mark">
            <WorkbenchIcon name="terminal" />
          </span>
          <span>Agent</span>
        </button>

        <nav className="agent-workbench-rail-nav" aria-label="Agent workbench navigation">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`agent-workbench-rail-item${mode === item.id ? ' active' : ''}`}
              onClick={() => {
                onModeChange(item.id);
                if (collapsed) {
                  onToggleCollapsed();
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
            className={`agent-workbench-rail-item${mode === 'settings' ? ' active' : ''}`}
            onClick={() => {
              onModeChange('settings');
              if (collapsed) {
                onToggleCollapsed();
              }
            }}
            title="设置"
            aria-label="设置"
          >
            <WorkbenchIcon name="settings" />
            <span>设置</span>
          </button>
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
                <WorkbenchIcon name={activeMeta.icon} />
              </span>
              <div>
                <strong>{activeMeta.title}</strong>
                <span>{activeMeta.subtitle}</span>
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

          {mode === 'threads' ? (
            <section className="agent-sidebar-panel-body">
              <article className="agent-sidebar-hero-card">
                <span className="agent-sidebar-hero-kicker">Workspace</span>
                <strong>{projectName || '当前项目'}</strong>
                <p>统一承接 Agent 对话、技能与自动化入口，布局保持为单套共享工作台。</p>
                <div className="agent-sidebar-hero-meta">
                  <span>{threads.length} 个线程</span>
                  <span>{activeSessionId ? '已有活跃会话' : '等待新对话'}</span>
                </div>
              </article>

              <div className="agent-sidebar-actions-grid">
                <button type="button" className="agent-sidebar-primary-btn" onClick={onNewThread}>
                  <WorkbenchIcon name="plus" />
                  <span>新建对话</span>
                </button>
                <button
                  type="button"
                  className="agent-sidebar-secondary-btn"
                  onClick={() => onModeChange('search')}
                >
                  <WorkbenchIcon name="search" />
                  <span>搜索</span>
                </button>
                <button
                  type="button"
                  className="agent-sidebar-secondary-btn"
                  onClick={() => onModeChange('skills')}
                >
                  <WorkbenchIcon name="spark" />
                  <span>技能</span>
                </button>
              </div>

              <div className="agent-sidebar-section-head">
                <strong>最近对话</strong>
                <span>{Math.min(threads.length, 6)} 条</span>
              </div>

              <GNAgentThreadList
                threads={threads}
                activeSessionId={activeSessionId}
                recoveryByThread={recoveryByThread}
                onSelectThread={onSelectThread}
                onResumeThread={(threadId) => {
                  const recoveryState = recoveryByThread[threadId];
                  if (recoveryState) {
                    onResumeThread(threadId);
                  }
                }}
              />
            </section>
          ) : null}

          {mode === 'search' ? (
            <section className="agent-sidebar-panel-body">
              <article className="agent-sidebar-note-card">
                <strong>搜索线程</strong>
                <p>按标题或 provider 过滤历史对话，快速回到之前的运行上下文。</p>
              </article>

              <label className="agent-sidebar-search-field">
                <span>关键词</span>
                <div className="agent-sidebar-search-input">
                  <WorkbenchIcon name="search" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="按标题或 provider 搜索"
                  />
                </div>
              </label>

              <div className="agent-sidebar-search-results">
                {filteredThreads.length > 0 ? (
                  filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={`agent-sidebar-search-item${thread.id === activeSessionId ? ' active' : ''}`}
                      onClick={() => onSelectThread(thread.id)}
                    >
                      <strong>{thread.title}</strong>
                      <span>{thread.providerId}</span>
                    </button>
                  ))
                ) : (
                  <article className="agent-sidebar-note-card">
                    <strong>没有匹配结果</strong>
                    <p>换个关键词试试，或者先开始一轮新的对话。</p>
                  </article>
                )}
              </div>
            </section>
          ) : null}

          {mode === 'skills' ? (
            <section className="agent-sidebar-panel-body">
              <article className="agent-sidebar-note-card">
                <strong>技能面板</strong>
                <p>这里保留技能浏览入口，和聊天舞台共用同一套 Agent 核心能力。</p>
              </article>
              <GNAgentSkillsPage />
            </section>
          ) : null}

          {mode === 'settings' ? (
            <section className="agent-sidebar-panel-body">
              <article className="agent-sidebar-note-card">
                <strong>运行设置</strong>
                <p>配置模型、API 和运行环境，避免再拆出一套单独的 AI 页面。</p>
              </article>
              <GNAgentConfigPage />
            </section>
          ) : null}

          {mode === 'plugins' ? renderPlaceholderPanel('plugins') : null}
          {mode === 'automations' ? renderPlaceholderPanel('automations') : null}
        </div>
      ) : null}
    </div>
  );
};
