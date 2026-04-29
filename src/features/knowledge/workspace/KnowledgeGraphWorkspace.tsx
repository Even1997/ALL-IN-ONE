import type { KnowledgeNeighborhoodGraph, KnowledgeNote } from '../model/knowledge';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

type KnowledgeGraphWorkspaceProps = {
  graph: KnowledgeNeighborhoodGraph | null;
  selectedNote: KnowledgeNote | null;
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
  mode?: 'focused' | 'global';
};

const summarizeNote = (note: KnowledgeNote | null) => {
  if (!note) {
    return '';
  }

  const normalized = (note.matchSnippet || note.bodyMarkdown).replace(/\s+/g, ' ').trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
};

export const KnowledgeGraphWorkspace = ({
  graph,
  selectedNote,
  onSelectNote,
  onBack,
  mode = 'focused',
}: KnowledgeGraphWorkspaceProps) => {
  const isGlobal = mode === 'global';
  const selectedSummary = summarizeNote(selectedNote);

  return (
    <section className="gn-graph-shell">
      <header className="gn-graph-header">
        <div>
          <span className="gn-note-eyebrow">{isGlobal ? 'Global Index Graph' : 'Focused Index Graph'}</span>
          <h2>{isGlobal ? '系统索引图谱' : '当前知识图谱'}</h2>
          <p>
            {isGlobal
              ? '这里展示整个项目的索引关系网络，不会强制锁定某个中心点。点击任意节点会直接打开对应知识笔记。'
              : '这里展示当前笔记的近邻关系，帮助你从一个知识点快速跳到相关上下文。'}
          </p>
        </div>
        <div className="gn-graph-header-actions">
          <button className="doc-action-btn secondary" type="button" onClick={onBack}>
            返回知识库
          </button>
        </div>
      </header>

      <div className="gn-graph-meta">
        <span>{graph?.nodes.length || 0} 个索引节点</span>
        <span>{graph?.edges.length || 0} 条边</span>
        <span>{selectedNote ? `当前笔记: ${selectedNote.title}` : isGlobal ? '全局浏览模式' : '未选择中心笔记'}</span>
      </div>

      <div className="gn-graph-stage">
        {graph ? (
          <KnowledgeGraphCanvas
            graph={graph}
            mode={mode}
            selectedNoteId={selectedNote?.id || null}
            onSelectNode={onSelectNote}
          />
        ) : (
          <div className="gn-graph-empty">
            <h3>{isGlobal ? '项目里还没有可展示的系统索引图谱' : '当前笔记暂时还没有关系图'}</h3>
            <p>
              {isGlobal
                ? '先刷新系统索引或创建一些知识笔记，系统就能在这里聚合出全局关系网络。'
                : '打开一条知识笔记后，系统会加载它附近的知识关系。'}
            </p>
          </div>
        )}
      </div>

      <aside className="gn-graph-inspector">
        <section className="gn-note-side-card">
          <div className="gn-note-side-card-header">
            <div>
              <h4>{selectedNote ? '当前节点' : '图谱说明'}</h4>
              <p>
                {selectedNote
                  ? '这里显示当前选中知识笔记的摘要，方便你在图谱和正文之间切换。'
                  : isGlobal
                    ? '系统索引会优先连接 AI 摘要和普通知识笔记之间的关联，形成全局图谱视角。'
                    : '选择一条知识笔记后，这里会显示当前图谱中心点的摘要。'}
              </p>
            </div>
            <span className="gn-note-side-count">{selectedNote ? 1 : graph?.nodes.length || 0}</span>
          </div>
          {selectedNote ? (
            <div className="gn-graph-selected">
              <strong>{selectedNote.title}</strong>
              <span>{selectedSummary || '这条笔记暂时还没有可显示的正文摘要。'}</span>
            </div>
          ) : (
            <div className="gn-note-empty">当前还没有选中具体的知识节点。</div>
          )}
        </section>
      </aside>
    </section>
  );
};
