import { useMemo } from 'react';
import { AtomicMarkdownEditor } from '../../../components/product/AtomicMarkdownEditor';
import type { DocumentChangeEvent } from '../../../types';
import type {
  KnowledgeAttachment,
  KnowledgeNeighborhoodGraph,
  KnowledgeNote,
} from '../model/knowledge';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

type AttachmentCategoryCount = {
  category: KnowledgeAttachment['category'];
  count: number;
};

export type KnowledgeNoteFilter = 'all' | 'wiki-index' | 'ai-summary' | 'note' | 'sketch' | 'design';

type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  selectedNote: KnowledgeNote | null;
  activeFilter: KnowledgeNoteFilter;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  canUseForDesign: boolean;
  searchValue: string;
  isSearching: boolean;
  isSyncing: boolean;
  error: string | null;
  documentEvents: DocumentChangeEvent[];
  similarNotes: KnowledgeNote[];
  neighborhoodGraph: KnowledgeNeighborhoodGraph | null;
  neighborhoodNotes: KnowledgeNote[];
  graphNodeCount: number;
  graphEdgeCount: number;
  attachments: KnowledgeAttachment[];
  nearbyAttachments: KnowledgeAttachment[];
  libraryAttachments: KnowledgeAttachment[];
  attachmentCategoryCounts: AttachmentCategoryCount[];
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onImportAssets: () => void;
  onOrganizeKnowledge: () => void;
  onCreateNote: () => void;
  onOpenGlobalWikiGraph: () => void;
  onUseForDesign: () => void;
  onFilterChange: (filter: KnowledgeNoteFilter) => void;
  onOpenAttachment: (attachmentPath: string) => void;
};

const DOC_TYPE_META: Record<NonNullable<KnowledgeNote['docType']>, { badge: string; label: string }> = {
  'wiki-index': { badge: 'WIKI', label: 'Wiki 索引' },
  'ai-summary': { badge: 'AI', label: 'AI 摘要' },
};

const NOTE_KIND_META: Record<NonNullable<KnowledgeNote['kind']>, { badge: string; label: string }> = {
  note: { badge: 'NOTE', label: '项目笔记' },
  sketch: { badge: 'SKETCH', label: '草图说明' },
  design: { badge: 'DESIGN', label: '设计沉淀' },
};

const ATTACHMENT_CATEGORY_LABELS: Record<KnowledgeAttachment['category'], string> = {
  pdf: 'PDF 文档',
  word: 'Word 文档',
  sheet: '表格资料',
  slide: '演示资料',
  text: '文本资料',
  other: '其他附件',
};

const FILTER_OPTIONS: Array<{ id: KnowledgeNoteFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'wiki-index', label: 'Wiki' },
  { id: 'ai-summary', label: 'AI 摘要' },
  { id: 'note', label: '笔记' },
  { id: 'sketch', label: '草图' },
  { id: 'design', label: '设计' },
];

const DOCUMENT_EVENT_TRIGGER_LABELS: Record<DocumentChangeEvent['trigger'], string> = {
  editor: '编辑',
  import: '导入',
  sync: '同步',
};

const NoteAddIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M10 4.25v11.5M4.25 10h11.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const MarkdownImportIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M6.5 3.75h4.4l2.85 2.85v7.4a2 2 0 0 1-2 2h-5.25a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M10.9 3.75V6.6h2.85M10 8.1v4.8M8.2 11.1 10 12.9l1.8-1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AssetImportIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M3.75 6.25a2 2 0 0 1 2-2h2.7l1.3 1.6h4.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-7.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M10 7.9v4.5M8.2 10.6 10 12.4l1.8-1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const NoteKindIcon = ({ kind }: { kind?: KnowledgeNote['kind'] }) => {
  if (kind === 'design') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M5.5 14.5 14.5 5.5M7 5.5h7.5v7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === 'sketch') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="m5.5 13.8 6.9-6.9 2.1 2.1-6.9 6.9H5.5v-2.1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="m11.7 7.6 1.7-1.7a1.3 1.3 0 0 1 1.9 0l.8.8a1.3 1.3 0 0 1 0 1.9l-1.7 1.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5.5 4.75h9a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1-1.75 1.75h-9A1.75 1.75 0 0 1 3.75 13.5v-7A1.75 1.75 0 0 1 5.5 4.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 8.25h7M6.5 11.75h4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const summarizeBody = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '还没有正文内容。';
  }

  return normalized.length > 88 ? `${normalized.slice(0, 88)}...` : normalized;
};

