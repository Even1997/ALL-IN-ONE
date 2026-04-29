import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { GoodNightMarkdownEditor } from '../../../components/product/GoodNightMarkdownEditor';
import type { KnowledgeRetrievalMethod } from '../../../types';
import { getRelativePathFromRoot, normalizeRelativeFileSystemPath } from '../../../utils/fileSystemPaths';
import type { KnowledgeDiskItem } from '../../../modules/knowledge/knowledgeTree';
import type { KnowledgeNote } from '../model/knowledge';
import { serializeKnowledgeNoteMarkdown } from './knowledgeNoteMarkdown';
import { KnowledgeMarkdownViewer, type KnowledgeInternalLinkTarget } from './KnowledgeMarkdownViewer';

export type KnowledgeNoteFilter = 'all' | 'wiki-index' | 'ai-summary' | 'note' | 'sketch' | 'design';
type KnowledgeViewMode = 'read' | 'code';

type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  diskItems: KnowledgeDiskItem[];
  selectedNote: KnowledgeNote | null;
  activeFilter: KnowledgeNoteFilter;
  projectRootPath?: string | null;
  titleValue: string;
  mirrorSourcePath?: string | null;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
  searchValue: string;
  isSearching: boolean;
  isSyncing: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onTitleChange: (value: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onOrganizeKnowledge: () => void;
  onCreateNote: () => void;
  onCreateNoteAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  onKnowledgeRetrievalMethodChange: (method: KnowledgeRetrievalMethod) => void;
  onFilterChange: (filter: KnowledgeNoteFilter) => void;
  onOpenAttachment: (attachmentPath: string) => void;
};

const KNOWLEDGE_RETRIEVAL_OPTIONS: Array<{
  value: KnowledgeRetrievalMethod;
  label: string;
}> = [
  { value: 'm-flow', label: 'm-flow' },
  { value: 'llmwiki', label: 'llmwiki' },
  { value: 'rag', label: 'rag' },
];

const DOC_TYPE_META: Record<NonNullable<KnowledgeNote['docType']>, { badge: string; label: string }> = {
  'wiki-index': { badge: 'INDEX', label: '系统索引' },
  'ai-summary': { badge: 'AI', label: 'AI 摘要' },
};

const NOTE_KIND_META: Record<NonNullable<KnowledgeNote['kind']>, { badge: string; label: string }> = {
  note: { badge: 'NOTE', label: '项目笔记' },
  sketch: { badge: 'SKETCH', label: '草图说明' },
  design: { badge: 'DESIGN', label: '设计沉淀' },
};

const FILTER_OPTIONS: Array<{ id: KnowledgeNoteFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'wiki-index', label: '索引' },
  { id: 'ai-summary', label: 'AI 摘要' },
  { id: 'note', label: '笔记' },
  { id: 'sketch', label: '草图' },
  { id: 'design', label: '设计' },
];

type KnowledgeTreeFileNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  note: KnowledgeNote | null;
  extension: string;
};

type KnowledgeTreeFolderNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string | null;
  folders: KnowledgeTreeFolderNode[];
  files: KnowledgeTreeFileNode[];
  fileCount: number;
};

type MutableKnowledgeTreeFolderNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string | null;
  folders: Map<string, MutableKnowledgeTreeFolderNode>;
  files: KnowledgeTreeFileNode[];
};

type KnowledgeContextMenuState =
  | {
      x: number;
      y: number;
      targetPath: string | null;
      isFolder: boolean | null;
      selectedPaths: string[];
    }
  | null;

const NOTE_RAIL_WIDTH_BOUNDS = { min: 220, max: 420 };
const NOTE_RAIL_DEFAULT_WIDTH = 280;

const clampNoteRailWidth = (value: number) =>
  Math.min(NOTE_RAIL_WIDTH_BOUNDS.max, Math.max(NOTE_RAIL_WIDTH_BOUNDS.min, value));

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

const TreeCaretIcon = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="m4 2.5 4 3.5-4 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M3.75 6.25a2 2 0 0 1 2-2h2.9l1.35 1.6h4.25a2 2 0 0 1 2 2v5.95a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2V6.25Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

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

const getNoteMeta = (note: KnowledgeNote) => {
  if (note.docType) {
    return DOC_TYPE_META[note.docType];
  }

  return NOTE_KIND_META[note.kind || 'note'];
};

