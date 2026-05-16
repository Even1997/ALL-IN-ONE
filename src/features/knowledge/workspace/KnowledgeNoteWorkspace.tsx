// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { GoodNightMarkdownEditor } from '../../../components/product/GoodNightMarkdownEditor';
import { EmptyStateView, StateCard, StatusBanner } from '../../../components/ui';
import { useAIContextStore } from '../../../modules/ai/store/aiContextStore';
import { getRelativePathFromRoot, normalizeRelativeFileSystemPath } from '../../../utils/fileSystemPaths';
import type { KnowledgeDiskItem } from '../../../modules/knowledge/knowledgeTree';
import type { KnowledgeNote } from '../model/knowledge';
import { serializeKnowledgeNoteMarkdown, splitKnowledgeNoteEditorDocument } from './knowledgeNoteMarkdown';
import { KnowledgeMarkdownViewer, type KnowledgeInternalLinkTarget } from './KnowledgeMarkdownViewer';
import {
  buildProjectionArtifactRelativePaths,
  buildProjectionReferenceFile,
  buildTextProjection,
  buildSelectionProjection,
  buildSelectionReferenceFile,
  loadWorkbenchFileModel,
} from './documentProjection.ts';
import { useDocumentProjectionStore } from './documentProjectionStore.ts';
import type { DocumentProjection } from './documentWorkbenchTypes.ts';

type KnowledgeViewMode = 'read' | 'code';
type KnowledgeTreeSortMode =
  | 'name-asc'
  | 'name-desc'
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'created-asc';

type KnowledgeNoteWorkspaceProps = {
  projectId?: string | null;
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
  onCreateFileAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  onOpenAttachment: (attachmentPath: string) => void;
};

type FilePreviewPersistResult = {
  ok: boolean;
  error?: string;
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
      targetAbsolutePath?: string | null;
      targetTitle?: string | null;
      targetNoteId?: string | null;
      isFolder: boolean | null;
      selectedPaths: string[];
      allowReference?: boolean;
    }
  | null;

type DocumentSelectionState = {
  text: string;
  anchor: string;
} | null;

type DocumentContextMenuState =
  | {
      x: number;
      y: number;
      selection: DocumentSelectionState;
    }
  | null;

type FilePreviewKind = 'markdown' | 'code' | 'text' | 'image' | 'pdf' | 'word' | 'sheet' | 'slide' | 'binary';

type FilePreview = {
  path: string;
  title: string;
  draftContent: string;
  savedContent: string;
  kind: FilePreviewKind;
  state: 'loading' | 'ready' | 'error';
  projection?: DocumentProjection | null;
  previewUrl?: string;
  errorMessage?: string;
  imageMeta?: {
    width: number;
    height: number;
    mimeType: string;
  } | null;
  pdfMeta?: {
    pageCount: number | null;
  } | null;
};

const NOTE_RAIL_WIDTH_BOUNDS = { min: 220, max: 420 };
const NOTE_RAIL_DEFAULT_WIDTH = 280;
const PREVIEWABLE_MARKDOWN_FILE_EXTENSIONS = new Set(['md', 'markdown']);
const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const PDF_FILE_EXTENSIONS = new Set(['pdf']);
const WORD_FILE_EXTENSIONS = new Set(['doc', 'docx']);
const SHEET_FILE_EXTENSIONS = new Set(['xlsx', 'csv']);
const SLIDE_FILE_EXTENSIONS = new Set(['pptx']);
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

const DOCUMENT_WORKBENCH_STYLES = `
.gn-note-document-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  width: min(100%, var(--atomic-editor-measure, 76ch));
  margin: 0 auto;
  padding: 14px 22px 10px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--mode-border, rgba(148, 163, 184, 0.18));
}

.gn-note-document-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.gn-note-document-meta strong {
  min-width: 0;
  overflow: hidden;
  color: var(--mode-text, #0f172a);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gn-note-document-subline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  color: var(--mode-muted, #64748b);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.gn-note-document-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.gn-note-document-actions .doc-action-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
}

.gn-note-doc-selection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(100%, var(--atomic-editor-measure, 76ch));
  margin: 0 auto;
  padding: 10px 22px 0;
  box-sizing: border-box;
}

.gn-note-doc-selection-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  padding: 8px 10px;
  border: 1px solid var(--mode-border, rgba(148, 163, 184, 0.18));
  border-radius: 10px;
  background: color-mix(in srgb, var(--mode-panel-lite, #f8fafc) 78%, transparent);
  color: var(--mode-muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gn-note-doc-projection-summary {
  display: grid;
  gap: 10px;
  width: min(100%, var(--atomic-editor-measure, 76ch));
  margin: 0 auto 14px;
}

.gn-note-doc-block {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--mode-border, rgba(148, 163, 184, 0.18));
  border-radius: 12px;
  background: color-mix(in srgb, var(--mode-panel-lite, #f8fafc) 82%, transparent);
}

.gn-note-doc-block strong,
.gn-note-doc-block p {
  margin: 0;
}

.gn-note-doc-block p {
  color: var(--mode-muted, #64748b);
  font-size: 13px;
  line-height: 1.65;
}
`;

