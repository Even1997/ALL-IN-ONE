import React from 'react';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';
import { useProjectStore } from '../../../store/projectStore';

export const GNAgentMemoryPanel: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const fallbackMemoryEntries = useProjectStore((state) => state.memory?.memoryEntries || []);
  const runtimeMemoryEntries = useAgentRuntimeStore((state) =>
    currentProject ? state.memoryByProject[currentProject.id] || [] : []
  );
  const entries = runtimeMemoryEntries.length > 0 ? runtimeMemoryEntries : fallbackMemoryEntries;

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Memory</strong>
        <span>{entries.length} entries</span>
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
