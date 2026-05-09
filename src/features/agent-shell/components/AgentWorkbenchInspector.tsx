import React, { useMemo } from 'react';
import { GNAgentMemoryPanel } from '../../../components/ai/gn-agent-shell/GNAgentMemoryPanel';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';

export type AgentInspectorTab = 'review' | 'tool' | 'timeline' | 'approval' | 'memory';

type AgentWorkbenchInspectorProps = {
  tab: AgentInspectorTab;
  onTabChange: (tab: AgentInspectorTab) => void;
  toolCalls: RuntimeToolStep[];
};

type InspectorFileChange = {
  id: string;
  path: string;
  status: string;
  beforeContent: string | null;
  afterContent: string | null;
};

type ReviewDiffLine = {
  content: string;
  kind: 'added' | 'removed' | 'unchanged';
};

const INSPECTOR_TABS: AgentInspectorTab[] = ['review', 'tool', 'timeline', 'approval', 'memory'];
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
    description: '查看本轮文档改动与内容',
    icon: 'page',
  },
  tool: {
    label: '工具',
    description: '查看本轮工具调用与执行结果',
    icon: 'terminal',
  },
  timeline: {
    label: '时间线',
    description: '查看运行过程里的关键节点',
    icon: 'gitBranch',
  },
  approval: {
    label: '审批',
    description: '查看需要人工确认的操作',
    icon: 'bug',
  },
  memory: {
    label: '记忆',
    description: '查看已保存的长期记忆',
    icon: 'knowledge',
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

const buildReviewDiff = (beforeContent: string | null, afterContent: string | null): ReviewDiffLine[] => {
  if (beforeContent === null && afterContent === null) {
    return [{ content: '没有可展示的内容。', kind: 'unchanged' }];
  }

  if (beforeContent === null) {
    return (afterContent || '没有可展示的内容。').split('\n').map((line) => ({
      content: `+${line}`,
      kind: 'added' as const,
    }));
  }

  if (afterContent === null) {
    return beforeContent.split('\n').map((line) => ({
      content: `-${line}`,
      kind: 'removed' as const,
    }));
  }

  const beforeLines = beforeContent.split('\n');
  const afterLines = afterContent.split('\n');

  let prefixEnd = 0;
  while (prefixEnd < beforeLines.length && prefixEnd < afterLines.length && beforeLines[prefixEnd] === afterLines[prefixEnd]) {
    prefixEnd += 1;
  }

  let suffixStartBefore = beforeLines.length;
  let suffixStartAfter = afterLines.length;
  while (
    suffixStartBefore > prefixEnd &&
    suffixStartAfter > prefixEnd &&
    beforeLines[suffixStartBefore - 1] === afterLines[suffixStartAfter - 1]
  ) {
    suffixStartBefore -= 1;
    suffixStartAfter -= 1;
  }

  const lines: ReviewDiffLine[] = [];

  for (let index = Math.max(0, prefixEnd - 2); index < prefixEnd; index += 1) {
    lines.push({ content: ` ${beforeLines[index]}`, kind: 'unchanged' });
  }

  for (let index = prefixEnd; index < suffixStartBefore; index += 1) {
    lines.push({ content: `-${beforeLines[index]}`, kind: 'removed' });
  }

  for (let index = prefixEnd; index < suffixStartAfter; index += 1) {
    lines.push({ content: `+${afterLines[index]}`, kind: 'added' });
  }

  for (let index = suffixStartAfter; index < Math.min(suffixStartAfter + 2, afterLines.length); index += 1) {
    lines.push({ content: ` ${afterLines[index]}`, kind: 'unchanged' });
  }

  return lines.length > 0 ? lines : [{ content: '没有可展示的内容。', kind: 'unchanged' }];
};

const renderInspectorPlaceholder = (title: string, description: string) => (
  <section className="agent-workbench-inspector-placeholder">
    <strong>{title}</strong>
    <p>{description}</p>
  </section>
);

export const AgentWorkbenchInspector: React.FC<AgentWorkbenchInspectorProps> = ({
  tab,
  onTabChange,
  toolCalls,
}) => {
  const fileChanges = useMemo(
    () => {
      const fileChangesByPath = new Map<string, InspectorFileChange>();

      for (const toolCall of toolCalls) {
        for (const change of toolCall.fileChanges || []) {
          if (!change.path.trim()) {
            continue;
          }

          const existing = fileChangesByPath.get(change.path);
          fileChangesByPath.set(change.path, {
            id: `${toolCall.id}:${change.path}`,
            path: change.path,
            status: summarizeFileChange(change),
            beforeContent: existing ? existing.beforeContent : change.beforeContent ?? null,
            afterContent: change.afterContent ?? existing?.afterContent ?? null,
          });
        }
      }

      return Array.from(fileChangesByPath.values());
    },
    [toolCalls],
  );
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
          <section className="gn-agent-runtime-panel">
            <div className="gn-agent-runtime-panel-head">
              <strong>变更内容</strong>
              <span>{fileChanges.length} 项</span>
            </div>
            {fileChanges.length === 0 ? (
              <p className="gn-agent-runtime-panel-empty">当前线程还没有记录文档变动。</p>
            ) : (
              <div className="agent-workbench-review-list">
                {fileChanges.map((change) => (
                  <article key={change.id} className="agent-workbench-review-card">
                    <div className="agent-workbench-review-card-head">
                      <strong>{change.path}</strong>
                      <code>{change.status}</code>
                    </div>
                    <pre className="agent-workbench-review-diff">
                      {buildReviewDiff(change.beforeContent, change.afterContent).map((line, index) => (
                        <span
                          key={`${change.id}-${index}`}
                          className={
                            line.kind === 'removed'
                              ? 'diff-removed'
                              : line.kind === 'added'
                                ? 'diff-added'
                                : 'diff-context'
                          }
                        >
                          {line.content}
                          {'\n'}
                        </span>
                      ))}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'tool' ? (
          <section className="gn-agent-runtime-panel">
            <div className="gn-agent-runtime-panel-head">
              <strong>工具调用</strong>
              <span>{toolCalls.length} 项</span>
            </div>
            {toolCalls.length === 0 ? (
              renderInspectorPlaceholder('还没有工具调用', 'Agent 使用文件、命令或 MCP 工具时，这里会显示输入、状态和结果摘要。')
            ) : (
              <div className="agent-workbench-review-list">
                {toolCalls.map((toolCall) => (
                  <article key={toolCall.id} className="agent-workbench-review-card">
                    <div className="agent-workbench-review-card-head">
                      <strong>{toolCall.name}</strong>
                      <code>{toolCall.status}</code>
                    </div>
                    <pre className="agent-workbench-review-diff">
                      {toolCall.resultPreview || JSON.stringify(toolCall.input, null, 2)}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'timeline' ? (
          <section className="gn-agent-runtime-panel">
            <div className="gn-agent-runtime-panel-head">
              <strong>运行时间线</strong>
              <span>{toolCalls.length} 个节点</span>
            </div>
            {toolCalls.length === 0 ? (
              renderInspectorPlaceholder('还没有时间线事件', '开始一次 Agent 执行后，计划、工具调用、文件变更和结束状态会汇总到这里。')
            ) : (
              <div className="agent-workbench-review-list">
                {toolCalls.map((toolCall, index) => (
                  <article key={`${toolCall.id}-timeline`} className="agent-workbench-review-card">
                    <div className="agent-workbench-review-card-head">
                      <strong>{index + 1}. {toolCall.name}</strong>
                      <code>{toolCall.status}</code>
                    </div>
                    <p className="agent-workbench-inspector-note">
                      {toolCall.resultPreview || '等待工具结果。'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'approval' ? (
          <section className="gn-agent-runtime-panel">
            <div className="gn-agent-runtime-panel-head">
              <strong>审批队列</strong>
              <span>按权限模式过滤</span>
            </div>
            {renderInspectorPlaceholder('当前没有待审批操作', '当 Agent 准备写文件、运行命令或调用需要确认的 MCP 工具时，这里会集中显示。')}
          </section>
        ) : null}

        {tab === 'memory' ? <GNAgentMemoryPanel /> : null}
      </div>
    </section>
  );
};
