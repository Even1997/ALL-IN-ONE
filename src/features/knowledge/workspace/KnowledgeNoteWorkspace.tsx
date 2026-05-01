import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { GoodNightMarkdownEditor } from '../../../components/product/GoodNightMarkdownEditor';
import { getRelativePathFromRoot, normalizeRelativeFileSystemPath } from '../../../utils/fileSystemPaths';
import type { KnowledgeDiskItem } from '../../../modules/knowledge/knowledgeTree';
import type { KnowledgeNote } from '../model/knowledge';
import { serializeKnowledgeNoteMarkdown, splitKnowledgeNoteEditorDocument } from './knowledgeNoteMarkdown';
import { KnowledgeMarkdownViewer, type KnowledgeInternalLinkTarget } from './KnowledgeMarkdownViewer';

type KnowledgeViewMode = 'read' | 'code';
type KnowledgeTreeSortMode =
  | 'name-asc'
  | 'name-desc'
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'created-asc';

type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  diskItems: KnowledgeDiskItem[];
  selectedNote: KnowledgeNote | null;
  projectRootPath?: string | null;
  temporaryContentPreview?: {
    title: string;
    artifactType: string;
    summary: string;
    body: string;
  } | null;
  titleValue: string;
  mirrorSourcePath?: string | null;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  searchValue: string;
  isSearching: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onTitleChange: (value: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreateNote: () => void;
  onCreateNoteAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  onOpenAttachment: (attachmentPath: string) => void;
};

type KnowledgeTreeFileNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  note: KnowledgeNote | null;
  extension: string;
  updatedAt: string | null;
  createdAt: string | null;
};

type KnowledgeTreeFolderNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string | null;
  folders: KnowledgeTreeFolderNode[];
  files: KnowledgeTreeFileNode[];
  fileCount: number;
  updatedAt: string | null;
  createdAt: string | null;
};

type MutableKnowledgeTreeFolderNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string | null;
  folders: Map<string, MutableKnowledgeTreeFolderNode>;
  files: KnowledgeTreeFileNode[];
  updatedAt: string | null;
  createdAt: string | null;
};

type KnowledgeTreeSortableItem = {
  name: string;
  updatedAt?: string;
  createdAt?: string;
};

type KnowledgeTreeSortableValue = Omit<KnowledgeTreeSortableItem, 'updatedAt' | 'createdAt'> & {
  updatedAt?: string | null;
  createdAt?: string | null;
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

type RawMarkdownPreview = {
  path: string;
  title: string;
  markdown: string;
  state: 'loading' | 'ready' | 'error';
};

const NOTE_RAIL_WIDTH_BOUNDS = { min: 220, max: 420 };
const NOTE_RAIL_DEFAULT_WIDTH = 280;
const PREVIEWABLE_KNOWLEDGE_FILE_EXTENSIONS = new Set(['md', 'markdown']);
const KNOWLEDGE_TREE_SORT_OPTIONS = [
  { value: 'name-asc', label: '文件名(A-Z)' },
  { value: 'name-desc', label: '文件名(Z-A)' },
  { value: 'updated-desc', label: '编辑时间(从新到旧)' },
  { value: 'updated-asc', label: '编辑时间(从旧到新)' },
  { value: 'created-desc', label: '创建时间(从新到旧)' },
  { value: 'created-asc', label: '创建时间(从旧到新)' },
] satisfies Array<{ value: KnowledgeTreeSortMode; label: string }>;
const TEMPORARY_PREVIEW_STYLES = `
.gn-note-temporary-preview {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(120, 140, 180, 0.22);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(246, 249, 255, 0.98), rgba(239, 244, 255, 0.92));
  box-shadow: 0 16px 28px rgba(24, 39, 75, 0.08);
}

.gn-note-temporary-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gn-note-temporary-preview-head strong {
  font-size: 15px;
}

.gn-note-temporary-preview-head span {
  color: rgba(57, 78, 112, 0.76);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.gn-note-temporary-preview p,
.gn-note-temporary-preview pre {
  margin: 0;
}

.gn-note-temporary-preview p {
  color: rgba(33, 45, 68, 0.82);
  line-height: 1.6;
}

.gn-note-temporary-preview pre {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  color: rgba(24, 39, 75, 0.88);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
`;

const clampNoteRailWidth = (value: number) =>
  Math.min(NOTE_RAIL_WIDTH_BOUNDS.max, Math.max(NOTE_RAIL_WIDTH_BOUNDS.min, value));

const isPreviewableKnowledgeFile = (extension: string) =>
  PREVIEWABLE_KNOWLEDGE_FILE_EXTENSIONS.has(extension.toLowerCase());

const normalizeToolViewContent = (content: string) =>
  content
    .replace(/^<file>\n/, '')
    .replace(/\n<\/file>\n?$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\|/, ''))
    .join('\n');

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

const SortIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M6 5.25h8M6 10h5M6 14.75h2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="m12.75 12.75 2 2 2-2M14.75 6v8.75"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CollapseAllIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M4.75 5.75h10.5M4.75 10h7.5M4.75 14.25h10.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="m13 8.25 2-2 2 2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ExpandAllIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M4.75 5.75h10.5M4.75 10h7.5M4.75 14.25h10.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="m13 6.25 2 2 2-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
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

const NOTE_KIND_META: Record<NonNullable<KnowledgeNote['kind']>, { badge: string; label: string }> = {
  note: { badge: 'NOTE', label: '项目笔记' },
  sketch: { badge: 'SKETCH', label: '草图笔记' },
  design: { badge: 'DESIGN', label: '设计笔记' },
};

const getNoteMeta = (note: KnowledgeNote) => {
  if (note.docType) {
    return {
      badge: 'SYSTEM',
      label: '系统生成',
    };
  }

  return NOTE_KIND_META[note.kind || 'note'];
};

const compareTreeNames = (left: string, right: string) =>
  left.localeCompare(right, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });

const compareTimestamps = (leftValue?: string | null, rightValue?: string | null) => {
  const leftTime = leftValue ? new Date(leftValue).getTime() : Number.NaN;
  const rightTime = rightValue ? new Date(rightValue).getTime() : Number.NaN;
  const normalizedLeft = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime;
  const normalizedRight = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime;
  return normalizedLeft - normalizedRight;
};

const compareKnowledgeTreeItems = (
  left: KnowledgeTreeSortableValue,
  right: KnowledgeTreeSortableValue,
  sortMode: KnowledgeTreeSortMode
) => {
  switch (sortMode) {
    case 'name-desc':
      return compareTreeNames(right.name, left.name);
    case 'updated-desc': {
      const leftValue = left.updatedAt;
      const rightValue = right.updatedAt;
      return compareTimestamps(rightValue, leftValue) || compareTreeNames(left.name, right.name);
    }
    case 'updated-asc': {
      const leftValue = left.updatedAt;
      const rightValue = right.updatedAt;
      return compareTimestamps(leftValue, rightValue) || compareTreeNames(left.name, right.name);
    }
    case 'created-desc': {
      const leftValue = left.createdAt;
      const rightValue = right.createdAt;
      return compareTimestamps(rightValue, leftValue) || compareTreeNames(left.name, right.name);
    }
    case 'created-asc': {
      const leftValue = left.createdAt;
      const rightValue = right.createdAt;
      return compareTimestamps(leftValue, rightValue) || compareTreeNames(left.name, right.name);
    }
    case 'name-asc':
    default:
      return compareTreeNames(left.name, right.name);
  }
};