const compareTreeNames = (left: string, right: string) =>
  left.localeCompare(right, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });

const isHiddenKnowledgeTreePath = (value: string) => value.split('/').includes('.goodnight');

const resolveNoteTreeFilePath = (note: KnowledgeNote, projectRootPath?: string | null) => {
  const normalizedSourcePath = normalizeRelativeFileSystemPath(note.sourceUrl || '');
  if (normalizedSourcePath) {
    if (projectRootPath) {
      const relativePath = getRelativePathFromRoot(note.sourceUrl || '', projectRootPath);
      if (relativePath !== null) {
        return normalizeRelativeFileSystemPath(relativePath);
      }
    }

    return normalizedSourcePath;
  }

  return normalizeRelativeFileSystemPath(note.title.trim() || note.id);
};

const getTreeFileExtension = (value: string) => {
  const matched = value.toLowerCase().match(/\.([a-z0-9]+)$/);
  return matched ? matched[1] : '';
};

const countFolderFiles = (folder: KnowledgeTreeFolderNode): number =>
  folder.files.length + folder.folders.reduce((sum, child) => sum + countFolderFiles(child), 0);

const buildKnowledgeTree = (
  diskItems: KnowledgeDiskItem[],
  notes: KnowledgeNote[],
  filteredNotes: KnowledgeNote[],
  searchValue: string,
  activeFilter: KnowledgeNoteFilter,
  projectRootPath?: string | null
): KnowledgeTreeFolderNode => {
  const root: MutableKnowledgeTreeFolderNode = {
    id: 'root',
    name: '',
    path: '',
    absolutePath: projectRootPath || null,
    folders: new Map<string, MutableKnowledgeTreeFolderNode>(),
    files: [],
  };

  const noteByRelativePath = new Map<string, KnowledgeNote>();
  const visibleNoteIds = new Set(filteredNotes.map((note) => note.id));
  const normalizedSearchValue = searchValue.trim().toLowerCase();

  for (const note of notes) {
    const relativePath = resolveNoteTreeFilePath(note, projectRootPath);
    if (!relativePath) {
      continue;
    }

    noteByRelativePath.set(relativePath, note);
  }

  for (const item of diskItems) {
    const relativePath = normalizeRelativeFileSystemPath(item.relativePath);
    if (!relativePath || isHiddenKnowledgeTreePath(relativePath)) {
      continue;
    }

    let current = root;
    let currentPath = '';
    const segments = relativePath.split('/').filter(Boolean);
    const folderSegments = item.type === 'folder' ? segments : segments.slice(0, -1);

    for (const segment of folderSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existingFolder = current.folders.get(segment);
      if (existingFolder) {
        current = existingFolder;
        continue;
      }

      const nextFolder: MutableKnowledgeTreeFolderNode = {
        id: currentPath,
        name: segment,
        path: currentPath,
        absolutePath: item.path,
        folders: new Map<string, MutableKnowledgeTreeFolderNode>(),
        files: [],
      };
      current.folders.set(segment, nextFolder);
      current = nextFolder;
    }

    if (item.type === 'folder') {
      continue;
    }

    const linkedNote = noteByRelativePath.get(relativePath) || null;
    const matchesGenericSearch =
      !normalizedSearchValue || relativePath.toLowerCase().includes(normalizedSearchValue);

    if (linkedNote) {
      if (!visibleNoteIds.has(linkedNote.id)) {
        continue;
      }
    } else if (activeFilter !== 'all' || !matchesGenericSearch) {
      continue;
    }

    const fileName = segments[segments.length - 1] || relativePath;
    current.files.push({
      id: linkedNote?.id || `file:${relativePath}`,
      name: fileName,
      path: relativePath,
      absolutePath: item.path,
      note: linkedNote,
      extension: getTreeFileExtension(relativePath),
    });
  }

  const finalizeFolder = (folder: MutableKnowledgeTreeFolderNode): KnowledgeTreeFolderNode => {
    const folders = [...folder.folders.values()]
      .map((child) => finalizeFolder(child))
      .sort((left, right) => compareTreeNames(left.name, right.name));
    const files = [...folder.files].sort((left, right) => compareTreeNames(left.name, right.name));

    const finalizedFolder: KnowledgeTreeFolderNode = {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      absolutePath: folder.absolutePath,
      folders,
      files,
      fileCount: 0,
    };
    finalizedFolder.fileCount = countFolderFiles(finalizedFolder);
    return finalizedFolder;
  };

  return finalizeFolder(root);
};

