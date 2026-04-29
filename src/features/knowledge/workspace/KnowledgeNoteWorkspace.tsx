import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GoodNightMarkdownEditor } from '../../../components/product/GoodNightMarkdownEditor';
import type { DocumentChangeEvent } from '../../../types';
import type {
  KnowledgeAttachment,
  KnowledgeNeighborhoodGraph,
  KnowledgeNote,
} from '../model/knowledge';
import { formatKnowledgeTagLabels } from '../model/knowledgeTagMeta';
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
  titleValue: string;
  mirrorSourcePath?: string | null;
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
  onTitleChange: (value: string) => void;
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

const NOTE_TREE_SECTIONS: Array<{
  id: KnowledgeNoteFilter;
  label: string;
  matches: (note: KnowledgeNote) => boolean;
}> = [
  { id: 'wiki-index', label: 'Wiki 索引', matches: (note) => note.docType === 'wiki-index' },
  { id: 'ai-summary', label: 'AI 摘要', matches: (note) => note.docType === 'ai-summary' },
  { id: 'note', label: '项目笔记', matches: (note) => !note.docType && (note.kind || 'note') === 'note' },
  { id: 'sketch', label: '草图说明', matches: (note) => !note.docType && note.kind === 'sketch' },
  { id: 'design', label: '设计沉淀', matches: (note) => !note.docType && note.kind === 'design' },
];

const DOCUMENT_EVENT_TRIGGER_LABELS: Record<DocumentChangeEvent['trigger'], string> = {
  editor: '编辑',
  import: '导入',
  sync: '同步',
};

const NOTE_RAIL_WIDTH_BOUNDS = { min: 220, max: 420 };
const NOTE_RAIL_DEFAULT_WIDTH = 280;
const NOTE_SIDE_WIDTH_BOUNDS = { min: 260, max: 560 };
const NOTE_SIDE_DEFAULT_WIDTH = 320;

const clampNoteRailWidth = (value: number) =>
  Math.min(NOTE_RAIL_WIDTH_BOUNDS.max, Math.max(NOTE_RAIL_WIDTH_BOUNDS.min, value));

const clampNoteSideWidth = (value: number) =>
  Math.min(NOTE_SIDE_WIDTH_BOUNDS.max, Math.max(NOTE_SIDE_WIDTH_BOUNDS.min, value));

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

const WikiGenerateIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M4.75 5.75a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-6.5a2 2 0 0 1-2-2v-8.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M7.25 7.25h5.5M7.25 10h5.5M7.25 12.75h3.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M13.25 3.75v12.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.45"
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
  titleValue,
  mirrorSourcePath = null,
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
  onTitleChange,
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
  const [isSideExpanded, setIsSideExpanded] = useState(false);
  const [railWidth, setRailWidth] = useState(NOTE_RAIL_DEFAULT_WIDTH);
  const [sideWidth, setSideWidth] = useState(NOTE_SIDE_DEFAULT_WIDTH);
  const [isRailResizing, setIsRailResizing] = useState(false);
  const [isSideResizing, setIsSideResizing] = useState(false);
  const searchActive = searchValue.trim().length > 0;
  const visibleNotes = filteredNotes;
  const visibleDocumentEvents = documentEvents.slice(0, 8);
  const selectedNoteMeta = selectedNote ? getNoteMeta(selectedNote) : null;
  const visibleAttachmentCount = attachments.length + nearbyAttachments.length + libraryAttachments.length;
  const visibleNoteSections = useMemo(
    () =>
      NOTE_TREE_SECTIONS.map((section) => ({
        ...section,
        notes: visibleNotes.filter(section.matches),
      })).filter((section) => section.notes.length > 0),
    [visibleNotes]
  );
  const selectedNoteTagLabels = useMemo(
    () => formatKnowledgeTagLabels(selectedNote?.tags || []),
    [selectedNote]
  );

  const editorToolbar = canUseForDesign ? (
    <div className="gn-note-header-toolbar">
      <button className="gn-note-toolbar-btn accent" type="button" onClick={onUseForDesign}>
        AI
      </button>
    </div>
  ) : null;

  const handleSideResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isSideExpanded) {
      setIsSideExpanded(true);
    }

    const startX = event.clientX;
    const startWidth = sideWidth;
    setIsSideResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSideWidth(clampNoteSideWidth(startWidth + startX - moveEvent.clientX));
    };

    const handlePointerUp = () => {
      setIsSideResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [isSideExpanded, sideWidth]);

  const handleRailResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = railWidth;
    setIsRailResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setRailWidth(clampNoteRailWidth(startWidth + moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      setIsRailResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [railWidth]);

  const handleSideResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    event.preventDefault();
    if (!isSideExpanded) {
      setIsSideExpanded(true);
    }

    setSideWidth((current) => {
      if (event.key === 'Home') {
        return NOTE_SIDE_WIDTH_BOUNDS.min;
      }

      if (event.key === 'End') {
        return NOTE_SIDE_WIDTH_BOUNDS.max;
      }

      return clampNoteSideWidth(current + (event.key === 'ArrowLeft' ? 16 : -16));
    });
  }, [isSideExpanded]);

  const handleRailResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    event.preventDefault();
    setRailWidth((current) => {
      if (event.key === 'Home') {
        return NOTE_RAIL_WIDTH_BOUNDS.min;
      }

      if (event.key === 'End') {
        return NOTE_RAIL_WIDTH_BOUNDS.max;
      }

      return clampNoteRailWidth(current + (event.key === 'ArrowRight' ? 16 : -16));
    });
  }, []);

  return (
    <section
      className={`gn-note-workspace ${isSideExpanded ? 'side-expanded' : 'side-collapsed'} ${isRailResizing ? 'is-resizing-note-rail' : ''} ${isSideResizing ? 'is-resizing-note-side' : ''}`}
      style={{
        '--gn-note-rail-width': `${railWidth}px`,
        '--gn-note-side-width': `${sideWidth}px`,
      } as CSSProperties}
    >
      <aside className="gn-note-rail">

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
          <button
            className="doc-action-btn gn-note-icon-btn gn-note-wiki-btn"
            type="button"
            onClick={onOrganizeKnowledge}
            title="生成 Wiki"
            aria-label="生成 Wiki"
          >
            <WikiGenerateIcon />
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
            title="导入 Markdown 到知识库"
            aria-label="导入 Markdown 到知识库"
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
            visibleNoteSections.map((section) => (
              <section key={section.id} className="gn-note-tree-section" aria-label={section.label}>
                <div className="gn-note-tree-section-header">
                  <span className="gn-note-tree-section-title">{section.label}</span>
                  <span className="gn-note-tree-section-count">{section.notes.length}</span>
                </div>
                {section.notes.map((note) => {
                  const noteMeta = getNoteMeta(note);
                  return (
                    <button
                      key={note.id}
                      className={`gn-note-tree-item file ${selectedNote?.id === note.id ? 'active' : ''}`}
                      type="button"
                      title={note.sourceUrl || note.title}
                      onClick={() => onSelectNote(note.id)}
                    >
                      <span className="gn-note-tree-icon" aria-hidden="true">
                        <NoteKindIcon kind={note.kind} />
                      </span>
                      <span className="gn-note-tree-label">{note.title}</span>
                      {searchActive && note.matchSnippet ? <span className="gn-note-tree-match">命中</span> : null}
                      <span className="gn-note-tree-badge">{noteMeta.badge}</span>
                    </button>
                  );
                })}
              </section>
            ))
          ) : (
            <div className="gn-note-empty">{searchActive ? '没有匹配的笔记。' : '还没有知识笔记。'}</div>
          )}
        </div>
      </aside>

      <div
        className="gn-note-rail-resize-handle"
        role="separator"
        aria-label="调整目录树宽度"
        aria-orientation="vertical"
        aria-valuemin={NOTE_RAIL_WIDTH_BOUNDS.min}
        aria-valuemax={NOTE_RAIL_WIDTH_BOUNDS.max}
        aria-valuenow={railWidth}
        tabIndex={0}
        onPointerDown={handleRailResizePointerDown}
        onKeyDown={handleRailResizeKeyDown}
      />

      <main className="gn-note-editor-column">
        {selectedNote ? (
          <>
            <div className="gn-note-editor-surface">
              <div className="gn-note-editor-title-row">
                <input
                  className="gn-note-title-input"
                  type="text"
                  value={titleValue}
                  onChange={(event) => onTitleChange(event.target.value)}
                  aria-label="笔记标题"
                  disabled={!editable}
                />
                <div className="gn-note-storage-state" aria-label="笔记存储状态">
                  <span>数据库笔记</span>
                  <span>{mirrorSourcePath ? 'Markdown 镜像' : '未绑定 Markdown'}</span>
                </div>
              </div>
              <div className="gn-note-editor-body">
                <GoodNightMarkdownEditor
                  key={selectedNote.id}
                  value={editorValue}
                  onChange={onEditorChange}
                  editable={editable}
                />
              </div>
            </div>

            <footer className="gn-note-editor-footer">
              <span>
                {saveMessage || (editable ? '笔记保存到知识库；已绑定 Markdown 时会同步镜像。' : '当前是只读兼容投影。')}
              </span>
              <div className="gn-note-editor-footer-actions">
                <span>更新于 {formatUpdatedAt(selectedNote.updatedAt)}</span>
                {editorToolbar}
                {editable ? (
                  <>
                    <button className="doc-action-btn secondary" type="button" onClick={onDelete}>
                      删除笔记
                    </button>
                    <button className="doc-action-btn" type="button" onClick={onSave} disabled={!canSave}>
                      {isSaving ? '保存中...' : '保存到知识库'}
                    </button>
                  </>
                ) : null}
              </div>
            </footer>
          </>
        ) : (
          <div className="gn-note-empty-main">
            <h2>选择或新建一条知识笔记</h2>
            <div className="gn-note-empty-actions">
              <button className="doc-action-btn" type="button" onClick={onOrganizeKnowledge}>
                生成 Wiki
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onCreateNote}>
                新建笔记
              </button>
              {editorToolbar}
            </div>
          </div>
        )}
      </main>

      <div
        className="gn-note-side-resize-handle"
        role="separator"
        aria-label="调整详情栏宽度"
        aria-orientation="vertical"
        aria-valuemin={NOTE_SIDE_WIDTH_BOUNDS.min}
        aria-valuemax={NOTE_SIDE_WIDTH_BOUNDS.max}
        aria-valuenow={isSideExpanded ? sideWidth : 46}
        tabIndex={0}
        onPointerDown={handleSideResizePointerDown}
        onKeyDown={handleSideResizeKeyDown}
      />

      <aside className={`gn-note-side ${isSideExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="gn-note-side-toggle"
          type="button"
          onClick={() => setIsSideExpanded((current) => !current)}
          aria-expanded={isSideExpanded}
        >
          {isSideExpanded ? '收起' : '详情'}
        </button>
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
                <dd>{selectedNoteTagLabels.length > 0 ? selectedNoteTagLabels.join(' / ') : '暂无标签'}</dd>
              </div>
              <div>
                <dt>Markdown 镜像</dt>
                <dd>{mirrorSourcePath || '未绑定 Markdown 镜像'}</dd>
              </div>
              <div>
                <dt>摘要</dt>
                <dd>{selectedNote.matchSnippet || summarizeBody(selectedNote.bodyMarkdown)}</dd>
              </div>
              <div>
                <dt>引用来源</dt>
                <dd>
                  {selectedNote.referenceTitles.length > 0
                    ? selectedNote.referenceTitles.join(' / ')
                    : '暂无引用来源'}
                </dd>
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
