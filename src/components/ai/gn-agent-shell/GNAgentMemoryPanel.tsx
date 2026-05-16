// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import type { AgentMemoryEntry } from '../../../modules/ai/runtime/agentRuntimeTypes';
import { useProjectStore } from '../../../store/projectStore';

const EMPTY_MEMORY_ENTRIES: AgentMemoryEntry[] = [];

export const GNAgentMemoryPanel: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const fallbackMemoryEntries = useProjectStore((state) => state.memory?.memoryEntries || EMPTY_MEMORY_ENTRIES);
  const runtimeMemoryEntries = useAgentRuntimeStore((state) =>
    currentProject ? state.memoryByProject[currentProject.id] || EMPTY_MEMORY_ENTRIES : EMPTY_MEMORY_ENTRIES
  );
  const entries = runtimeMemoryEntries.length > 0 ? runtimeMemoryEntries : fallbackMemoryEntries;

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>长期记忆</strong>
        <span>{entries.length} 条</span>
      </div>
      {entries.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">当前项目还没有提炼出的长期记忆。</p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {entries.slice(0, 6).map((entry) => (
            <article key={entry.id} className="gn-agent-runtime-card">
              <strong>{entry.title || entry.kind || 'projectFact'}</strong>
              <span>{entry.summary || entry.kind || 'projectFact'}</span>
              <code>{entry.kind || 'projectFact'}</code>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