const getNoteMeta = (note: KnowledgeNote) => {
  if (note.docType) {
    return DOC_TYPE_META[note.docType];
  }

  return NOTE_KIND_META[note.kind || 'note'];
};

const renderNoteList = (
  title: string,
  notes: KnowledgeNote[],
  onSelectNote: (noteId: string) => void,
  emptyText: string,
  description: string
) => (
  <section className="gn-note-side-card">
    <div className="gn-note-side-card-header">
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <span className="gn-note-side-count">{notes.length}</span>
    </div>
    {notes.length > 0 ? (
      <div className="gn-note-relation-list">
        {notes.map((note) => (
          <button key={note.id} type="button" onClick={() => onSelectNote(note.id)}>
            <strong>{note.title}</strong>
            <span>{note.matchSnippet || summarizeBody(note.bodyMarkdown)}</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="gn-note-empty">{emptyText}</div>
    )}
  </section>
);

const renderAttachmentList = (
  title: string,
  attachments: KnowledgeAttachment[],
  onOpenAttachment: (attachmentPath: string) => void,
  emptyText: string,
  description: string
) => (
  <section className="gn-note-side-card">
    <div className="gn-note-side-card-header">
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <span className="gn-note-side-count">{attachments.length}</span>
    </div>
    {attachments.length > 0 ? (
      <div className="gn-note-attachment-list">
        {attachments.map((attachment) => (
          <button key={attachment.id} type="button" onClick={() => onOpenAttachment(attachment.path)}>
            <strong>{attachment.title}</strong>
            <span>{attachment.relativePath}</span>
            <em>{ATTACHMENT_CATEGORY_LABELS[attachment.category]}</em>
          </button>
        ))}
      </div>
    ) : (
      <div className="gn-note-empty">{emptyText}</div>
    )}
  </section>
);

export const KnowledgeNoteWorkspace = ({
  notes,
  filteredNotes,
  selectedNote,
  activeFilter,
  editorValue,
  editable,
  isSaving,
  saveMessage,
  canSave,
  canUseForDesign,
  searchValue,
  isSearching,
  isSyncing,
  error,
  documentEvents,
  similarNotes,
  neighborhoodGraph,
  neighborhoodNotes,
  graphNodeCount,
  graphEdgeCount,
  attachments,
  nearbyAttachments,
  libraryAttachments,
  attachmentCategoryCounts,
  onSearchChange,
  onSelectNote,
  onEditorChange,
  onSave,
  onDelete,
  onUpload,
  onImportAssets,
  onOrganizeKnowledge,
  onCreateNote,
  onOpenGlobalWikiGraph,
  onUseForDesign,
  onFilterChange,
  onOpenAttachment,
}: KnowledgeNoteWorkspaceProps) => {
  const searchActive = searchValue.trim().length > 0;
  const visibleNotes = filteredNotes;
  const visibleDocumentEvents = documentEvents.slice(0, 8);
  const selectedNoteMeta = selectedNote ? getNoteMeta(selectedNote) : null;
  const visibleAttachmentCount = attachments.length + nearbyAttachments.length + libraryAttachments.length;
  const selectedNoteTags = useMemo(
    () => selectedNote?.tags.filter((tag) => tag.trim().length > 0) || [],
    [selectedNote]
  );

  const editorToolbar = canUseForDesign ? (
    <div className="gn-note-header-toolbar">
      <button className="gn-note-toolbar-btn accent" type="button" onClick={onUseForDesign}>
        AI
      </button>
    </div>
  ) : null;

  return (
    <section className="gn-note-workspace">
      <aside className="gn-note-rail">
        <div className="gn-note-rail-hero">
          <span className="gn-note-eyebrow">Knowledge</span>
          <h3>项目知识库</h3>
          <p>笔记、Wiki、草图说明和设计沉淀都会在这里统一维护，AI 也会优先基于这里的内容工作。</p>
        </div>

        <div className="gn-note-search-row">
          <input
            className="product-input"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索标题、正文、标签"
          />
        </div>

        <div className="pm-knowledge-filter-tabs">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={activeFilter === option.id ? 'active' : ''}
              type="button"
              onClick={() => onFilterChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="gn-note-rail-actions">
          <button className="doc-action-btn" type="button" onClick={onOrganizeKnowledge}>
            生成 Wiki
          </button>
          <button
            className="doc-action-btn gn-note-icon-btn"
            type="button"
            onClick={onCreateNote}
            title="新建笔记"
            aria-label="新建笔记"
          >
            <NoteAddIcon />
          </button>
          <button
            className="doc-action-btn secondary gn-note-icon-btn"
            type="button"
            onClick={onUpload}
            title="导入 Markdown"
            aria-label="导入 Markdown"
          >
            <MarkdownImportIcon />
          </button>
          <button
            className="doc-action-btn secondary gn-note-icon-btn"
            type="button"
            onClick={onImportAssets}
            title="导入资料"
            aria-label="导入资料"
          >
            <AssetImportIcon />
          </button>
        </div>

        <div className="gn-note-stats">
          <span>{notes.length} 条知识笔记</span>
          <span>{visibleNotes.length} 条当前可见</span>
          {isSearching ? <span>搜索中</span> : null}
          {isSyncing ? <span>同步中</span> : null}
        </div>

        {error ? <div className="gn-note-error">{error}</div> : null}

        <div className="gn-note-list">
          {visibleNotes.length > 0 ? (
            visibleNotes.map((note) => {
              const noteMeta = getNoteMeta(note);
              return (
                <div key={note.id} className="gn-note-tree-group">
                  <button
                    className={`gn-note-tree-item file ${selectedNote?.id === note.id ? 'active' : ''}`}
                    type="button"
                    title={note.sourceUrl || note.title}
                    onClick={() => onSelectNote(note.id)}
                  >
                    <span className="gn-note-tree-icon" aria-hidden="true">
                      <NoteKindIcon kind={note.kind} />
                    </span>
                    <span className="gn-note-tree-label">{note.title}</span>
                    <span className="gn-note-tree-badge">{noteMeta.badge}</span>
                  </button>
                  <div className="gn-note-list-meta">
                    {note.matchSnippet || summarizeBody(note.bodyMarkdown)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="gn-note-empty">{searchActive ? '没有匹配的笔记。' : '还没有知识笔记。'}</div>
          )}
        </div>
      </aside>

      <main className="gn-note-editor-column">
        {selectedNote ? (
          <>
            <header className="gn-note-editor-header">
              <div className="gn-note-editor-heading">
                <span className="gn-note-eyebrow">{editable ? 'Editable Markdown' : 'Readonly Projection'}</span>
                <h2>{selectedNote.title}</h2>
                <p>{selectedNote.sourceUrl || '这条笔记还没有绑定源文件路径。'}</p>
                <div className="gn-note-header-toolbar">
                  <span className="gn-note-toolbar-btn active" role="status">
                    {selectedNoteMeta?.label}
                  </span>
                  {selectedNoteTags.map((tag) => (
                    <span key={tag} className="gn-note-toolbar-btn" role="status">
                      #{tag}
                    </span>
                  ))}
                </div>
                {editorToolbar}
              </div>
              <div className="gn-note-editor-actions">
                {editable ? (
                  <>
                    <button className="doc-action-btn secondary" type="button" onClick={onDelete}>
                      删除
                    </button>
                    <button className="doc-action-btn" type="button" onClick={onSave} disabled={!canSave}>
                      {isSaving ? '保存中...' : '保存'}
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            <div className="gn-note-editor-surface">
              <AtomicMarkdownEditor
                key={selectedNote.id}
                value={editorValue}
                onChange={onEditorChange}
                editable={editable}
              />
            </div>

            <footer className="gn-note-editor-footer">
              <span>
                {saveMessage || (editable ? 'Markdown 请手动保存，也可以使用 Ctrl/Cmd+S。' : '当前是只读兼容投影。')}
              </span>
              <span>更新于 {formatUpdatedAt(selectedNote.updatedAt)}</span>
            </footer>
          </>
        ) : (
          <div className="gn-note-empty-main">
            <span className="gn-note-eyebrow">No Note Selected</span>
            <h2>选择或新建一条知识笔记</h2>
            <p>这里会集中展示正文、上下文关系和附件资料。你也可以先让 AI 帮你生成一轮 Wiki 再继续整理。</p>
            <div className="gn-note-empty-actions">
              <button className="doc-action-btn" type="button" onClick={onOrganizeKnowledge}>
                生成 Wiki
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onCreateNote}>
                新建第一条笔记
              </button>
              {editorToolbar}
            </div>
          </div>
        )}
      </main>

      <aside className="gn-note-side">
        <section className="gn-note-side-card">
          <div className="gn-note-side-card-header">
            <div>
              <h4>当前笔记</h4>
              <p>这里展示当前选中笔记的基础元信息。</p>
            </div>
            <span className="gn-note-side-count">{selectedNote ? 1 : 0}</span>
          </div>
          {selectedNote ? (
            <dl className="gn-note-meta-list">
              <div>
                <dt>类型</dt>
                <dd>{selectedNoteMeta?.label}</dd>
              </div>
              <div>
                <dt>标签</dt>
                <dd>{selectedNoteTags.length > 0 ? selectedNoteTags.join(' / ') : '暂无标签'}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{selectedNote.sourceUrl || '未绑定源文件'}</dd>
              </div>
              <div>
                <dt>摘要</dt>
                <dd>{selectedNote.matchSnippet || summarizeBody(selectedNote.bodyMarkdown)}</dd>
              </div>
            </dl>
          ) : (
            <div className="gn-note-empty">先从左侧选择一条笔记。</div>
          )}
        </section>

        <section className="gn-note-side-card">
          <div className="gn-note-side-card-header">
            <div>
              <h4>最近文档变更</h4>
              <p>记录新增、修改、删除和同步导入的最近动作。</p>
            </div>
            <span className="gn-note-side-count">{documentEvents.length}</span>
          </div>
          {visibleDocumentEvents.length > 0 ? (
            <div className="gn-note-activity-list">
              {visibleDocumentEvents.map((event) => (
                <div key={event.id} className="gn-note-activity-item">
                  <strong>{event.documentTitle}</strong>
                  <span>{event.summary}</span>
                  <div className="gn-note-activity-meta">
                    <em>{DOCUMENT_EVENT_TRIGGER_LABELS[event.trigger] || event.trigger}</em>
                    <span>{event.trigger}</span>
                    <span>{formatUpdatedAt(event.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="gn-note-empty">还没有记录到文档变更。</div>
          )}
        </section>

        {renderNoteList(
          '类似笔记',
          similarNotes,
          onSelectNote,
          '选中笔记后，这里会展示语义上更接近的内容。',
          '快速查看和当前笔记最接近的知识条目。'
        )}

        <section className="gn-note-side-card">
          <div className="gn-note-side-card-header">
            <div>
              <h4>Wiki 图谱</h4>
              <p>这里展示当前笔记的局部图谱，点击节点可以继续跳转到相邻上下文。</p>
            </div>
            <span className="gn-note-side-count">{graphNodeCount}</span>
          </div>
          <div className="gn-note-graph-numbers">
            <span>{graphNodeCount} 个节点</span>
            <span>{graphEdgeCount} 条边</span>
          </div>
          {neighborhoodGraph ? (
            <div className="gn-note-graph-preview">
              <KnowledgeGraphCanvas
                graph={neighborhoodGraph}
                mode="focused"
                compact
                selectedNoteId={selectedNote?.id || null}
                onSelectNode={onSelectNote}
              />
            </div>
          ) : (
            <div className="gn-note-empty">当前笔记附近还没有更多可展示的关系节点。</div>
          )}
          <button className="doc-action-btn secondary" type="button" onClick={onOpenGlobalWikiGraph}>
            打开 Wiki 图谱
          </button>
          {neighborhoodNotes.length > 0 ? (
            <div className="gn-note-relation-list">
              {neighborhoodNotes.map((note) => (
                <button key={note.id} type="button" onClick={() => onSelectNote(note.id)}>
                  <strong>{note.title}</strong>
                  <span>{note.matchSnippet || summarizeBody(note.bodyMarkdown)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="gn-note-side-card">
          <div className="gn-note-side-card-header">
            <div>
              <h4>附件资料</h4>
              <p>把直接引用、附近资料和资料库入口都放在这里，减少来回找文件。</p>
            </div>
            <span className="gn-note-side-count">{visibleAttachmentCount}</span>
          </div>
          {attachmentCategoryCounts.length > 0 ? (
            <div className="gn-note-category-grid">
              {attachmentCategoryCounts.map((item) => (
                <div key={item.category} className="gn-note-category-chip">
                  <strong>{item.count}</strong>
                  <span>{ATTACHMENT_CATEGORY_LABELS[item.category]}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="gn-note-empty">当前项目里还没有已识别的资料附件。</div>
          )}

          {renderAttachmentList(
            '直接关联',
            attachments,
            onOpenAttachment,
            '当前笔记还没有直接关联的资料。',
            '正文里直接引用到的附件会优先出现在这里。'
          )}
          {renderAttachmentList(
            '附近资料',
            nearbyAttachments,
            onOpenAttachment,
            '附近目录里还没有更多可用资料。',
            '同目录或相邻目录的资料会作为就近参考展示。'
          )}
          {renderAttachmentList(
            '资料库',
            libraryAttachments,
            onOpenAttachment,
            '资料库里还没有更多推荐附件。',
            '面向整个项目知识库的可复用附件入口。'
          )}
        </section>
      </aside>
    </section>
  );
};