const collectAncestorFolderPaths = (filePath: string) => {
  const segments = filePath.split('/').filter(Boolean);
  const ancestors = new Set<string>();
  let currentPath = '';

  for (const segment of segments.slice(0, -1)) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    ancestors.add(currentPath);
  }

  return ancestors;
};

export const KnowledgeNoteWorkspace = ({
  notes,
  filteredNotes,
  diskItems,
  selectedNote,
  activeFilter,
  projectRootPath = null,
  titleValue,
  mirrorSourcePath = null,
  editorValue,
  editable,
  isSaving,
  saveMessage,
  canSave,
  knowledgeRetrievalMethod,
  searchValue,
  isSearching,
  isSyncing,
  error,
  onSearchChange,
  onSelectNote,
  onTitleChange,
  onEditorChange,
  onSave,
  onDelete,
  onOrganizeKnowledge,
  onCreateNote,
  onCreateNoteAtPath,
  onCreateFolderAtPath,
  onRenameTreePath,
  onDeleteTreePaths,
  onRefreshFilesystem,
  onKnowledgeRetrievalMethodChange,
  onFilterChange,
  onOpenAttachment,
}: KnowledgeNoteWorkspaceProps) => {
  const [railWidth, setRailWidth] = useState(NOTE_RAIL_DEFAULT_WIDTH);
  const [isRailResizing, setIsRailResizing] = useState(false);
  const [collapsedFolderPaths, setCollapsedFolderPaths] = useState<Set<string>>(() => new Set());
  const [selectedTreePaths, setSelectedTreePaths] = useState<string[]>([]);
  const [anchorTreePath, setAnchorTreePath] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<KnowledgeContextMenuState>(null);
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>('read');
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const searchActive = searchValue.trim().length > 0;
  const visibleNotes = filteredNotes;
  const visibleKnowledgeTree = useMemo(
    () => buildKnowledgeTree(diskItems, notes, filteredNotes, searchValue, activeFilter, projectRootPath),
    [activeFilter, diskItems, filteredNotes, notes, projectRootPath, searchValue]
  );
  const hasVisibleTreeNodes = visibleKnowledgeTree.folders.length > 0 || visibleKnowledgeTree.files.length > 0;
  const selectedTreeFilePath = useMemo(
    () => (selectedNote ? resolveNoteTreeFilePath(selectedNote, projectRootPath) : ''),
    [projectRootPath, selectedNote]
  );
  const selectedAncestorFolderPaths = useMemo(
    () => collectAncestorFolderPaths(selectedTreeFilePath),
    [selectedTreeFilePath]
  );
  const readingMarkdown = useMemo(
    () => (selectedNote ? serializeKnowledgeNoteMarkdown(titleValue, editorValue) : ''),
    [editorValue, selectedNote, titleValue]
  );
  const noteIdByLookupKey = useMemo(() => {
    const entries = new Map<string, string>();

    for (const note of notes) {
      const normalizedTitle = note.title.trim().toLowerCase();
      if (normalizedTitle) {
        entries.set(normalizedTitle, note.id);
      }

      const normalizedPathTitle = note.sourceUrl
        ?.replace(/\\/g, '/')
        .split('/')
        .pop()
        ?.replace(/\.(md|markdown)$/i, '')
        .trim()
        .toLowerCase();
      if (normalizedPathTitle) {
        entries.set(normalizedPathTitle, note.id);
      }
    }

    return entries;
  }, [notes]);

  const toggleFolderExpanded = useCallback((folderPath: string) => {
    setCollapsedFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const flattenVisibleTreePaths = useCallback((folder: KnowledgeTreeFolderNode): string[] => {
    const paths: string[] = [];

    for (const childFolder of folder.folders) {
      paths.push(childFolder.path);
      const isExpanded =
        selectedAncestorFolderPaths.has(childFolder.path) || !collapsedFolderPaths.has(childFolder.path);
      if (isExpanded) {
        paths.push(...flattenVisibleTreePaths(childFolder));
      }
    }

    for (const file of folder.files) {
      paths.push(file.path);
    }

    return paths;
  }, [collapsedFolderPaths, selectedAncestorFolderPaths]);

  const visibleTreePaths = useMemo(
    () => flattenVisibleTreePaths(visibleKnowledgeTree),
    [flattenVisibleTreePaths, visibleKnowledgeTree]
  );

  const handleTreeSelection = useCallback(
    (relativePath: string, isMultiSelect: boolean, isRangeSelect: boolean) => {
      if (isRangeSelect && anchorTreePath) {
        const startIndex = visibleTreePaths.indexOf(anchorTreePath);
        const endIndex = visibleTreePaths.indexOf(relativePath);
        if (startIndex >= 0 && endIndex >= 0) {
          const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          setSelectedTreePaths(visibleTreePaths.slice(from, to + 1));
          return;
        }
      }

      if (isMultiSelect) {
        setSelectedTreePaths((current) =>
          current.includes(relativePath)
            ? current.filter((path) => path !== relativePath)
            : [...current, relativePath]
        );
        setAnchorTreePath(relativePath);
        return;
      }

      setSelectedTreePaths([relativePath]);
      setAnchorTreePath(relativePath);
    },
    [anchorTreePath, visibleTreePaths]
  );

  const closeKnowledgeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const handleOpenInternalMarkdownLink = useCallback(
    (target: KnowledgeInternalLinkTarget) => {
      const normalizedTitle = target.noteTitle?.trim().toLowerCase();
      if (!normalizedTitle) {
        return;
      }

      const nextNoteId = noteIdByLookupKey.get(normalizedTitle);
      if (nextNoteId && nextNoteId !== selectedNote?.id) {
        onSelectNote(nextNoteId);
      }
    },
    [noteIdByLookupKey, onSelectNote, selectedNote?.id]
  );

  useEffect(() => {
    setSelectedTreePaths((current) => current.filter((path) => visibleTreePaths.includes(path)));
    setAnchorTreePath((current) => (current && visibleTreePaths.includes(current) ? current : null));
  }, [visibleTreePaths]);

  useEffect(() => {
    setViewMode('read');
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = (event: Event) => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) {
        return;
      }
      setContextMenuState(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [contextMenuState]);

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

  const renderKnowledgeTree = useCallback(
    (folder: KnowledgeTreeFolderNode, depth = 0): ReactNode[] => {
      const nextNodes: ReactNode[] = [];

      for (const childFolder of folder.folders) {
        const isExpanded =
          selectedAncestorFolderPaths.has(childFolder.path) || !collapsedFolderPaths.has(childFolder.path);
        const isSelected = selectedTreePaths.includes(childFolder.path);

        nextNodes.push(
          <div key={childFolder.path} className="gn-note-tree-group">
            <div className="gn-note-tree-row">
              <button
                className={`gn-note-tree-item folder ${isSelected ? 'active' : ''}`}
                type="button"
                title={childFolder.path}
                style={{
                  gridTemplateColumns: '12px 16px minmax(0, 1fr) 38px',
                  paddingLeft: `${8 + depth * 14}px`,
                }}
                onClick={(event) => {
                  handleTreeSelection(childFolder.path, event.metaKey || event.ctrlKey, event.shiftKey);
                  toggleFolderExpanded(childFolder.path);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const nextSelectedPaths = selectedTreePaths.includes(childFolder.path)
                    ? selectedTreePaths
                    : [childFolder.path];
                  setSelectedTreePaths(nextSelectedPaths);
                  setAnchorTreePath(childFolder.path);
                  setContextMenuState({
                    x: event.clientX,
                    y: event.clientY,
                    targetPath: childFolder.path,
                    isFolder: true,
                    selectedPaths: nextSelectedPaths,
                  });
                }}
              >
                <span className={`gn-note-tree-caret ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
                  <TreeCaretIcon />
                </span>
                <span className="gn-note-tree-icon" aria-hidden="true" style={{ gridColumn: 2 }}>
                  <FolderIcon />
                </span>
                <span className="gn-note-tree-label" style={{ gridColumn: 3 }}>
                  {childFolder.name}
                </span>
                <span className="gn-note-tree-group-chip" style={{ gridColumn: 4 }}>
                  {childFolder.fileCount}
                </span>
              </button>
            </div>
            {isExpanded ? <div className="gn-note-tree-children">{renderKnowledgeTree(childFolder, depth + 1)}</div> : null}
          </div>
        );
      }

      for (const file of folder.files) {
        const noteMeta = file.note ? getNoteMeta(file.note) : null;
        const isSelected = selectedTreePaths.includes(file.path);
        nextNodes.push(
          <div key={file.id} className="gn-note-tree-row">
            <button
              className={`gn-note-tree-item file ${selectedNote?.id === file.note?.id || isSelected ? 'active' : ''}`}
              type="button"
              title={file.path}
              style={{ paddingLeft: `${22 + depth * 14}px` }}
              onClick={(event) => {
                handleTreeSelection(file.path, event.metaKey || event.ctrlKey, event.shiftKey);
                if (file.note) {
                  onSelectNote(file.note.id);
                } else {
                  onOpenAttachment(file.absolutePath);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const nextSelectedPaths = selectedTreePaths.includes(file.path)
                  ? selectedTreePaths
                  : [file.path];
                setSelectedTreePaths(nextSelectedPaths);
                setAnchorTreePath(file.path);
                setContextMenuState({
                  x: event.clientX,
                  y: event.clientY,
                  targetPath: file.path,
                  isFolder: false,
                  selectedPaths: nextSelectedPaths,
                });
              }}
            >
              <span className="gn-note-tree-icon" aria-hidden="true">
                <NoteKindIcon kind={file.note?.kind} />
              </span>
              <span className="gn-note-tree-label">{file.name}</span>
              {searchActive && file.note?.matchSnippet ? <span className="gn-note-tree-match">命中</span> : null}
              <span className="gn-note-tree-badge">{noteMeta?.badge || (file.extension || 'FILE').toUpperCase()}</span>
            </button>
          </div>
        );
      }

      return nextNodes;
    },
    [
      collapsedFolderPaths,
      handleTreeSelection,
      onOpenAttachment,
      onSelectNote,
      searchActive,
      selectedAncestorFolderPaths,
      selectedNote?.id,
      selectedTreePaths,
      toggleFolderExpanded,
    ]
  );

  return (
    <section
      className={`gn-note-workspace ${isRailResizing ? 'is-resizing-note-rail' : ''}`}
      style={{
        '--gn-note-rail-width': `${railWidth}px`,
      } as CSSProperties}
    >
      <aside className="gn-note-rail">
        <div className="gn-note-search-row">
          <label className="gn-note-inline-field">
            <span>检索方式</span>
            <select
              className="product-input"
              value={knowledgeRetrievalMethod}
              onChange={(event) =>
                onKnowledgeRetrievalMethodChange(event.target.value as KnowledgeRetrievalMethod)
              }
            >
              {KNOWLEDGE_RETRIEVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
          <button
            className="doc-action-btn gn-note-icon-btn gn-note-wiki-btn"
            type="button"
            onClick={onOrganizeKnowledge}
            title="刷新索引"
            aria-label="刷新索引"
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
        </div>

        <div className="gn-note-stats">
          <span>{notes.length} 条知识笔记</span>
          <span>{visibleNotes.length} 条当前可见</span>
          {isSearching ? <span>搜索中</span> : null}
          {isSyncing ? <span>同步中</span> : null}
        </div>

        {selectedTreePaths.length > 1 ? (
          <div className="gn-note-stats">
            <span>已选择 {selectedTreePaths.length} 项</span>
            <button
              className="pm-knowledge-context-action danger"
              type="button"
              onClick={() => onDeleteTreePaths(selectedTreePaths, null)}
            >
              批量删除
            </button>
          </div>
        ) : null}

        {error ? <div className="gn-note-error">{error}</div> : null}

        <div
          className="gn-note-list"
          onClick={closeKnowledgeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenuState({
              x: event.clientX,
              y: event.clientY,
              targetPath: null,
              isFolder: null,
              selectedPaths: selectedTreePaths,
            });
          }}
        >
          {hasVisibleTreeNodes ? (
            renderKnowledgeTree(visibleKnowledgeTree)
          ) : (
            <div className="gn-note-empty">{searchActive ? '没有匹配的笔记。' : '还没有知识笔记。'}</div>
          )}
        </div>

        {contextMenuState ? (
          <div
            className="pm-knowledge-context-menu"
            ref={contextMenuRef}
            style={{ left: `${contextMenuState.x}px`, top: `${contextMenuState.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="pm-knowledge-context-action"
              type="button"
              onClick={() => {
                closeKnowledgeContextMenu();
                onCreateNoteAtPath(
                  contextMenuState.isFolder === false && contextMenuState.targetPath
                    ? contextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                    : contextMenuState.targetPath
                );
              }}
            >
              新建笔记
            </button>
            <button
              className="pm-knowledge-context-action"
              type="button"
              onClick={() => {
                closeKnowledgeContextMenu();
                onCreateFolderAtPath(
                  contextMenuState.isFolder === false && contextMenuState.targetPath
                    ? contextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                    : contextMenuState.targetPath
                );
              }}
            >
              新建文件夹
            </button>
            {contextMenuState.targetPath ? (
              <button
                className="pm-knowledge-context-action"
                type="button"
                onClick={() => {
                  const targetPath = contextMenuState.targetPath;
                  if (!targetPath) {
                    return;
                  }

                  closeKnowledgeContextMenu();
                  onRenameTreePath(targetPath, contextMenuState.isFolder === true);
                }}
              >
                重命名
              </button>
            ) : null}
            <button
              className="pm-knowledge-context-action"
              type="button"
              onClick={() => {
                closeKnowledgeContextMenu();
                void navigator.clipboard?.writeText(
                  (contextMenuState.selectedPaths[0] || contextMenuState.targetPath || projectRootPath || '').toString()
                );
              }}
            >
              复制路径
            </button>
            <button
              className="pm-knowledge-context-action"
              type="button"
              onClick={() => {
                closeKnowledgeContextMenu();
                onRefreshFilesystem();
              }}
            >
              刷新目录
            </button>
            {contextMenuState.targetPath || contextMenuState.selectedPaths.length > 0 ? (
              <button
                className="pm-knowledge-context-action danger"
                type="button"
                onClick={() => {
                  closeKnowledgeContextMenu();
                  onDeleteTreePaths(
                    contextMenuState.selectedPaths.length > 0
                      ? contextMenuState.selectedPaths
                      : (contextMenuState.targetPath as string),
                    contextMenuState.isFolder
                  );
                }}
              >
                {contextMenuState.selectedPaths.length > 1 ? '批量删除' : '删除'}
              </button>
            ) : null}
          </div>
        ) : null}
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
                {viewMode === 'code' ? (
                  <input
                    className="gn-note-title-input"
                    type="text"
                    value={titleValue}
                    onChange={(event) => onTitleChange(event.target.value)}
                    aria-label="笔记标题"
                    disabled={!editable}
                  />
                ) : (
                  <div className="gn-note-reading-title-hint">
                    <strong>{titleValue || selectedNote.title}</strong>
                    <span>阅读态会隐藏 Markdown 语法，像文章一样展示。</span>
                  </div>
                )}
                <div className="gn-note-reading-chrome">
                  <div className="gn-note-mode-toggle" role="tablist" aria-label="Markdown 查看模式">
                    <button
                      className={viewMode === 'read' ? 'active' : ''}
                      type="button"
                      onClick={() => setViewMode('read')}
                    >
                      阅读
                    </button>
                    <button
                      className={viewMode === 'code' ? 'active' : ''}
                      type="button"
                      onClick={() => setViewMode('code')}
                    >
                      代码
                    </button>
                  </div>
                  <div className="gn-note-storage-state" aria-label="笔记存储状态">
                    <span>{getNoteMeta(selectedNote).label}</span>
                    <span>{mirrorSourcePath ? 'Markdown 镜像' : '未绑定 Markdown'}</span>
                  </div>
                </div>
              </div>
              <div className="gn-note-editor-body">
                {viewMode === 'read' ? (
                  <div className="gn-note-reading-surface">
                    <KnowledgeMarkdownViewer
                      markdown={readingMarkdown}
                      onOpenInternalLink={handleOpenInternalMarkdownLink}
                    />
                  </div>
                ) : (
                  <GoodNightMarkdownEditor
                    key={selectedNote.id}
                    value={editorValue}
                    onChange={onEditorChange}
                    editable={editable}
                  />
                )}
              </div>
            </div>

            <footer className="gn-note-editor-footer">
              <span>
                {saveMessage || (editable ? '笔记保存到知识库；已绑定 Markdown 时会同步镜像。' : '当前是只读兼容投影。')}
              </span>
              <div className="gn-note-editor-footer-actions">
                <span>更新于 {formatUpdatedAt(selectedNote.updatedAt)}</span>
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
                刷新索引
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onCreateNote}>
                新建笔记
              </button>
            </div>
          </div>
        )}
      </main>
    </section>
  );
};