const resolveLatestTreeTimestamp = (values: Array<string | null>) => {
  let latestValue: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const time = new Date(value).getTime();
    if (Number.isNaN(time) || time <= latestTime) {
      continue;
    }

    latestTime = time;
    latestValue = value;
  }

  return latestValue;
};

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
  sortMode: KnowledgeTreeSortMode,
  projectRootPath?: string | null
): KnowledgeTreeFolderNode => {
  const root: MutableKnowledgeTreeFolderNode = {
    id: 'root',
    name: '',
    path: '',
    absolutePath: projectRootPath || null,
    folders: new Map<string, MutableKnowledgeTreeFolderNode>(),
    files: [],
    updatedAt: null,
    createdAt: null,
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
        updatedAt: null,
        createdAt: null,
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
    } else if (!matchesGenericSearch) {
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
      updatedAt: linkedNote?.updatedAt || null,
      createdAt: linkedNote?.createdAt || linkedNote?.updatedAt || null,
    });
  }

  const finalizeFolder = (folder: MutableKnowledgeTreeFolderNode): KnowledgeTreeFolderNode => {
    const folders = [...folder.folders.values()]
      .map((child) => finalizeFolder(child))
      .sort((left, right) => compareKnowledgeTreeItems(left, right, sortMode));
    const files = [...folder.files].sort((left, right) => compareKnowledgeTreeItems(left, right, sortMode));
    const timestampValues = [
      ...folders.flatMap((child) => [child.updatedAt, child.createdAt]),
      ...files.flatMap((file) => [file.updatedAt, file.createdAt]),
    ];

    const finalizedFolder: KnowledgeTreeFolderNode = {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      absolutePath: folder.absolutePath,
      folders,
      files,
      fileCount: 0,
      updatedAt: resolveLatestTreeTimestamp(timestampValues),
      createdAt: resolveLatestTreeTimestamp(
        [...folders.map((child) => child.createdAt), ...files.map((file) => file.createdAt)]
      ),
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

const collectAllFolderPaths = (folder: KnowledgeTreeFolderNode) => {
  const paths = new Set<string>();

  for (const childFolder of folder.folders) {
    paths.add(childFolder.path);
    for (const nestedPath of collectAllFolderPaths(childFolder)) {
      paths.add(nestedPath);
    }
  }

  return paths;
};

export const KnowledgeNoteWorkspace = ({
  notes,
  filteredNotes,
  diskItems,
  selectedNote,
  projectRootPath = null,
  temporaryContentPreview = null,
  titleValue,
  mirrorSourcePath = null,
  editorValue,
  editable,
  isSaving,
  saveMessage,
  canSave,
  searchValue,
  isSearching,
  error,
  onSearchChange,
  onSelectNote,
  onTitleChange,
  onEditorChange,
  onSave,
  onDelete,
  onCreateNote,
  onCreateNoteAtPath,
  onCreateFolderAtPath,
  onRenameTreePath,
  onDeleteTreePaths,
  onRefreshFilesystem,
  onOpenAttachment,
}: KnowledgeNoteWorkspaceProps) => {
  const rawMarkdownRequestIdRef = useRef(0);
  const [railWidth, setRailWidth] = useState(NOTE_RAIL_DEFAULT_WIDTH);
  const [isRailResizing, setIsRailResizing] = useState(false);
  const [treeSortMode, setTreeSortMode] = useState<KnowledgeTreeSortMode>('name-asc');
  const [collapsedFolderPaths, setCollapsedFolderPaths] = useState<Set<string>>(() => new Set());
  const [selectedTreePaths, setSelectedTreePaths] = useState<string[]>([]);
  const [anchorTreePath, setAnchorTreePath] = useState<string | null>(null);
  const [activeTreePath, setActiveTreePath] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<KnowledgeContextMenuState>(null);
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>('read');
  const [rawMarkdownPreview, setRawMarkdownPreview] = useState<RawMarkdownPreview | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const searchActive = searchValue.trim().length > 0;
  const visibleNotes = filteredNotes;
  const visibleKnowledgeTree = useMemo(
    () => buildKnowledgeTree(diskItems, notes, filteredNotes, searchValue, treeSortMode, projectRootPath),
    [diskItems, filteredNotes, notes, projectRootPath, searchValue, treeSortMode]
  );
  const hasVisibleTreeNodes = visibleKnowledgeTree.folders.length > 0 || visibleKnowledgeTree.files.length > 0;
  const allVisibleFolderPaths = useMemo(
    () => collectAllFolderPaths(visibleKnowledgeTree),
    [visibleKnowledgeTree]
  );
  const selectedTreeFilePath = useMemo(
    () => (selectedNote ? resolveNoteTreeFilePath(selectedNote, projectRootPath) : ''),
    [projectRootPath, selectedNote]
  );
  const isMultiSelecting = selectedTreePaths.length > 1;
  const allFoldersCollapsed =
    allVisibleFolderPaths.size > 0 && allVisibleFolderPaths.size === collapsedFolderPaths.size;
  const selectedAncestorFolderPaths = useMemo(
    () => collectAncestorFolderPaths(selectedTreeFilePath),
    [selectedTreeFilePath]
  );
  const readingMarkdown = useMemo(
    () => (selectedNote ? serializeKnowledgeNoteMarkdown(titleValue, editorValue) : ''),
    [editorValue, selectedNote, titleValue]
  );
  const handleDocumentMarkdownChange = useCallback(
    (nextMarkdown: string) => {
      const parsed = splitKnowledgeNoteEditorDocument(nextMarkdown, titleValue);
      onTitleChange(parsed.title);
      onEditorChange(parsed.body);
    },
    [onEditorChange, onTitleChange, titleValue]
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

  const handleToggleAllFolders = useCallback(() => {
    setCollapsedFolderPaths(allFoldersCollapsed ? new Set() : collectAllFolderPaths(visibleKnowledgeTree));
  }, [allFoldersCollapsed, visibleKnowledgeTree]);

  const flattenVisibleTreePaths = useCallback((folder: KnowledgeTreeFolderNode): string[] => {
    const paths: string[] = [];

    for (const childFolder of folder.folders) {
      paths.push(childFolder.path);
      const isExpanded = !collapsedFolderPaths.has(childFolder.path);
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

  const handleOpenRawMarkdownPreview = useCallback(async (file: KnowledgeTreeFileNode) => {
    const requestId = rawMarkdownRequestIdRef.current + 1;
    rawMarkdownRequestIdRef.current = requestId;
    setViewMode('read');
    setRawMarkdownPreview({
      path: file.absolutePath,
      title: file.name,
      markdown: '正在载入 Markdown 预览...',
      state: 'loading',
    });

    try {
      const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_view', {
        params: {
          file_path: file.absolutePath,
          offset: 0,
          limit: 4000,
        },
      });

      if (rawMarkdownRequestIdRef.current !== requestId) {
        return;
      }

      if (!result.success) {
        throw new Error(result.error || `读取文件失败：${file.name}`);
      }

      setRawMarkdownPreview({
        path: file.absolutePath,
        title: file.name,
        markdown: normalizeToolViewContent(result.content),
        state: 'ready',
      });
    } catch (error) {
      if (rawMarkdownRequestIdRef.current !== requestId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      setRawMarkdownPreview({
        path: file.absolutePath,
        title: file.name,
        markdown: `> 无法读取这个 Markdown 文件。\n\n\`\`\`\n${errorMessage}\n\`\`\``,
        state: 'error',
      });
    }
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
    if (selectedAncestorFolderPaths.size === 0) {
      return;
    }

    setCollapsedFolderPaths((current) => {
      const next = new Set(current);
      for (const ancestorPath of selectedAncestorFolderPaths) {
        next.delete(ancestorPath);
      }
      return next;
    });
  }, [selectedAncestorFolderPaths]);

  useEffect(() => {
    if (rawMarkdownPreview) {
      return;
    }

    if (selectedTreeFilePath) {
      setActiveTreePath(selectedTreeFilePath);
      return;
    }

    setActiveTreePath((current) => (current && visibleTreePaths.includes(current) ? current : null));
  }, [rawMarkdownPreview, selectedTreeFilePath, visibleTreePaths]);

  useEffect(() => {
    setViewMode('read');
    setRawMarkdownPreview(null);
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
        const isExpanded = !collapsedFolderPaths.has(childFolder.path);
        const isSelected = selectedTreePaths.includes(childFolder.path);
        const isActive = isMultiSelecting && isSelected;

        nextNodes.push(
          <div key={childFolder.path} className="gn-note-tree-group">
            <div className="gn-note-tree-row">
              <button
                className={`gn-note-tree-item folder ${isActive ? 'active' : ''}`}
                type="button"
                title={childFolder.path}
                style={{
                  gridTemplateColumns: '12px 16px minmax(0, 1fr) 38px',
                  paddingLeft: `${8 + depth * 14}px`,
                }}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) {
                    handleTreeSelection(childFolder.path, event.metaKey || event.ctrlKey, event.shiftKey);
                  } else {
                    setSelectedTreePaths([]);
                    setAnchorTreePath(childFolder.path);
                    setActiveTreePath(null);
                  }
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
        const isCurrentNote = activeTreePath === file.path;
        const isActive = isCurrentNote || (isMultiSelecting && isSelected);
        nextNodes.push(
          <div key={file.id} className="gn-note-tree-row">
            <button
              className={`gn-note-tree-item file ${isActive ? 'active' : ''}`}
              type="button"
              title={file.path}
              style={{ paddingLeft: `${22 + depth * 14}px` }}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                  handleTreeSelection(file.path, event.metaKey || event.ctrlKey, event.shiftKey);
                } else {
                  setSelectedTreePaths([]);
                  setAnchorTreePath(file.path);
                  setActiveTreePath(file.path);
                }
                if (file.note) {
                  setRawMarkdownPreview(null);
                  onSelectNote(file.note.id);
                } else if (isPreviewableKnowledgeFile(file.extension)) {
                  void handleOpenRawMarkdownPreview(file);
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
      handleOpenRawMarkdownPreview,
      isMultiSelecting,
      onOpenAttachment,
      onSelectNote,
      searchActive,
      activeTreePath,
      selectedAncestorFolderPaths,
      selectedTreePaths,
      setRawMarkdownPreview,
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
          <input
            className="product-input"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索标题、正文、标签"
          />
        </div>

        <div className="gn-note-rail-actions">
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
            className="doc-action-btn gn-note-icon-btn"
            type="button"
            onClick={() => onCreateFolderAtPath(null)}
            title="新建文件夹"
            aria-label="新建文件夹"
          >
            <FolderIcon />
          </button>
          <label
            className="doc-action-btn gn-note-icon-btn gn-note-icon-select"
            title="知识库排序"
            aria-label="知识库排序"
          >
            <SortIcon />
            <select
              className="gn-note-icon-select-input"
              value={treeSortMode}
              onChange={(event) => setTreeSortMode(event.target.value as KnowledgeTreeSortMode)}
              aria-label="知识库排序"
            >
              {KNOWLEDGE_TREE_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="doc-action-btn gn-note-icon-btn"
            type="button"
            onClick={handleToggleAllFolders}
            title={allFoldersCollapsed ? '全部展开' : '全部折叠'}
            aria-label={allFoldersCollapsed ? '全部展开' : '全部折叠'}
          >
            {allFoldersCollapsed ? <ExpandAllIcon /> : <CollapseAllIcon />}
          </button>
        </div>

        <div className="gn-note-stats">
          <span>{notes.length} 条知识笔记</span>
          <span>{visibleNotes.length} 条当前可见</span>
          {isSearching ? <span>搜索中</span> : null}
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
        <style>{TEMPORARY_PREVIEW_STYLES}</style>
        {temporaryContentPreview ? (
          <section className="gn-note-temporary-preview">
            <div className="gn-note-temporary-preview-head">
              <strong>{temporaryContentPreview.title}</strong>
              <span>{temporaryContentPreview.artifactType}</span>
            </div>
            <p>{temporaryContentPreview.summary}</p>
            <pre>{temporaryContentPreview.body}</pre>
          </section>
        ) : null}
        {rawMarkdownPreview ? (
          <>
            <div className="gn-note-editor-surface">
              <div className="gn-note-editor-title-row">
                <div className="gn-note-reading-title-hint">
                  <strong>{rawMarkdownPreview.title}</strong>
                  <span>从项目文件只读预览，当前不会写回知识库。</span>
                </div>
                <div className="gn-note-reading-chrome">
                  <div className="gn-note-storage-state" aria-label="Markdown 文件预览状态">
                    <span>只读预览</span>
                    <span>
                      {rawMarkdownPreview.state === 'loading'
                        ? '读取中'
                        : rawMarkdownPreview.state === 'error'
                          ? '读取失败'
                          : '项目 Markdown'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="gn-note-editor-body">
                <div className="gn-note-reading-surface">
                  <KnowledgeMarkdownViewer
                    markdown={rawMarkdownPreview.markdown}
                    onOpenInternalLink={handleOpenInternalMarkdownLink}
                  />
                </div>
              </div>
            </div>

            <footer className="gn-note-editor-footer">
              <span>从项目文件只读预览</span>
              <div className="gn-note-editor-footer-actions">
                <span className="gn-note-editor-footer-path" title={rawMarkdownPreview.path}>
                  {rawMarkdownPreview.path}
                </span>
              </div>
            </footer>
          </>
        ) : selectedNote ? (
          <>
            <div className="gn-note-editor-surface">
              <div className="gn-note-editor-title-row">
                <div className="gn-note-reading-title-hint">
                  <strong>{viewMode === 'read' ? '第一行直接编辑标题' : '第一行使用 # 标题'}</strong>
                  <span>{viewMode === 'read' ? '第二行开始是正文，阅读态会按文章排版直接编辑。' : '代码态显示原始 Markdown 源码，标题和正文仍是同一份文档。'}</span>
                </div>
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
                  <div className="gn-note-reading-surface gn-note-reading-editor-surface">
                    <GoodNightMarkdownEditor
                      key={`${selectedNote.id}:read`}
                      value={readingMarkdown}
                      onChange={handleDocumentMarkdownChange}
                      editable={editable}
                    />
                  </div>
                ) : (
                  <div className="gn-note-code-surface">
                    <textarea
                      className="gn-note-code-textarea"
                      value={readingMarkdown}
                      onChange={(event) => handleDocumentMarkdownChange(event.target.value)}
                      aria-label="笔记 Markdown 源码"
                      spellCheck={false}
                      disabled={!editable}
                    />
                  </div>
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
            <h2>选择或新建一条 Vault 笔记</h2>
            <div className="gn-note-empty-actions">
              <button className="doc-action-btn" type="button" onClick={onCreateNote}>
                新建笔记
              </button>
            </div>
          </div>
        )}
      </main>
    </section>
  );
};