const clampNoteRailWidth = (value: number) =>
  Math.min(NOTE_RAIL_WIDTH_BOUNDS.max, Math.max(NOTE_RAIL_WIDTH_BOUNDS.min, value));

const getKnowledgeFilePreviewKind = (extension: string): FilePreviewKind => {
  const normalizedExtension = extension.toLowerCase();
  if (PREVIEWABLE_MARKDOWN_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'markdown';
  }

  if (IMAGE_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'image';
  }

  if (PDF_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'pdf';
  }

  if (WORD_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'word';
  }

  if (SHEET_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'sheet';
  }

  if (SLIDE_FILE_EXTENSIONS.has(normalizedExtension)) {
    return 'slide';
  }

  if (['txt', 'json', 'yml', 'yaml'].includes(normalizedExtension)) {
    return 'text';
  }

  return 'code';
};

const isProjectionEditableKind = (kind: FilePreviewKind) => ['sheet', 'slide'].includes(kind);

const getPreviewKindLabel = (preview: FilePreview) => {
  if (preview.kind === 'markdown') {
    return 'Markdown';
  }
  if (preview.kind === 'code') {
    return 'Code';
  }
  if (preview.kind === 'text') {
    return 'Text';
  }
  if (preview.kind === 'image') {
    return 'Image';
  }
  if (preview.kind === 'pdf') {
    return 'PDF';
  }
  if (preview.kind === 'word') {
    return 'Word Projection';
  }
  if (preview.kind === 'sheet') {
    return 'Sheet Projection';
  }
  if (preview.kind === 'slide') {
    return 'Slide Projection';
  }
  return 'Binary';
};
void getPreviewKindLabel;

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

const FileAddIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M6.5 3.75h5.25l3.75 3.75v8a1.75 1.75 0 0 1-1.75 1.75H6.5a1.75 1.75 0 0 1-1.75-1.75v-10A1.75 1.75 0 0 1 6.5 3.75Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M11.75 3.75v3.5h3.5M8 12.25h4.5M10.25 10v4.5"
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

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m3.5 8.25 2.6 2.6 6.4-6.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
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
  projectId = null,
  notes,
  filteredNotes,
  diskItems,
  selectedNote,
  projectRootPath = null,
  temporaryContentPreview = null,
  titleValue,
  editorValue,
  editable,
  isSaving,
  searchValue,
  isSearching,
  error,
  onSearchChange,
  onSelectNote,
  onTitleChange,
  onEditorChange,
  onCreateNote,
  onCreateNoteAtPath,
  onCreateFileAtPath,
  onCreateFolderAtPath,
  onRenameTreePath,
  onDeleteTreePaths,
  onRefreshFilesystem,
}: KnowledgeNoteWorkspaceProps) => {
  const filePreviewRequestIdRef = useRef(0);
  const filePreviewAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [railWidth, setRailWidth] = useState(NOTE_RAIL_DEFAULT_WIDTH);
  const [isRailResizing, setIsRailResizing] = useState(false);
  const [treeSortMode, setTreeSortMode] = useState<KnowledgeTreeSortMode>('name-asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [collapsedFolderPaths, setCollapsedFolderPaths] = useState<Set<string>>(() => new Set());
  const [selectedTreePaths, setSelectedTreePaths] = useState<string[]>([]);
  const [anchorTreePath, setAnchorTreePath] = useState<string | null>(null);
  const [activeTreePath, setActiveTreePath] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<KnowledgeContextMenuState>(null);
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>('read');
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [isSavingFilePreview, setIsSavingFilePreview] = useState(false);
  const [filePreviewSaveMessage, setFilePreviewSaveMessage] = useState<string | null>(null);
  const [documentSelection, setDocumentSelection] = useState<DocumentSelectionState>(null);
  const [documentContextMenuState, setDocumentContextMenuState] = useState<DocumentContextMenuState>(null);
  const [treeDropTargetPath, setTreeDropTargetPath] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const documentContextMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const documentSurfaceRef = useRef<HTMLDivElement | null>(null);
  const setSelectedReferenceFileIds = useAIContextStore((state) => state.setSelectedReferenceFileIds);
  const setSceneContext = useAIContextStore((state) => state.setSceneContext);
  const upsertReferenceFile = useDocumentProjectionStore((state) => state.upsertReferenceFile);
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
  const isFilePreviewDirty = Boolean(filePreview && filePreview.draftContent !== filePreview.savedContent);
  const isFilePreviewEditable = Boolean(
    filePreview &&
      filePreview.state === 'ready' &&
      (filePreview.kind === 'code' ||
        filePreview.kind === 'text' ||
        isProjectionEditableKind(filePreview.kind))
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
  const currentNoteProjection = useMemo(
    () =>
      selectedNote
        ? buildTextProjection(
            selectedNote.sourceUrl || selectedNote.title,
            selectedNote.title,
            'md',
            readingMarkdown,
          )
        : null,
    [readingMarkdown, selectedNote],
  );
  const filePreviewStatusLabel = useMemo(() => {
    if (!filePreview) {
      return '';
    }

    if (filePreview.state === 'loading') {
      return '读取中';
    }

    if (filePreview.state === 'error') {
      return filePreviewSaveMessage || '读取失败';
    }

    if (!isFilePreviewEditable) {
      return '只读预览';
    }

    if (isSavingFilePreview) {
      return '自动保存中';
    }

    if (isFilePreviewDirty) {
      return '编辑中';
    }

    return filePreviewSaveMessage || '已自动保存';
  }, [filePreview, filePreviewSaveMessage, isFilePreviewDirty, isFilePreviewEditable, isSavingFilePreview]);
  const noteSurfaceStatusLabel = editable ? (isSaving ? '自动保存中' : '自动保存') : '只读';

  const saveProjectionArtifacts = useCallback(
    async (projection: DocumentProjection) => {
      if (!projectRootPath) {
        return;
      }

      const artifactPaths = buildProjectionArtifactRelativePaths(projection.sourcePath);
      const absoluteJsonPath = normalizeRelativeFileSystemPath(`${projectRootPath}/${artifactPaths.json}`);
      const absoluteMarkdownPath = normalizeRelativeFileSystemPath(`${projectRootPath}/${artifactPaths.markdown}`);

      await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
        params: {
          file_path: absoluteJsonPath,
          content: JSON.stringify(projection, null, 2),
        },
      });
      await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
        params: {
          file_path: absoluteMarkdownPath,
          content: projection.markdown,
        },
      });
    },
    [projectRootPath],
  );

  const addReferenceFileToAI = useCallback(
    (referenceFile: ReturnType<typeof buildProjectionReferenceFile>) => {
      if (!projectId) {
        return;
      }

      upsertReferenceFile(projectId, referenceFile);
      const currentReferenceIds = useAIContextStore.getState().projects[projectId]?.selectedReferenceFileIds || [];
      setSelectedReferenceFileIds(projectId, [...currentReferenceIds, referenceFile.id]);
    },
    [projectId, setSelectedReferenceFileIds, upsertReferenceFile],
  );

  const handleAddCurrentDocumentToAI = useCallback(() => {
    if (selectedNote && projectId) {
      const currentReferenceIds = useAIContextStore.getState().projects[projectId]?.selectedReferenceFileIds || [];
      setSelectedReferenceFileIds(projectId, [...currentReferenceIds, selectedNote.id]);
      return;
    }

    if (filePreview?.projection) {
      addReferenceFileToAI(buildProjectionReferenceFile(filePreview.projection));
    }
  }, [addReferenceFileToAI, filePreview?.projection, projectId, selectedNote, setSelectedReferenceFileIds]);

  const handleAddSelectionToAI = useCallback(() => {
    const baseProjection = filePreview?.projection || currentNoteProjection;
    if (!baseProjection || !documentSelection) {
      return;
    }

    addReferenceFileToAI(
      buildSelectionReferenceFile(
        baseProjection,
        buildSelectionProjection(baseProjection, documentSelection.text, documentSelection.anchor),
      ),
    );
    setDocumentContextMenuState(null);
  }, [addReferenceFileToAI, currentNoteProjection, documentSelection, filePreview?.projection]);

  const refreshDocumentSelection = useCallback(() => {
    if (!documentSurfaceRef.current) {
      setDocumentSelection(null);
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
      const selectionStart = activeElement.selectionStart || 0;
      const selectionEnd = activeElement.selectionEnd || 0;
      const selectedText = activeElement.value.slice(selectionStart, selectionEnd).trim();
      setDocumentSelection(
        selectedText
          ? {
              text: selectedText,
              anchor: activeElement.getAttribute('data-selection-anchor') || 'selection',
            }
          : null,
      );
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setDocumentSelection(null);
      return;
    }

    const selectedText = selection.toString().trim();
    setDocumentSelection(selectedText ? { text: selectedText, anchor: 'selection' } : null);
  }, []);

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

  const closeSortMenu = useCallback(() => {
    setSortMenuOpen(false);
  }, []);

  const handleOpenFilePreview = useCallback(async (file: KnowledgeTreeFileNode) => {
    const previewKind = getKnowledgeFilePreviewKind(file.extension);

    const requestId = filePreviewRequestIdRef.current + 1;
    filePreviewRequestIdRef.current = requestId;
    setViewMode('read');
    setFilePreview({
      path: file.absolutePath,
      title: file.name,
      draftContent: previewKind === 'markdown' ? '正在载入 Markdown 预览...' : '正在载入文件预览...',
      savedContent: '',
      kind: previewKind,
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

      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      if (!result.success) {
        throw new Error(result.error || `读取文件失败：${file.name}`);
      }

      setFilePreview({
        path: file.absolutePath,
        title: file.name,
        draftContent: normalizeToolViewContent(result.content),
        savedContent: normalizeToolViewContent(result.content),
        kind: previewKind,
        state: 'ready',
      });
    } catch (error) {
      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      setFilePreview({
        path: file.absolutePath,
        title: file.name,
        draftContent:
          previewKind === 'markdown'
            ? `> 无法读取这个 Markdown 文件。\n\n\`\`\`\n${errorMessage}\n\`\`\``
            : `无法读取这个文件。\n\n${errorMessage}`,
        savedContent: '',
        kind: previewKind,
        state: 'error',
      });
    }
  }, []);
  void handleOpenFilePreview;

  const handleSaveFilePreview = useCallback(async (): Promise<FilePreviewPersistResult> => {
    if (!filePreview || filePreview.state !== 'ready' || !isFilePreviewDirty) {
      return { ok: true };
    }

    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
      params: {
        file_path: filePreview.path,
        content: filePreview.draftContent,
      },
    });

    if (!result.success) {
      setFilePreview((current) =>
        current && current.path === filePreview.path
          ? {
              ...current,
              draftContent: `无法保存这个文件。\n\n${result.error || '保存失败。'}`,
              state: 'error',
            }
          : current
      );
      return {
        ok: false,
        error: result.error || '保存失败。',
      };
    }

    setFilePreview((current) =>
      current && current.path === filePreview.path
        ? {
            ...current,
            savedContent: current.draftContent,
          }
        : current
    );
    onRefreshFilesystem();
    return { ok: true };
  }, [filePreview, isFilePreviewDirty, onRefreshFilesystem]);

  const handleOpenWorkbenchFilePreview = useCallback(async (file: KnowledgeTreeFileNode) => {
    const requestId = filePreviewRequestIdRef.current + 1;
    filePreviewRequestIdRef.current = requestId;
    setViewMode('read');
    setFilePreview({
      path: file.absolutePath,
      title: file.name,
      draftContent: 'Loading document preview...',
      savedContent: '',
      kind: getKnowledgeFilePreviewKind(file.extension),
      state: 'loading',
      projection: null,
    });

    try {
      const nextModel = await loadWorkbenchFileModel(file.absolutePath, file.name);
      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      if (nextModel.projection) {
        await saveProjectionArtifacts(nextModel.projection);
        if (projectId) {
          upsertReferenceFile(projectId, buildProjectionReferenceFile(nextModel.projection));
          setSceneContext(projectId, {
            scene: 'vault',
            selectedKnowledgeEntryId: nextModel.projection.id,
          });
        }
      }

      setFilePreview(nextModel);
    } catch (error) {
      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      setFilePreview({
        path: file.absolutePath,
        title: file.name,
        draftContent: `Unable to read this file.\n\n${errorMessage}`,
        savedContent: '',
        kind: getKnowledgeFilePreviewKind(file.extension),
        state: 'error',
        projection: null,
        errorMessage,
      });
    }
  }, [projectId, saveProjectionArtifacts, setSceneContext, upsertReferenceFile]);

  const handleSaveWorkbenchFilePreview = useCallback(async (): Promise<FilePreviewPersistResult> => {
    if (!filePreview || filePreview.state !== 'ready' || !isFilePreviewDirty) {
      return { ok: true };
    }

    setIsSavingFilePreview(true);
    try {
      if (isProjectionEditableKind(filePreview.kind) && filePreview.projection) {
        const nextProjection = {
          ...filePreview.projection,
          markdown: filePreview.draftContent,
          updatedAt: new Date().toISOString(),
        };
        await saveProjectionArtifacts(nextProjection);
        setFilePreview((current) =>
          current && current.path === filePreview.path
            ? {
                ...current,
                projection: nextProjection,
                savedContent: current.draftContent,
              }
            : current
        );
        if (projectId) {
          upsertReferenceFile(projectId, buildProjectionReferenceFile(nextProjection));
        }
        setFilePreviewSaveMessage('Auto-saved');
        return { ok: true };
      }

      const result = await handleSaveFilePreview();
      setFilePreviewSaveMessage(result.ok ? 'Auto-saved' : result.error || 'Save failed');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFilePreviewSaveMessage(errorMessage);
      setFilePreview((current) =>
        current && current.path === filePreview.path
          ? {
              ...current,
              state: 'error',
              errorMessage,
            }
          : current
      );
      return {
        ok: false,
        error: errorMessage,
      };
    } finally {
      setIsSavingFilePreview(false);
    }
  }, [filePreview, handleSaveFilePreview, isFilePreviewDirty, projectId, saveProjectionArtifacts, upsertReferenceFile]);

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
    if (filePreview) {
      return;
    }

    if (selectedTreeFilePath) {
      setActiveTreePath(selectedTreeFilePath);
      return;
    }

    setActiveTreePath((current) => (current && visibleTreePaths.includes(current) ? current : null));
  }, [filePreview, selectedTreeFilePath, visibleTreePaths]);

  useEffect(() => {
    setViewMode('read');
    setFilePreview(null);
    setDocumentSelection(null);
  }, [selectedNote?.id]);

  useEffect(() => {
    setFilePreviewSaveMessage(null);
    setIsSavingFilePreview(false);

    if (filePreviewAutoSaveTimerRef.current) {
      clearTimeout(filePreviewAutoSaveTimerRef.current);
      filePreviewAutoSaveTimerRef.current = null;
    }
  }, [filePreview?.path]);

  useEffect(() => {
    if (!filePreview || !isFilePreviewEditable || !isFilePreviewDirty || filePreview.state !== 'ready') {
      return;
    }

    if (filePreviewAutoSaveTimerRef.current) {
      clearTimeout(filePreviewAutoSaveTimerRef.current);
    }

    filePreviewAutoSaveTimerRef.current = setTimeout(() => {
      void handleSaveWorkbenchFilePreview();
    }, 500);

    return () => {
      if (filePreviewAutoSaveTimerRef.current) {
        clearTimeout(filePreviewAutoSaveTimerRef.current);
        filePreviewAutoSaveTimerRef.current = null;
      }
    };
  }, [
    filePreview,
    handleSaveWorkbenchFilePreview,
    isFilePreviewDirty,
    isFilePreviewEditable,
  ]);

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

  useEffect(() => {
    if (!documentContextMenuState) {
      return;
    }

    const closeMenu = (event: Event) => {
      if (event.target instanceof Node && documentContextMenuRef.current?.contains(event.target)) {
        return;
      }
      setDocumentContextMenuState(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [documentContextMenuState]);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
    }
  }, [contextMenuState]);

  useEffect(() => {
    if (!sortMenuOpen) {
      return;
    }

    const closeMenu = (event: Event) => {
      if (event.target instanceof Node && sortMenuRef.current?.contains(event.target)) {
        return;
      }
      setSortMenuOpen(false);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSortMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!filePreview) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSaveWorkbenchFilePreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePreview, handleSaveWorkbenchFilePreview]);

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
                    targetAbsolutePath: childFolder.absolutePath,
                    targetTitle: childFolder.name,
                    targetNoteId: null,
                    isFolder: true,
                    selectedPaths: nextSelectedPaths,
                    allowReference: false,
                  });
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setTreeDropTargetPath(childFolder.path);
                }}
                onDragLeave={() => {
                  setTreeDropTargetPath((current) => (current === childFolder.path ? null : current));
                }}
                onDrop={(event) => void handleImportDrop(event)}
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
                  setFilePreview(null);
                  onSelectNote(file.note.id);
                } else {
                  void handleOpenWorkbenchFilePreview(file);
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
                  targetAbsolutePath: file.absolutePath,
                  targetTitle: file.name,
                  targetNoteId: file.note?.id || null,
                  isFolder: false,
                  selectedPaths: nextSelectedPaths,
                  allowReference: true,
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
      handleOpenWorkbenchFilePreview,
      isMultiSelecting,
      onSelectNote,
      searchActive,
      activeTreePath,
      selectedAncestorFolderPaths,
      selectedTreePaths,
      setFilePreview,
      toggleFolderExpanded,
    ]
  );

  const currentDocumentPath = filePreview?.path || selectedNote?.sourceUrl || null;
  const canOpenCurrentDocumentInSystem = Boolean(currentDocumentPath);
  const canAddCurrentDocumentToAI = Boolean(selectedNote || filePreview?.projection);

  const handleOpenCurrentDocumentInSystem = useCallback(async () => {
    if (!currentDocumentPath) {
      return;
    }

    await invoke('open_path_in_shell', { path: currentDocumentPath });
  }, [currentDocumentPath]);

  const handleAddTreeItemToAI = useCallback(async () => {
    if (!projectId || !contextMenuState?.allowReference || contextMenuState.isFolder) {
      return;
    }

    if (contextMenuState.targetNoteId) {
      const currentReferenceIds = useAIContextStore.getState().projects[projectId]?.selectedReferenceFileIds || [];
      setSelectedReferenceFileIds(projectId, [...currentReferenceIds, contextMenuState.targetNoteId]);
      closeKnowledgeContextMenu();
      return;
    }

    if (!contextMenuState.targetAbsolutePath || !contextMenuState.targetTitle) {
      return;
    }

    const nextModel = await loadWorkbenchFileModel(
      contextMenuState.targetAbsolutePath,
      contextMenuState.targetTitle,
    );
    if (!nextModel.projection) {
      return;
    }

    await saveProjectionArtifacts(nextModel.projection);
    addReferenceFileToAI(buildProjectionReferenceFile(nextModel.projection));
    closeKnowledgeContextMenu();
  }, [
    addReferenceFileToAI,
    closeKnowledgeContextMenu,
    contextMenuState,
    projectId,
    saveProjectionArtifacts,
    setSelectedReferenceFileIds,
  ]);

  const renderProjectionBlocks = useCallback((projection: DocumentProjection) => {
    return projection.blocks.map((block, blockIndex) => {
      if (block.kind === 'table' && block.rows) {
        return (
          <div key={block.id} className="gn-note-doc-block" data-selection-anchor={block.anchor}>
            <strong>{block.title || `Table ${blockIndex + 1}`}</strong>
            <div className="chat-answer-table-scroll">
              <table>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${block.id}:${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${block.id}:${rowIndex}:${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      if (block.kind === 'sheet' && block.rows) {
        return (
          <div key={block.id} className="gn-note-doc-block" data-selection-anchor={block.anchor}>
            <strong>{block.title || block.sheetName || `Sheet ${blockIndex + 1}`}</strong>
            <div className="chat-answer-table-scroll">
              <table>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${block.id}:${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${block.id}:${rowIndex}:${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      return (
        <div key={block.id} className="gn-note-doc-block" data-selection-anchor={block.anchor}>
          {block.title && block.kind !== 'heading' ? <strong>{block.title}</strong> : null}
          <p>{block.text || block.title || ''}</p>
          {block.notes ? <p>{block.notes}</p> : null}
        </div>
      );
    });
  }, []);

  const renderFilePreviewContent = useCallback(() => {
    if (!filePreview) {
      return null;
    }

    if (filePreview.kind === 'image' && filePreview.previewUrl) {
      return (
        <div className="gn-note-reading-surface">
          <img
            src={filePreview.previewUrl}
            alt={filePreview.title}
            style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 12 }}
          />
          {filePreview.imageMeta ? (
            <p className="chat-reference-empty">
              {filePreview.imageMeta.width} × {filePreview.imageMeta.height} · {filePreview.imageMeta.mimeType}
            </p>
          ) : null}
        </div>
      );
    }

    if (filePreview.kind === 'pdf' && filePreview.previewUrl) {
      return (
        <div className="gn-note-reading-surface">
          <iframe
            src={filePreview.previewUrl}
            title={filePreview.title}
            style={{ width: '100%', minHeight: '72vh', border: 'none', borderRadius: 12, background: '#fff' }}
          />
        </div>
      );
    }

    if (filePreview.kind === 'word') {
      return (
        <div className="gn-note-reading-surface">
          <KnowledgeMarkdownViewer
            markdown={filePreview.draftContent || '文档没有可提取的文字内容。请使用右上角系统打开查看或编辑。'}
            onOpenInternalLink={handleOpenInternalMarkdownLink}
          />
        </div>
      );
    }

    if (filePreview.projection && isProjectionEditableKind(filePreview.kind)) {
      return (
        <div className="gn-note-reading-surface">
          <div className="gn-note-doc-projection-summary">{renderProjectionBlocks(filePreview.projection)}</div>
          <textarea
            className="gn-note-file-preview-code"
            value={filePreview.draftContent}
            data-selection-anchor="projection"
            onChange={(event) =>
              setFilePreview((current) =>
                current && current.path === filePreview.path
                  ? { ...current, draftContent: event.target.value }
                  : current
              )
            }
            onMouseUp={refreshDocumentSelection}
            onKeyUp={refreshDocumentSelection}
            spellCheck={false}
            disabled={!isFilePreviewEditable}
          />
        </div>
      );
    }

    if (filePreview.kind === 'markdown') {
      return (
        <div className="gn-note-reading-surface">
          <KnowledgeMarkdownViewer
            markdown={filePreview.draftContent}
            onOpenInternalLink={handleOpenInternalMarkdownLink}
          />
        </div>
      );
    }

    if (filePreview.kind === 'binary') {
      return (
        <div className="gn-note-empty-main">
          <h2>{filePreview.title}</h2>
          <p>This file is best opened in the system app.</p>
        </div>
      );
    }

    return (
      <div className="gn-note-code-surface">
        <textarea
          className="gn-note-file-preview-code"
          value={filePreview.draftContent}
          data-selection-anchor="preview"
          onChange={(event) =>
            setFilePreview((current) =>
              current && current.path === filePreview.path
                ? { ...current, draftContent: event.target.value }
                : current
            )
          }
          onMouseUp={refreshDocumentSelection}
          onKeyUp={refreshDocumentSelection}
          aria-label={`${filePreview.title} file preview`}
          spellCheck={false}
          disabled={filePreview.state !== 'ready' || !isFilePreviewEditable}
        />
      </div>
    );
  }, [filePreview, handleOpenInternalMarkdownLink, isFilePreviewEditable, refreshDocumentSelection, renderProjectionBlocks]);

  const resolveImportTargetDirectory = useCallback(() => {
    if (treeDropTargetPath) {
      return treeDropTargetPath;
    }

    if (selectedTreePaths.length === 1) {
      const selectedPath = selectedTreePaths[0];
      const matchingFolder = diskItems.find((item) => item.type === 'folder' && item.relativePath === selectedPath);
      if (matchingFolder) {
        return selectedPath;
      }

      return selectedPath.replace(/\/[^/]+$/, '');
    }

    return '';
  }, [diskItems, selectedTreePaths, treeDropTargetPath]);

  const buildUniqueImportPath = useCallback((relativePath: string, policy: 'replace' | 'skip' | 'rename') => {
    const normalizedPath = normalizeRelativeFileSystemPath(relativePath);
    const existingPaths = new Set(diskItems.map((item) => normalizeRelativeFileSystemPath(item.relativePath)));
    if (!existingPaths.has(normalizedPath)) {
      return normalizedPath;
    }

    if (policy === 'replace') {
      return normalizedPath;
    }

    if (policy === 'skip') {
      return null;
    }

    const extensionMatch = normalizedPath.match(/(\.[^./]+)$/);
    const extension = extensionMatch?.[1] || '';
    const baseName = extension ? normalizedPath.slice(0, -extension.length) : normalizedPath;
    let counter = 1;
    while (existingPaths.has(`${baseName}-copy-${counter}${extension}`)) {
      counter += 1;
    }
    return `${baseName}-copy-${counter}${extension}`;
  }, [diskItems]);

  const writeBinaryFile = useCallback(async (absolutePath: string, bytes: Uint8Array) => {
    await invoke('write_binary_file', {
      filePath: absolutePath,
      bytes: Array.from(bytes),
    });
  }, []);

  const collectEntryFiles = useCallback(async (entry: any, prefix = ''): Promise<Array<{ path: string; file: File }>> => {
    if (!entry) {
      return [];
    }

    if (entry.isFile) {
      return new Promise((resolve, reject) => {
        entry.file(
          (file: File) => resolve([{ path: `${prefix}${file.name}`, file }]),
          (error: Error) => reject(error),
        );
      });
    }

    if (!entry.isDirectory) {
      return [];
    }

    const reader = entry.createReader();
    const children = await new Promise<any[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    const nestedResults = await Promise.all(
      children.map((child) => collectEntryFiles(child, `${prefix}${entry.name}/`)),
    );
    return nestedResults.flat();
  }, []);

  const handleImportDrop = useCallback(async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTreeDropTargetPath(null);

    if (!projectRootPath) {
      return;
    }

    const conflictInput = window.prompt('Duplicate handling: replace / skip / rename', 'rename');
    const policy = conflictInput === 'replace' || conflictInput === 'skip' ? conflictInput : 'rename';
    const targetDirectory = resolveImportTargetDirectory();
    const targetBasePath = normalizeRelativeFileSystemPath(targetDirectory);
    const importedPaths: string[] = [];
    const filesToImport: Array<{ path: string; file: File }> = [];

    if (event.dataTransfer.items.length > 0) {
      for (const item of Array.from(event.dataTransfer.items)) {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          filesToImport.push(...(await collectEntryFiles(entry)));
          continue;
        }

        const file = item.getAsFile?.();
        if (file) {
          filesToImport.push({ path: file.name, file });
        }
      }
    } else {
      filesToImport.push(...Array.from(event.dataTransfer.files).map((file) => ({ path: file.name, file })));
    }

    for (const item of filesToImport) {
      const nextRelativePath = normalizeRelativeFileSystemPath(
        `${targetBasePath ? `${targetBasePath}/` : ''}${item.path.replace(/\\/g, '/')}`,
      );
      const resolvedRelativePath = buildUniqueImportPath(nextRelativePath, policy);
      if (!resolvedRelativePath) {
        continue;
      }

      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const absolutePath = normalizeRelativeFileSystemPath(`${projectRootPath}/${resolvedRelativePath}`);
      await writeBinaryFile(absolutePath, bytes);
      importedPaths.push(resolvedRelativePath);
    }

    if (importedPaths.length === 0) {
      setImportMessage('No files were imported.');
      return;
    }

    setImportMessage(
      importedPaths.length === 1
        ? `Imported ${importedPaths[0]}.`
        : `Imported ${importedPaths.length} items into ${targetBasePath || 'root'}.`,
    );
    onRefreshFilesystem();
  }, [
    buildUniqueImportPath,
    collectEntryFiles,
    onRefreshFilesystem,
    projectRootPath,
    resolveImportTargetDirectory,
    writeBinaryFile,
  ]);

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
            onClick={() => onCreateFileAtPath(null)}
            title="新建文件"
            aria-label="新建文件"
          >
            <FileAddIcon />
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
          <div className="gn-note-sort-menu" ref={sortMenuRef}>
            <button
              className={`doc-action-btn gn-note-icon-btn gn-note-sort-menu-trigger${sortMenuOpen ? ' is-active' : ''}`}
              type="button"
              title="知识库排序"
              aria-label="知识库排序"
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen((current) => !current)}
            >
              <SortIcon />
            </button>
            {sortMenuOpen ? (
              <div className="gn-note-sort-menu-popup pm-knowledge-context-menu" role="menu" aria-label="知识库排序">
                {KNOWLEDGE_TREE_SORT_OPTIONS.map((option) => {
                  const active = option.value === treeSortMode;
                  return (
                    <button
                      key={option.value}
                      className={`pm-knowledge-context-action gn-note-sort-menu-item${active ? ' is-active' : ''}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setTreeSortMode(option.value);
                        closeSortMenu();
                      }}
                    >
                      <span>{option.label}</span>
                      {active ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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

        {error ? (
          <StatusBanner
            tone="danger"
            icon="alertTriangle"
            title="知识区状态异常"
            message={error}
            className="gn-note-error"
          />
        ) : null}

        {importMessage ? (
          <StatusBanner
            tone="info"
            icon="spark"
            title="导入结果"
            message={importMessage}
            className="gn-note-error"
          />
        ) : null}

        <div
          className="gn-note-list"
          onClick={closeKnowledgeContextMenu}
          onDragOver={(event) => {
            event.preventDefault();
            setTreeDropTargetPath('');
          }}
          onDragLeave={() => {
            setTreeDropTargetPath((current) => (current === '' ? null : current));
          }}
          onDrop={handleImportDrop}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenuState({
              x: event.clientX,
              y: event.clientY,
              targetPath: null,
              targetAbsolutePath: null,
              targetTitle: null,
              targetNoteId: null,
              isFolder: null,
              selectedPaths: selectedTreePaths,
              allowReference: false,
            });
          }}
        >
          {hasVisibleTreeNodes ? (
            renderKnowledgeTree(visibleKnowledgeTree)
          ) : (
            <EmptyStateView
              icon={searchActive ? 'search' : 'note'}
              title={searchActive ? '没有匹配的笔记' : '还没有知识笔记'}
              description={searchActive ? '换个关键词试试，或检查目录筛选。' : '从这里新建第一条知识笔记，后续页面树和附件会一起落到这套标准里。'}
              className="gn-note-empty"
            />
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
            {contextMenuState.targetAbsolutePath ? (
              <button
                className="pm-knowledge-context-action"
                type="button"
                onClick={() => {
                  const targetAbsolutePath = contextMenuState.targetAbsolutePath;
                  if (!targetAbsolutePath) {
                    return;
                  }

                  closeKnowledgeContextMenu();
                  void invoke('open_path_in_shell', { path: targetAbsolutePath });
                }}
              >
                系统打开
              </button>
            ) : null}
            <button
              className="pm-knowledge-context-action"
              type="button"
              onClick={() => {
                closeKnowledgeContextMenu();
                onCreateFileAtPath(
                  contextMenuState.isFolder === false && contextMenuState.targetPath
                    ? contextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                    : contextMenuState.targetPath
                );
              }}
            >
              新建文件
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
            {contextMenuState.allowReference ? (
              <button
                className="pm-knowledge-context-action"
                type="button"
                onClick={() => void handleAddTreeItemToAI()}
              >
                加入 AI
              </button>
            ) : null}
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

      <main
        ref={documentSurfaceRef}
        className="gn-note-editor-column"
        onMouseUp={refreshDocumentSelection}
        onKeyUp={refreshDocumentSelection}
        onContextMenu={(event) => {
          if (!documentSelection) {
            return;
          }
          event.preventDefault();
          setDocumentContextMenuState({
            x: event.clientX,
            y: event.clientY,
            selection: documentSelection,
          });
        }}
      >
        <style>{`${TEMPORARY_PREVIEW_STYLES}\n${DOCUMENT_WORKBENCH_STYLES}`}</style>
        {temporaryContentPreview ? (
          <StateCard
            className="gn-note-temporary-preview"
            icon="spark"
            tone="info"
            title={temporaryContentPreview.title}
            description={temporaryContentPreview.summary}
            meta={<span>{temporaryContentPreview.artifactType}</span>}
          >
            <pre>{temporaryContentPreview.body}</pre>
          </StateCard>
        ) : null}
        {filePreview ? (
          <>
            <div className="gn-note-editor-surface">
              <div className="gn-note-document-toolbar">
                <div className="gn-note-document-meta">
                  <strong>{filePreview.title}</strong>
                  <div className="gn-note-document-subline">
                    <span>{getPreviewKindLabel(filePreview)}</span>
                    <span>{filePreviewStatusLabel}</span>
                  </div>
                </div>
                <div className="gn-note-document-actions">
                  <button
                    className="doc-action-btn"
                    type="button"
                    onClick={handleAddCurrentDocumentToAI}
                    disabled={!canAddCurrentDocumentToAI}
                  >
                    加入 AI
                  </button>
                  <button
                    className="doc-action-btn secondary"
                    type="button"
                    onClick={() => void handleOpenCurrentDocumentInSystem()}
                    disabled={!canOpenCurrentDocumentInSystem}
                  >
                    系统打开
                  </button>
                </div>
              </div>
              {documentSelection ? (
                <div className="gn-note-doc-selection-bar">
                  <span className="gn-note-doc-selection-text">{documentSelection.text.slice(0, 80)}</span>
                  <button className="doc-action-btn" type="button" onClick={handleAddSelectionToAI}>
                    加入 AI
                  </button>
                </div>
              ) : null}
              <div className="gn-note-editor-body">{renderFilePreviewContent()}</div>
            </div>
          </>
        ) : selectedNote ? (
          <>
            <div className="gn-note-editor-surface">
              <div className="gn-note-document-toolbar">
                <div className="gn-note-document-meta">
                  <strong>Markdown 笔记</strong>
                  <div className="gn-note-document-subline">
                    <span>{viewMode === 'read' ? '阅读视图' : '源码视图'}</span>
                    <span>{noteSurfaceStatusLabel}</span>
                  </div>
                </div>
                <div className="gn-note-document-actions">
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
                  <button
                    className="doc-action-btn"
                    type="button"
                    onClick={handleAddCurrentDocumentToAI}
                    disabled={!canAddCurrentDocumentToAI}
                  >
                    加入 AI
                  </button>
                  <button
                    className="doc-action-btn secondary"
                    type="button"
                    onClick={() => void handleOpenCurrentDocumentInSystem()}
                    disabled={!canOpenCurrentDocumentInSystem}
                  >
                    系统打开
                  </button>
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
        {documentContextMenuState ? (
          <div
            className="pm-knowledge-context-menu"
            ref={documentContextMenuRef}
            style={{ left: `${documentContextMenuState.x}px`, top: `${documentContextMenuState.y}px`, position: 'fixed' }}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="pm-knowledge-context-action" type="button" onClick={handleAddSelectionToAI}>
              加入 AI
            </button>
          </div>
        ) : null}
      </main>
    </section>
  );
};
