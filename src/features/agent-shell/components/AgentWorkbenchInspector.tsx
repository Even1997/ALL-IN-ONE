import React, { useMemo } from 'react';
import { GNAgentContextPanel } from '../../../components/ai/gn-agent-shell/GNAgentContextPanel';
import { GNAgentMemoryPanel } from '../../../components/ai/gn-agent-shell/GNAgentMemoryPanel';
import { GNAgentPlanPanel } from '../../../components/ai/gn-agent-shell/GNAgentPlanPanel';
import { GNAgentTimelinePanel } from '../../../components/ai/gn-agent-shell/GNAgentTimelinePanel';
import { GNAgentToolCallPanel } from '../../../components/ai/gn-agent-shell/GNAgentToolCallPanel';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { AgentMemoryCandidate } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import type { AgentContextSnapshot } from '../../../modules/ai/runtime/context/agentContextTypes';
import type { RuntimeMcpToolCall } from '../../../modules/ai/runtime/mcp/runtimeMcpTypes';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

export type AgentInspectorTab = 'review' | 'files' | 'tools' | 'memory' | 'context';

type AgentWorkbenchInspectorProps = {
  tab: AgentInspectorTab;
  onTabChange: (tab: AgentInspectorTab) => void;
  latestTurnSession: AgentTurnSession | null;
  contextSnapshot: AgentContextSnapshot | null;
  toolCalls: RuntimeToolStep[];
  mcpToolCalls: RuntimeMcpToolCall[];
  memoryCandidates: AgentMemoryCandidate[];
};

const INSPECTOR_TABS: AgentInspectorTab[] = ['review', 'files', 'tools', 'memory', 'context'];
const INSPECTOR_TAB_META: Record<
  AgentInspectorTab,
  {
    label: string;
    description: string;
    icon: React.ComponentProps<typeof WorkbenchIcon>['name'];
  }
> = {
  review: {
    label: '审查',
    description: '计划、状态和时间线',
    icon: 'page',
  },
  files: {
    label: '文件',
    description: '查看本轮代码变更',
    icon: 'files',
  },
  tools: {
    label: '工具',
    description: '命令、MCP 与执行轨迹',
    icon: 'terminal',
  },
  memory: {
    label: '记忆',
    description: '候选记忆与已存上下文',
    icon: 'knowledge',
  },
  context: {
    label: '上下文',
    description: '线程上下文与引用快照',
    icon: 'document',
  },
};

const summarizeFileChange = (change: NonNullable<RuntimeToolStep['fileChanges']>[number]) => {
  if (change.beforeContent === null && change.afterContent !== null) {
    return '新建';
  }
  if (change.beforeContent !== null && change.afterContent === null) {
    return '删除';
  }
  return '更新';
};

export const AgentWorkbenchInspector: React.FC<AgentWorkbenchInspectorProps> = ({
  tab,
  onTabChange,
  latestTurnSession,
  contextSnapshot,
  toolCalls,
  mcpToolCalls,
  memoryCandidates,
}) => {
  const fileChanges = useMemo(
    () =>
      toolCalls.flatMap((toolCall) =>
        (toolCall.fileChanges || []).map((change) => ({
          id: `${toolCall.id}:${change.path}`,
          path: change.path,
          status: summarizeFileChange(change),
        })),
      ),
    [toolCalls],
  );
  const pendingMemoryCount = memoryCandidates.filter((candidate) => candidate.status === 'pending').length;
  const activeMeta = INSPECTOR_TAB_META[tab];

  return (
    <section className="agent-workbench-inspector">
      <header className="agent-workbench-inspector-head">
        <div>
          <span>Inspector</span>
          <strong>{activeMeta.label}</strong>
          <p>{activeMeta.description}</p>
        </div>
      </header>

      <nav className="agent-workbench-inspector-tabs" aria-label="Agent inspector tabs">
        {INSPECTOR_TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={`agent-workbench-inspector-tab${tab === item ? ' active' : ''}`}
            onClick={() => onTabChange(item)}
          >
            <WorkbenchIcon name={INSPECTOR_TAB_META[item].icon} />
            <span>{INSPECTOR_TAB_META[item].label}</span>
          </button>
        ))}
      </nav>

      <div className="agent-workbench-inspector-body">
        {tab === 'review' ? (
          <>
            <GNAgentPlanPanel session={latestTurnSession} />
            <GNAgentTimelinePanel latestTurnSession={latestTurnSession} />
          </>
        ) : null}

        {tab === 'files' ? (
          <section className="gn-agent-runtime-panel">
            <div className="gn-agent-runtime-panel-head">
              <strong>文件变更</strong>
              <span>{fileChanges.length} 项</span>
            </div>
            {fileChanges.length === 0 ? (
              <p className="gn-agent-runtime-panel-empty">当前线程还没有记录文件变化。</p>
            ) : (
              <div className="gn-agent-runtime-panel-list">
                {fileChanges.map((change) => (
                  <article key={change.id} className="gn-agent-runtime-card">
                    <strong>{change.path}</strong>
                    <code>{change.status}</code>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'tools' ? (
          <GNAgentToolCallPanel toolCalls={toolCalls} mcpToolCalls={mcpToolCalls} />
        ) : null}

        {tab === 'memory' ? (
          <>
            <section className="gn-agent-runtime-panel">
              <div className="gn-agent-runtime-panel-head">
                <strong>记忆收件箱</strong>
                <span>{pendingMemoryCount} 条待处理</span>
              </div>
              <p className="gn-agent-runtime-panel-empty">
                待保存记忆会在这里汇总，当前先保留展示与已存记忆查看入口。
              </p>
            </section>
            <GNAgentMemoryPanel />
          </>
        ) : null}

        {tab === 'context' ? <GNAgentContextPanel context={contextSnapshot} /> : null}
      </div>
    </section>
  );
};
