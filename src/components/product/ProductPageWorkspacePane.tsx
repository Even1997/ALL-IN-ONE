// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { invoke } from '@tauri-apps/api/core';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode, SetStateAction } from 'react';
import { Canvas } from '../canvas/Canvas';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { AppType, CanvasElement, type FeatureTree, type PageStructureNode } from '../../types';
import { EmptyStateView, NoteSurface, StatusBanner, WorkbenchIcon } from '../ui';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import type { KnowledgeDiskItem } from '../../modules/knowledge/knowledgeTree';
import {
  buildProjectionArtifactRelativePaths,
  buildProjectionReferenceFile,
  buildSelectionProjection,
  buildSelectionReferenceFile,
  loadWorkbenchFileModel,
} from '../../features/knowledge/workspace/documentProjection.ts';
import { useDocumentProjectionStore } from '../../features/knowledge/workspace/documentProjectionStore.ts';
import type { DocumentProjection, FileWorkbenchViewModel } from '../../features/knowledge/workspace/documentWorkbenchTypes.ts';
import { KnowledgeMarkdownViewer, type KnowledgeInternalLinkTarget } from '../../features/knowledge/workspace/KnowledgeMarkdownViewer';
import { normalizeRelativeFileSystemPath } from '../../utils/fileSystemPaths.ts';
import {
  buildPageWireframeMarkdown,
  createWireframeModule,
  findMarkdownModuleByOffset,
  findMarkdownModuleMatch,
  getWireframeModuleTypeLabel,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  parseFrameFromWireframeMarkdown,
  parsePageWireframeMarkdown,
  toWireframeModuleDrafts,
  type CanvasPreset,
  type WireframeModuleDraft,
} from '../../utils/wireframe';
import { PageWorkspace } from './PageWorkspace';

const getModuleDraft = (element: CanvasElement): WireframeModuleDraft => ({
  id: element.id,
  name: String(element.props.name || element.props.title || element.props.text || '未命名模块'),
  type: getWireframeModuleTypeLabel(element.props.moduleType),
  x: Number.isFinite(element.x) ? Math.max(0, Math.round(element.x)) : 0,
  y: Number.isFinite(element.y) ? Math.max(0, Math.round(element.y)) : 0,
  width: Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH,
  height: Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT,
  content: String(element.props.content || element.props.placeholder || element.props.text || ''),
});

const getModuleContentSummary = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '暂无内容说明';
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
};

const isModuleCardDragControl = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, input, textarea, select, [contenteditable="true"]'));
};

const getModuleCardIdFromPoint = (clientX: number, clientY: number) => {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest<HTMLElement>('[data-module-id]')?.dataset.moduleId || null;
};

type PagTreeSortMode = 'name-asc' | 'name-desc';

type PagTreeFileNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  extension: string;
};

type PagTreeFolderNode = {
  id: string;
  name: string;
  path: string;
  absolutePath: string | null;
  folders: PagTreeFolderNode[];
  files: PagTreeFileNode[];
  fileCount: number;
};

type PagFileContextMenuState =
  | {
      x: number;
      y: number;
      targetPath: string | null;
      targetAbsolutePath: string | null;
      targetTitle: string | null;
      isFolder: boolean | null;
      selectedPaths: string[];
      allowReference: boolean;
    }
  | null;

type PagDocumentSelectionState = {
  text: string;
  anchor: string;
} | null;

type PagDocumentContextMenuState =
  | {
      x: number;
      y: number;
      selection: PagDocumentSelectionState;
    }
  | null;

const PAG_TREE_SORT_OPTIONS: Array<{ value: PagTreeSortMode; label: string }> = [
  { value: 'name-asc', label: '名称 A-Z' },
  { value: 'name-desc', label: '名称 Z-A' },
];

const PAG_SKETCH_PAGE_PATH_PATTERN = /^sketch\/pages\/.+\.(md|markdown)$/i;

const isHiddenPagTreePath = (value: string) => value.split('/').includes('.goodnight');

const getPagTreeFileExtension = (value: string) => {
  const matched = value.toLowerCase().match(/\.([a-z0-9]+)$/);
  return matched ? matched[1] : '';
};

const comparePagTreeNames = (left: string, right: string) =>
  left.localeCompare(right, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });

const sortPagTreeFolders = (folders: PagTreeFolderNode[], sortMode: PagTreeSortMode) =>
  [...folders].sort((left, right) =>
    sortMode === 'name-desc' ? comparePagTreeNames(right.name, left.name) : comparePagTreeNames(left.name, right.name)
  );

const sortPagTreeFiles = (files: PagTreeFileNode[], sortMode: PagTreeSortMode) =>
  [...files].sort((left, right) =>
    sortMode === 'name-desc' ? comparePagTreeNames(right.name, left.name) : comparePagTreeNames(left.name, right.name)
  );

const countPagFolderFiles = (folder: PagTreeFolderNode): number =>
  folder.files.length + folder.folders.reduce((sum, child) => sum + countPagFolderFiles(child), 0);

const buildPagFileTree = (
  diskItems: KnowledgeDiskItem[],
  searchValue: string,
  sortMode: PagTreeSortMode,
  projectRootPath?: string | null,
): PagTreeFolderNode => {
  type MutableFolder = {
    id: string;
    name: string;
    path: string;
    absolutePath: string | null;
    folders: Map<string, MutableFolder>;
    files: PagTreeFileNode[];
  };

  const root: MutableFolder = {
    id: 'root',
    name: '',
    path: '',
    absolutePath: projectRootPath || null,
    folders: new Map<string, MutableFolder>(),
    files: [],
  };
  const normalizedSearch = searchValue.trim().toLowerCase();

  for (const item of diskItems) {
    const relativePath = normalizeRelativeFileSystemPath(item.relativePath);
    if (!relativePath || isHiddenPagTreePath(relativePath)) {
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

      const nextFolder: MutableFolder = {
        id: currentPath,
        name: segment,
        path: currentPath,
        absolutePath: item.type === 'folder' && currentPath === relativePath ? item.path : null,
        folders: new Map<string, MutableFolder>(),
        files: [],
      };
      current.folders.set(segment, nextFolder);
      current = nextFolder;
    }

    if (item.type === 'folder') {
      continue;
    }

    if (normalizedSearch && !relativePath.toLowerCase().includes(normalizedSearch)) {
      continue;
    }

    const fileName = segments[segments.length - 1] || relativePath;
    current.files.push({
      id: `file:${relativePath}`,
      name: fileName,
      path: relativePath,
      absolutePath: item.path,
      extension: getPagTreeFileExtension(relativePath),
    });
  }

  const finalizeFolder = (folder: MutableFolder): PagTreeFolderNode => {
    const folders = sortPagTreeFolders(
      [...folder.folders.values()].map((child) => finalizeFolder(child)),
      sortMode,
    ).filter((child) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        child.files.length > 0 ||
        child.folders.length > 0 ||
        child.path.toLowerCase().includes(normalizedSearch) ||
        child.name.toLowerCase().includes(normalizedSearch)
      );
    });
    const files = sortPagTreeFiles(folder.files, sortMode);

    const finalizedFolder: PagTreeFolderNode = {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      absolutePath: folder.absolutePath,
      folders,
      files,
      fileCount: 0,
    };
    finalizedFolder.fileCount = countPagFolderFiles(finalizedFolder);
    return finalizedFolder;
  };

  return finalizeFolder(root);
};

const collectAllPagFolderPaths = (folder: PagTreeFolderNode) => {
  const paths = new Set<string>();

  for (const childFolder of folder.folders) {
    paths.add(childFolder.path);
    for (const nestedPath of collectAllPagFolderPaths(childFolder)) {
      paths.add(nestedPath);
    }
  }

  return paths;
};

const collectPagVisibleTreePaths = (
  folder: PagTreeFolderNode,
  collapsedFolderPaths: Set<string>,
): string[] => {
  const paths: string[] = [];

  for (const childFolder of folder.folders) {
    paths.push(childFolder.path);
    const isExpanded = !collapsedFolderPaths.has(childFolder.path);
    if (isExpanded) {
      paths.push(...collectPagVisibleTreePaths(childFolder, collapsedFolderPaths));
    }
  }

  for (const file of folder.files) {
    paths.push(file.path);
  }

  return paths;
};

const findPagFileNodeByPath = (folder: PagTreeFolderNode, targetPath: string): PagTreeFileNode | null => {
  for (const file of folder.files) {
    if (file.path === targetPath) {
      return file;
    }
  }

  for (const childFolder of folder.folders) {
    const match = findPagFileNodeByPath(childFolder, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
};

const isProjectionEditableKind = (kind: FileWorkbenchViewModel['kind']) =>
  kind === 'sheet' || kind === 'slide';

const saveProjectionArtifacts = async (projectRootPath: string | null | undefined, projection: DocumentProjection) => {
  if (!projectRootPath) {
    return;
  }

  const artifactPaths = buildProjectionArtifactRelativePaths(projection.sourcePath);
  const absoluteJsonPath = normalizeRelativeFileSystemPath(`${projectRootPath}/${artifactPaths.json}`);
  const absoluteMarkdownPath = normalizeRelativeFileSystemPath(`${projectRootPath}/${artifactPaths.markdown}`);

  const jsonResult = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
    params: {
      file_path: absoluteJsonPath,
      content: JSON.stringify(projection, null, 2),
    },
  });
  if (!jsonResult.success) {
    throw new Error(jsonResult.error || `保存 projection 失败：${absoluteJsonPath}`);
  }

  const markdownResult = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
    params: {
      file_path: absoluteMarkdownPath,
      content: projection.markdown,
    },
  });
  if (!markdownResult.success) {
    throw new Error(markdownResult.error || `保存 projection 失败：${absoluteMarkdownPath}`);
  }
};

const persistEditableWorkbenchFile = async (
  filePreview: FileWorkbenchViewModel,
  projectRootPath: string | null | undefined,
) => {
  if (isProjectionEditableKind(filePreview.kind) && filePreview.projection) {
    const nextProjection = {
      ...filePreview.projection,
      markdown: filePreview.draftContent,
      updatedAt: new Date().toISOString(),
    };
    await saveProjectionArtifacts(projectRootPath, nextProjection);
    return nextProjection;
  }

  const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
    params: {
      file_path: filePreview.path,
      content: filePreview.draftContent,
    },
  });
  if (!result.success) {
    throw new Error(result.error || `保存文件失败：${filePreview.path}`);
  }

  return null;
};

/* interface PageTreeNodeProps {
  node: PageStructureNode;
  depth: number;
  selectedPageId: string | null;
  onSelect: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
}

const PageTreeNode = memo<PageTreeNodeProps>(({ node, depth, selectedPageId, onSelect, onDeletePage }) => {
  const isPage = node.kind === 'page';
  const isSelected = selectedPageId === node.id;
  const hasChildren = node.children.length > 0;
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isPage) {
    if (node.children.length === 0) {
      return null;
    }

    return (
      <>
        {node.children.map((child) => (
          <PageTreeNode
            key={child.id}
            node={child}
            depth={depth}
            selectedPageId={selectedPageId}
            onSelect={onSelect}
            onDeletePage={onDeletePage}
          />
        ))}
      </>
    );
  }

  return (
    <div className="pm-page-tree-group">
      <div className="pm-page-tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
        <div className="pm-page-tree-entry">
          <button
            className={`pm-page-tree-caret ${hasChildren ? 'visible' : 'placeholder'} ${isExpanded ? 'expanded' : ''}`}
            type="button"
            aria-label={hasChildren ? `${isExpanded ? '收起' : '展开'} ${node.name}` : `${node.name} 没有子页面`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) {
                setIsExpanded((current) => !current);
              }
            }}
          >
            {hasChildren ? <WorkbenchIcon name="chevronRight" /> : null}
          </button>
          <button
            className={`pm-page-tree-node ${isSelected ? 'active' : ''}`}
            onClick={() => onSelect(node.id)}
            type="button"
          >
            <strong>{node.name}</strong>
          </button>
          <div className="pm-page-tree-actions" aria-label={`${node.name} 操作`}>
            <button
              className="pm-page-tree-action danger"
              type="button"
              title={`删除 ${node.name}`}
              aria-label={`删除 ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeletePage(node.id);
              }}
            >
              <WorkbenchIcon name="trash" />
            </button>
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="pm-page-tree-children">
          {node.children.map((child) => (
            <PageTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPageId={selectedPageId}
              onSelect={onSelect}
              onDeletePage={onDeletePage}
            />
          ))}
        </div>
      )}
    </div>
  );
});

*/
interface WireframeModuleCardProps {
  moduleId: string;
  draggingModuleId: string | null;
  setDraggingModuleId: Dispatch<SetStateAction<string | null>>;
  appType?: AppType;
  onRequestDelete: (moduleId: string, moduleTitle: string) => void;
}

const WireframeModuleCard = memo<WireframeModuleCardProps>(({ moduleId, draggingModuleId, setDraggingModuleId, appType, onRequestDelete }) => {
  const element = usePreviewStore((state) => state.elements.find((item) => item.id === moduleId) || null);
  const elementIndex = usePreviewStore((state) => state.elements.findIndex((item) => item.id === moduleId));
  const elements = usePreviewStore((state) => state.elements);
  const isActive = usePreviewStore((state) => state.selectedElementId === moduleId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const reorderElements = usePreviewStore((state) => state.reorderElements);
  const updateElement = usePreviewStore((state) => state.updateElement);
  const isFirst = elementIndex === 0;
  const isLast = elementIndex === elements.length - 1;

  const handleMoveUp = useCallback(() => {
    if (elementIndex <= 0) {
      return;
    }

    const prevId = elements[elementIndex - 1].id;
    reorderElements(moduleId, prevId);
    selectElement(moduleId);
  }, [elementIndex, elements, moduleId, reorderElements, selectElement]);

  const handleMoveDown = useCallback(() => {
    if (elementIndex >= elements.length - 1) {
      return;
    }

    const nextId = elements[elementIndex + 1].id;
    reorderElements(nextId, moduleId);
    selectElement(moduleId);
  }, [elementIndex, elements, moduleId, reorderElements, selectElement]);

  const handleDragHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (isModuleCardDragControl(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDraggingModuleId(moduleId);

    let lastTargetModuleId: string | null = null;

    const reorderToPoint = (clientX: number, clientY: number) => {
      const targetModuleId = getModuleCardIdFromPoint(clientX, clientY);
      if (!targetModuleId || targetModuleId === moduleId || targetModuleId === lastTargetModuleId) {
        return;
      }

      lastTargetModuleId = targetModuleId;
      reorderElements(moduleId, targetModuleId);
      selectElement(moduleId);
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      reorderToPoint(pointerEvent.clientX, pointerEvent.clientY);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      setDraggingModuleId(null);
    };

    const handlePointerUp = (pointerEvent: PointerEvent) => {
      reorderToPoint(pointerEvent.clientX, pointerEvent.clientY);
      cleanup();
    };

    const handlePointerCancel = () => {
      cleanup();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }, [moduleId, reorderElements, selectElement, setDraggingModuleId]);

  const module = useMemo(() => (element ? getModuleDraft(element) : null), [element]);
  const [textDrafts, setTextDrafts] = useState<{ name: string; content: string }>({
    name: '',
    content: '',
  });
  const [moduleTypeDraft, setModuleTypeDraft] = useState('线框');
  const [numericDrafts, setNumericDrafts] = useState<{ x: string; y: string; width: string; height: string }>({
    x: '0',
    y: '0',
    width: String(MIN_MODULE_WIDTH),
    height: String(MIN_MODULE_HEIGHT),
  });

  const handleModuleFieldChange = useCallback((updates: Partial<{ name: string; type: string; x: number; y: number; width: number; height: number; content: string }>) => {
    if (!element) {
      return;
    }

    const nextElement = createWireframeModule(
      {
        id: moduleId,
        name: typeof updates.name === 'string' ? updates.name : String(element.props.name || element.props.title || '模块'),
        type: typeof updates.type === 'string' ? updates.type : getWireframeModuleTypeLabel(element.props.moduleType),
        x: typeof updates.x === 'number' ? Math.max(0, Math.round(updates.x)) : element.x,
        y: typeof updates.y === 'number' ? Math.max(0, Math.round(updates.y)) : element.y,
        width: typeof updates.width === 'number' ? Math.max(MIN_MODULE_WIDTH, Math.round(updates.width)) : element.width,
        height: typeof updates.height === 'number' ? Math.max(MIN_MODULE_HEIGHT, Math.round(updates.height)) : element.height,
        content: typeof updates.content === 'string' ? updates.content : String(element.props.content || ''),
      },
      appType
    );

    updateElement(moduleId, nextElement);
  }, [appType, element, moduleId, updateElement]);

  useEffect(() => {
    if (!module) {
      return;
    }

    setTextDrafts({
      name: module.name,
      content: module.content,
    });
    setModuleTypeDraft(module.type || '线框');
    setNumericDrafts({
      x: String(module.x),
      y: String(module.y),
      width: String(module.width ?? MIN_MODULE_WIDTH),
      height: String(module.height ?? MIN_MODULE_HEIGHT),
    });
  }, [module]);

  const handleTextDraftChange = useCallback((field: 'name' | 'content', value: string) => {
    setTextDrafts((current) => ({ ...current, [field]: value }));
  }, []);

  const handleTextFieldCommit = useCallback((field: 'name' | 'content') => {
    if (!module) {
      return;
    }

    const nextValue = textDrafts[field];
    if (nextValue === module[field]) {
      return;
    }

    handleModuleFieldChange({ [field]: nextValue });
  }, [handleModuleFieldChange, module, textDrafts]);

  const handleModuleTypeChange = useCallback((value: string) => {
    setModuleTypeDraft(value);
    handleModuleFieldChange({ type: value });
  }, [handleModuleFieldChange]);

  const handleNumericDraftChange = useCallback((field: 'x' | 'y' | 'width' | 'height', value: string) => {
    setNumericDrafts((current) => ({ ...current, [field]: value }));
  }, []);

  const handleNumericFieldCommit = useCallback((field: 'x' | 'y' | 'width' | 'height') => {
    if (!module) {
      return;
    }

    const rawValue = numericDrafts[field].trim();
    if (!rawValue) {
      setNumericDrafts((current) => ({
        ...current,
        [field]: String(module[field] ?? (field === 'width' ? MIN_MODULE_WIDTH : MIN_MODULE_HEIGHT)),
      }));
      return;
    }

    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) {
      setNumericDrafts((current) => ({
        ...current,
        [field]: String(module[field] ?? (field === 'width' ? MIN_MODULE_WIDTH : MIN_MODULE_HEIGHT)),
      }));
      return;
    }

    handleModuleFieldChange({ [field]: nextValue });
  }, [handleModuleFieldChange, module, numericDrafts]);

  if (!module) {
    return null;
  }

  return (
    <div
      data-module-id={moduleId}
      className={`pm-module-card ${isActive ? 'active' : ''} ${draggingModuleId === moduleId ? 'dragging' : ''}`}
      onClick={() => selectElement(moduleId)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectElement(moduleId);
        }
      }}
    >
      <div className="pm-module-card-header">
        <div className="pm-module-card-title">
          <span
            className="pm-drag-handle"
            onPointerDown={handleDragHandlePointerDown}
            onClick={(event) => event.stopPropagation()}
            title="拖动调整层级"
          >
            ⋮⋮
          </span>
          <strong>{module.name}</strong>
        </div>
        <div className="pm-module-card-actions">
          <button
            className="pm-link-btn"
            type="button"
            disabled={isFirst}
            onClick={(event) => {
              event.stopPropagation();
              handleMoveUp();
            }}
            title="上移层级"
          >
            上移
          </button>
          <button
            className="pm-link-btn"
            type="button"
            disabled={isLast}
            onClick={(event) => {
              event.stopPropagation();
              handleMoveDown();
            }}
            title="下移层级"
          >
            下移
          </button>
          <button
            className="pm-link-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(moduleId, module.name);
            }}
          >
            删除
          </button>
        </div>
      </div>

      <div className="pm-module-card-meta">
        <span>{`X ${module.x}`}</span>
        <span>{`Y ${module.y}`}</span>
        <span>{`宽 ${module.width}`}</span>
        <span>{`高 ${module.height}`}</span>
      </div>

      {isActive ? (
        <>
          <label className="pm-field-stack pm-field-stack-compact">
            <span>模块名称</span>
            <input
              className="product-input pm-form-input"
              value={textDrafts.name}
              onChange={(event) => handleTextDraftChange('name', event.target.value)}
              onBlur={() => handleTextFieldCommit('name')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              placeholder="输入模块名称"
            />
          </label>
          <label className="pm-field-stack pm-field-stack-compact">
            <span>模块类型</span>
            <select
              className="product-input pm-form-input"
              value={moduleTypeDraft}
              onChange={(event) => handleModuleTypeChange(event.target.value)}
            >
              <option value="线框">线框</option>
              <option value="文字">文字</option>
            </select>
          </label>
          <div className="pm-form-grid">
            <label className="pm-field-stack pm-field-stack-compact">
              <span>X 坐标</span>
              <input
                className="product-input pm-form-input"
                type="number"
                value={numericDrafts.x}
                onChange={(event) => handleNumericDraftChange('x', event.target.value)}
                onBlur={() => handleNumericFieldCommit('x')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="X"
              />
            </label>
            <label className="pm-field-stack pm-field-stack-compact">
              <span>Y 坐标</span>
              <input
                className="product-input pm-form-input"
                type="number"
                value={numericDrafts.y}
                onChange={(event) => handleNumericDraftChange('y', event.target.value)}
                onBlur={() => handleNumericFieldCommit('y')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Y"
              />
            </label>
            <label className="pm-field-stack pm-field-stack-compact">
              <span>模块宽度</span>
              <input
                className="product-input pm-form-input"
                type="number"
                value={numericDrafts.width}
                onChange={(event) => handleNumericDraftChange('width', event.target.value)}
                onBlur={() => handleNumericFieldCommit('width')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="宽度"
              />
            </label>
            <label className="pm-field-stack pm-field-stack-compact">
              <span>模块高度</span>
              <input
                className="product-input pm-form-input"
                type="number"
                value={numericDrafts.height}
                onChange={(event) => handleNumericDraftChange('height', event.target.value)}
                onBlur={() => handleNumericFieldCommit('height')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="高度"
              />
            </label>
          </div>
          <label className="pm-field-stack pm-field-stack-compact">
            <span>模块内容</span>
            <textarea
              className="product-textarea compact pm-module-content-input"
              value={textDrafts.content}
              onChange={(event) => handleTextDraftChange('content', event.target.value)}
              onBlur={() => handleTextFieldCommit('content')}
              placeholder="模块内容"
            />
          </label>
        </>
      ) : (
        <p className="pm-module-card-preview" title={module.content || '暂无内容说明'}>
          {getModuleContentSummary(module.content)}
        </p>
      )}
    </div>
  );
});

interface WireframeSyncBridgeProps {
  selectedPage: PageStructureNode | null;
}

const WireframeSyncBridge = memo<WireframeSyncBridgeProps>(({ selectedPage }) => {
  const hydratedPageIdRef = useRef<string | null>(null);
  const lastWireframeSnapshotRef = useRef('[]');
  const currentWireframe = useProjectStore((state) => selectedPage ? state.wireframes[selectedPage.id] || null : null);
  const saveWireframeDraft = useProjectStore((state) => state.saveWireframeDraft);
  const elements = usePreviewStore((state) => state.elements);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);

  useEffect(() => {
    const nextElements = currentWireframe?.elements || [];
    const snapshot = JSON.stringify(nextElements);
    const nextPageId = selectedPage?.id || null;
    const isSameHydratedSnapshot =
      hydratedPageIdRef.current === nextPageId && snapshot === lastWireframeSnapshotRef.current;

    hydratedPageIdRef.current = nextPageId;
    lastWireframeSnapshotRef.current = snapshot;

    if (isSameHydratedSnapshot) {
      return;
    }

    loadFromCode(nextElements);
  }, [currentWireframe, loadFromCode, selectedPage]);

  useEffect(() => {
    if (!selectedPage || hydratedPageIdRef.current !== selectedPage.id) {
      return;
    }

    const snapshot = JSON.stringify(elements);
    if (snapshot === lastWireframeSnapshotRef.current) {
      return;
    }

    lastWireframeSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      saveWireframeDraft(
        {
          id: selectedPage.id,
          name: selectedPage.name,
        },
        elements as CanvasElement[]
      );
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [elements, saveWireframeDraft, selectedPage]);

  return null;
});

interface PagePropertiesFloatProps {
  selectedPage: PageStructureNode;
  moduleCount: number;
  canvasLabel: string;
  onClearCurrentWireframe: () => void;
}

const PagePropertiesFloat = memo<PagePropertiesFloatProps>(({ selectedPage, moduleCount, canvasLabel, onClearCurrentWireframe }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const updatePageStructureNode = useProjectStore((state) => state.updatePageStructureNode);

  return (
    <div className={`pm-page-props-float ${isExpanded ? 'is-expanded' : 'is-compact'}`}>
      {isExpanded ? (
        <div className="pm-page-props-float-body">
          <div className="pm-page-props-float-header">
            <div>
              <strong>{selectedPage.name}</strong>
              <span>{selectedPage.metadata.route || canvasLabel}</span>
            </div>
            <button className="doc-action-btn secondary" type="button" onClick={() => setIsExpanded(false)}>
              ▾
            </button>
          </div>
          <div className="pm-form-grid pm-page-form-grid">
            <label className="pm-field-stack">
              <span>页面名称</span>
              <input
                className="product-input pm-form-input pm-page-form-input"
                value={selectedPage.name}
                onChange={(event) => updatePageStructureNode(selectedPage.id, { name: event.target.value })}
                placeholder="页面名称"
              />
            </label>
            <label className="pm-field-stack">
              <span>页面描述</span>
              <textarea
                className="product-textarea compact pm-page-description-input pm-page-form-input"
                value={selectedPage.description}
                onChange={(event) => updatePageStructureNode(selectedPage.id, { description: event.target.value })}
                placeholder="页面描述"
              />
            </label>
          </div>
          <div className="pm-wireframe-meta-strip">
            <span>{moduleCount} 个模块</span>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={onClearCurrentWireframe}>清空</button>
          </div>
        </div>
      ) : (
        <button className="pm-page-props-float-trigger" type="button" onClick={() => setIsExpanded(true)}>
          <strong>{selectedPage.name}</strong>
          <span>{selectedPage.metadata.route || canvasLabel}</span>
          <span className="pm-page-props-float-expand-icon">◂</span>
        </button>
      )}
    </div>
  );
});

interface ModuleListFloatProps {
  selectedPage: PageStructureNode;
  appType?: AppType;
  featureTree: FeatureTree | null;
  onAddModule: () => void;
  onRequestDeleteModule: (moduleId: string, moduleTitle: string) => void;
  onClosePanel?: () => void;
}

const ModuleListFloat = memo<ModuleListFloatProps>(({ selectedPage, appType, featureTree, onAddModule, onRequestDeleteModule, onClosePanel }) => {
  const [isMarkdownEditorOpen, setIsMarkdownEditorOpen] = useState(false);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [pageMarkdownDraft, setPageMarkdownDraft] = useState('');
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const moduleListRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const elements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const updateWireframeFrame = useProjectStore((state) => state.updateWireframeFrame);
  const moduleIds = useMemo(() => elements.map((element) => element.id), [elements]);
  const moduleDrafts = useMemo(() => toWireframeModuleDrafts(elements), [elements]);
  const selectedModule = useMemo(
    () => moduleDrafts.find((module) => module.id === selectedElementId) || null,
    [moduleDrafts, selectedElementId]
  );

  const buildCurrentPageMarkdown = useCallback(() => {
    const currentWireframe = useProjectStore.getState().wireframes[selectedPage.id] || null;
    return buildPageWireframeMarkdown(
      selectedPage,
      {
        id: currentWireframe?.id || `draft-${selectedPage.id}`,
        pageId: selectedPage.id,
        pageName: selectedPage.name,
        frame: currentWireframe?.frame,
        elements: usePreviewStore.getState().elements,
        updatedAt: currentWireframe?.updatedAt || new Date().toISOString(),
        status: currentWireframe?.status || 'draft',
      },
      featureTree,
      appType
    );
  }, [appType, featureTree, selectedPage]);

  useEffect(() => {
    setIsMarkdownEditorOpen(false);
    setPageMarkdownDraft('');
    lastSyncedMarkdownRef.current = '';
  }, [selectedPage.id]);

  useEffect(() => {
    if (!isMarkdownEditorOpen || !selectedModule || !markdownTextareaRef.current) {
      return;
    }

    const match = findMarkdownModuleMatch(pageMarkdownDraft, selectedModule);
    if (!match) {
      return;
    }

    const textarea = markdownTextareaRef.current;
    const activeElement = document.activeElement;
    const isEditingAnotherField =
      activeElement instanceof HTMLInputElement ||
      (activeElement instanceof HTMLTextAreaElement && activeElement !== textarea);
    if (!isEditingAnotherField) {
      textarea.focus();
    }
    textarea.setSelectionRange(match.start, match.end);
    const linesBefore = pageMarkdownDraft.slice(0, match.start).split('\n').length - 1;
    textarea.scrollTop = Math.max(0, linesBefore * 22 - 48);
  }, [isMarkdownEditorOpen, pageMarkdownDraft, selectedModule]);

  const handleMarkdownCursorSync = useCallback((cursorPosition: number) => {
    const match = findMarkdownModuleByOffset(pageMarkdownDraft, cursorPosition);
    if (!match) {
      return;
    }

    const targetModule = moduleDrafts.find((module) =>
      module.name === match.name && module.x === match.x && module.y === match.y
    ) || moduleDrafts.find((module) => module.name === match.name);
    if (!targetModule?.id) {
      return;
    }

    selectElement(targetModule.id);
    const moduleNode = moduleListRef.current?.querySelector<HTMLElement>(`[data-module-id="${targetModule.id}"]`);
    moduleNode?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moduleDrafts, pageMarkdownDraft, selectElement]);

  const handleApplyMarkdown = useCallback(() => {
    const parsedElements = parsePageWireframeMarkdown(pageMarkdownDraft, appType);
    const nextFrame = parseFrameFromWireframeMarkdown(pageMarkdownDraft);
    lastSyncedMarkdownRef.current = pageMarkdownDraft;
    if (nextFrame) {
      updateWireframeFrame(selectedPage, nextFrame);
    }
    loadFromCode(parsedElements);
  }, [appType, loadFromCode, pageMarkdownDraft, selectedPage, updateWireframeFrame]);

  const handleToggleMarkdownEditor = useCallback(() => {
    setIsMarkdownEditorOpen((current) => {
      if (current) {
        return false;
      }

      const nextMarkdown = buildCurrentPageMarkdown();
      lastSyncedMarkdownRef.current = nextMarkdown;
      setPageMarkdownDraft(nextMarkdown);
      return true;
    });
  }, [buildCurrentPageMarkdown]);

  const handleResetMarkdown = useCallback(() => {
    const nextMarkdown = buildCurrentPageMarkdown();
    lastSyncedMarkdownRef.current = nextMarkdown;
    setPageMarkdownDraft(nextMarkdown);
  }, [buildCurrentPageMarkdown]);

  useEffect(() => {
    if (!isMarkdownEditorOpen) {
      return;
    }

    const nextMarkdown = buildCurrentPageMarkdown();
    if (pageMarkdownDraft !== lastSyncedMarkdownRef.current || nextMarkdown === pageMarkdownDraft) {
      return;
    }

    lastSyncedMarkdownRef.current = nextMarkdown;
    setPageMarkdownDraft(nextMarkdown);
  }, [buildCurrentPageMarkdown, elements, isMarkdownEditorOpen, pageMarkdownDraft]);

  const handleDismiss = useCallback(() => {
    selectElement(null);
    onClosePanel?.();
  }, [selectElement, onClosePanel]);

  return (
    <>
      <div className="pm-module-list-backdrop" onClick={handleDismiss} />
      <div className="pm-module-list-overlay">
        <div className="pm-module-list-overlay-header">
          <h3>模块清单</h3>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={handleToggleMarkdownEditor}>
              {isMarkdownEditorOpen ? '收起 Markdown' : '编辑 Markdown'}
            </button>
            <button className="doc-action-btn secondary pm-module-list-close" type="button" onClick={handleDismiss}>
              ✕
            </button>
          </div>
        </div>

        <div className="pm-inline-actions" style={{ marginBottom: '10px' }}>
          <button className="doc-action-btn" type="button" onClick={onAddModule}>添加模块</button>
        </div>

        <div className="pm-module-list" ref={moduleListRef}>
          {moduleIds.length > 0 ? (
            moduleIds.map((moduleId) => (
              <WireframeModuleCard
                key={moduleId}
                moduleId={moduleId}
                draggingModuleId={draggingModuleId}
                setDraggingModuleId={setDraggingModuleId}
                appType={appType}
                onRequestDelete={onRequestDeleteModule}
              />
            ))
          ) : (
            <EmptyStateView
              icon="page"
              title="暂无模块"
              description='点击“添加模块”后，这里会按统一的模块列表卡片标准展示。'
            />
          )}
        </div>

        {isMarkdownEditorOpen && (
          <div className="pm-context-card" style={{ marginTop: '12px' }}>
            <strong>页面 Markdown</strong>
            <textarea
              ref={markdownTextareaRef}
              className="product-textarea pm-markdown-editor"
              value={pageMarkdownDraft}
              onChange={(event) => { setPageMarkdownDraft(event.target.value); }}
              onClick={(event) => handleMarkdownCursorSync(event.currentTarget.selectionStart)}
              onKeyUp={(event) => handleMarkdownCursorSync(event.currentTarget.selectionStart)}
            />
            <div className="pm-inline-actions">
              <button className="doc-action-btn" type="button" onClick={handleApplyMarkdown}>应用到画布</button>
              <button className="doc-action-btn secondary" type="button" onClick={handleResetMarkdown}>重置</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
});

export interface ProductPageWorkspacePaneProps {
  projectId: string | null;
  projectRootPath: string | null;
  diskItems: KnowledgeDiskItem[];
  designPages: PageStructureNode[];
  selectedPage: PageStructureNode | null;
  pageSearch: string;
  onPageSearchChange: (value: string) => void;
  onAddPage: () => void;
  onSelectPage: (pageId: string) => void;
  canvasPreset: CanvasPreset;
  isFrameEditorOpen: boolean;
  frameEditorDraft: string;
  onFrameEditorDraftChange: (value: string) => void;
  onApplyFrameValue: (value: string) => void;
  onToggleFrameEditor: () => void;
  onCloseFrameEditor: () => void;
  onAddModule: () => void;
  onRequestEditModule: (id: string) => void;
  onClearCurrentWireframe: () => void;
  isModulePanelOpen: boolean;
  onCloseModulePanel: () => void;
  onCreateNoteAtPath: (relativeDirectory: string | null) => void;
  onCreateFileAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  featureTree: FeatureTree | null;
  effectiveAppType?: AppType;
  onRequestDeleteModule: (moduleId: string, moduleTitle: string) => void;
}

export const ProductPageWorkspacePane = (props: ProductPageWorkspacePaneProps) => {
  const {
    projectId,
    projectRootPath,
    diskItems,
    designPages,
    selectedPage,
    pageSearch,
    onPageSearchChange,
    onAddPage,
    onSelectPage,
    canvasPreset,
    isFrameEditorOpen,
    frameEditorDraft,
    onFrameEditorDraftChange,
    onApplyFrameValue,
    onToggleFrameEditor,
    onCloseFrameEditor,
    onAddModule,
    onRequestEditModule,
    onClearCurrentWireframe,
    isModulePanelOpen,
    onCloseModulePanel,
    onCreateNoteAtPath,
    onCreateFileAtPath,
    onCreateFolderAtPath,
    onRenameTreePath,
    onDeleteTreePaths,
    onRefreshFilesystem,
    featureTree,
    effectiveAppType,
    onRequestDeleteModule,
  } = props;

  const elements = usePreviewStore((state) => state.elements);
  const [fileTreeSortMode, setFileTreeSortMode] = useState<PagTreeSortMode>('name-asc');
  const [collapsedFolderPaths, setCollapsedFolderPaths] = useState<Set<string>>(() => new Set());
  const [selectedTreePaths, setSelectedTreePaths] = useState<string[]>([]);
  const [anchorTreePath, setAnchorTreePath] = useState<string | null>(null);
  const [activeTreePath, setActiveTreePath] = useState<string | null>(null);
  const [treeDropTargetPath, setTreeDropTargetPath] = useState<string | null>(null);
  const [treeContextMenuState, setTreeContextMenuState] = useState<PagFileContextMenuState>(null);
  const [documentContextMenuState, setDocumentContextMenuState] = useState<PagDocumentContextMenuState>(null);
  const [documentSelection, setDocumentSelection] = useState<PagDocumentSelectionState>(null);
  const [filePreview, setFilePreview] = useState<FileWorkbenchViewModel | null>(null);
  const [isSavingFilePreview, setIsSavingFilePreview] = useState(false);
  const [filePreviewSaveMessage, setFilePreviewSaveMessage] = useState<string | null>(null);
  const [pagStatusMessage, setPagStatusMessage] = useState<string | null>(null);
  const [pagErrorMessage, setPagErrorMessage] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const treeContextMenuRef = useRef<HTMLDivElement | null>(null);
  const documentContextMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const documentSurfaceRef = useRef<HTMLDivElement | null>(null);
  const filePreviewRequestIdRef = useRef(0);
  const filePreviewAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSelectedReferenceFileIds = useAIContextStore((state) => state.setSelectedReferenceFileIds);
  const setSceneContext = useAIContextStore((state) => state.setSceneContext);
  const upsertReferenceFile = useDocumentProjectionStore((state) => state.upsertReferenceFile);

  const visibleFileTree = useMemo(
    () => buildPagFileTree(diskItems, pageSearch, fileTreeSortMode, projectRootPath),
    [diskItems, fileTreeSortMode, pageSearch, projectRootPath],
  );
  const hasVisibleTreeNodes = visibleFileTree.folders.length > 0 || visibleFileTree.files.length > 0;
  const allVisibleFolderPaths = useMemo(() => collectAllPagFolderPaths(visibleFileTree), [visibleFileTree]);
  const visibleTreePaths = useMemo(
    () => collectPagVisibleTreePaths(visibleFileTree, collapsedFolderPaths),
    [collapsedFolderPaths, visibleFileTree],
  );
  const allFoldersCollapsed =
    allVisibleFolderPaths.size > 0 && allVisibleFolderPaths.size === collapsedFolderPaths.size;
  const selectedTreeFile = useMemo(
    () => (activeTreePath ? findPagFileNodeByPath(visibleFileTree, activeTreePath) : null),
    [activeTreePath, visibleFileTree],
  );
  const selectedSketchPage = useMemo(
    () =>
      selectedTreeFile && PAG_SKETCH_PAGE_PATH_PATTERN.test(selectedTreeFile.path)
        ? designPages.find((page) => page.id === selectedTreeFile.path) || null
        : null,
    [designPages, selectedTreeFile],
  );
  const effectiveSelectedPage = selectedSketchPage || (!selectedTreeFile ? selectedPage : null);
  const isSketchPageSelected = Boolean(effectiveSelectedPage);
  const isMultiSelecting = selectedTreePaths.length > 1;
  const canAddCurrentDocumentToAI = Boolean(filePreview?.projection);
  const canOpenCurrentDocumentInSystem = Boolean(filePreview?.path);
  const isFilePreviewDirty = Boolean(filePreview && filePreview.draftContent !== filePreview.savedContent);
  const isFilePreviewEditable = Boolean(
    filePreview &&
      filePreview.state === 'ready' &&
      (filePreview.kind === 'code' || filePreview.kind === 'text' || isProjectionEditableKind(filePreview.kind))
  );
  const filePreviewStatusLabel = useMemo(() => {
    if (!filePreview) {
      return '';
    }

    if (filePreview.state === 'loading') {
      return '加载中';
    }

    if (filePreview.state === 'error') {
      return filePreviewSaveMessage || filePreview.errorMessage || '读取失败';
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

    return filePreviewSaveMessage || '自动保存';
  }, [filePreview, filePreviewSaveMessage, isFilePreviewDirty, isFilePreviewEditable, isSavingFilePreview]);

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
    setCollapsedFolderPaths(allFoldersCollapsed ? new Set() : collectAllPagFolderPaths(visibleFileTree));
  }, [allFoldersCollapsed, visibleFileTree]);

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
    [anchorTreePath, visibleTreePaths],
  );

  const closeTreeContextMenu = useCallback(() => {
    setTreeContextMenuState(null);
  }, []);

  const closeSortMenu = useCallback(() => {
    setSortMenuOpen(false);
  }, []);

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
          : null
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

  const handleOpenInternalMarkdownLink = useCallback((_target: KnowledgeInternalLinkTarget) => {
    return;
  }, []);

  const handleOpenWorkbenchFilePreview = useCallback(
    async (file: PagTreeFileNode) => {
      const requestId = filePreviewRequestIdRef.current + 1;
      filePreviewRequestIdRef.current = requestId;
      setFilePreviewSaveMessage(null);
      setPagErrorMessage(null);
      setFilePreview({
        path: file.absolutePath,
        title: file.name,
        draftContent: 'Loading document preview...',
        savedContent: '',
        kind: 'text',
        state: 'loading',
        projection: null,
      });

      try {
        const nextModel = await loadWorkbenchFileModel(file.absolutePath, file.name);
        if (filePreviewRequestIdRef.current !== requestId) {
          return;
        }

        if (nextModel.projection) {
          await saveProjectionArtifacts(projectRootPath, nextModel.projection);
          if (projectId) {
            upsertReferenceFile(projectId, buildProjectionReferenceFile(nextModel.projection));
          }
        }

        setFilePreview(nextModel);
      } catch (error) {
        if (filePreviewRequestIdRef.current !== requestId) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        setPagErrorMessage(errorMessage);
        setFilePreview({
          path: file.absolutePath,
          title: file.name,
          draftContent: `Unable to read this file.\n\n${errorMessage}`,
          savedContent: '',
          kind: 'binary',
          state: 'error',
          projection: null,
          errorMessage,
        });
      }
    },
    [projectId, projectRootPath, upsertReferenceFile],
  );

  const handleSaveWorkbenchFilePreview = useCallback(async () => {
    if (!filePreview || filePreview.state !== 'ready' || !isFilePreviewDirty) {
      return;
    }

    setIsSavingFilePreview(true);
    try {
      const nextProjection = await persistEditableWorkbenchFile(filePreview, projectRootPath);
      setFilePreview((current) =>
        current && current.path === filePreview.path
          ? {
              ...current,
              projection: nextProjection || current.projection,
              savedContent: current.draftContent,
            }
          : current,
      );
      if (nextProjection && projectId) {
        upsertReferenceFile(projectId, buildProjectionReferenceFile(nextProjection));
      }
      setFilePreviewSaveMessage('已自动保存');
      onRefreshFilesystem();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFilePreviewSaveMessage(errorMessage);
      setPagErrorMessage(errorMessage);
    } finally {
      setIsSavingFilePreview(false);
    }
  }, [filePreview, isFilePreviewDirty, onRefreshFilesystem, projectId, projectRootPath, upsertReferenceFile]);

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
    if (filePreview?.projection) {
      addReferenceFileToAI(buildProjectionReferenceFile(filePreview.projection));
      setPagStatusMessage(`已将 ${filePreview.title} 加入 AI 引用。`);
    }
  }, [addReferenceFileToAI, filePreview]);

  const handleAddSelectionToAI = useCallback(() => {
    const baseProjection = filePreview?.projection;
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
    setPagStatusMessage('已将选区加入 AI 引用。');
  }, [addReferenceFileToAI, documentSelection, filePreview?.projection]);

  const handleOpenCurrentDocumentInSystem = useCallback(async () => {
    if (!filePreview?.path) {
      return;
    }

    try {
      await invoke('open_path_in_shell', { path: filePreview.path });
    } catch (error) {
      setPagErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [filePreview?.path]);

  const handleAddTreeItemToAI = useCallback(async () => {
    if (!treeContextMenuState?.allowReference || treeContextMenuState.isFolder) {
      return;
    }

    if (!treeContextMenuState.targetAbsolutePath || !treeContextMenuState.targetTitle) {
      return;
    }

    const nextModel = await loadWorkbenchFileModel(
      treeContextMenuState.targetAbsolutePath,
      treeContextMenuState.targetTitle,
    );
    if (!nextModel.projection) {
      return;
    }

    await saveProjectionArtifacts(projectRootPath, nextModel.projection);
    addReferenceFileToAI(buildProjectionReferenceFile(nextModel.projection));
    closeTreeContextMenu();
    setPagStatusMessage(`已将 ${treeContextMenuState.targetTitle} 加入 AI 引用。`);
  }, [addReferenceFileToAI, closeTreeContextMenu, projectRootPath, treeContextMenuState]);

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

    const nestedResults = await Promise.all(children.map((child) => collectEntryFiles(child, `${prefix}${entry.name}/`)));
    return nestedResults.flat();
  }, []);

  const handleImportDrop = useCallback(async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTreeDropTargetPath(null);

    if (!projectRootPath) {
      return;
    }

    const conflictInput = window.prompt('重名处理：replace / skip / rename', 'rename');
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
      setPagStatusMessage('没有导入任何文件。');
      return;
    }

    setPagStatusMessage(
      importedPaths.length === 1
        ? `已导入 ${importedPaths[0]}。`
        : `已导入 ${importedPaths.length} 项到 ${targetBasePath || '根目录'}。`,
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

  const renderProjectionBlocks = useCallback((projection: DocumentProjection) => {
    return projection.blocks.map((block, blockIndex) => {
      if ((block.kind === 'table' || block.kind === 'sheet') && block.rows) {
        return (
          <div key={block.id} className="gn-note-doc-block" data-selection-anchor={block.anchor}>
            <strong>{block.title || block.sheetName || `Block ${blockIndex + 1}`}</strong>
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
          <KnowledgeMarkdownViewer markdown={filePreview.draftContent} onOpenInternalLink={handleOpenInternalMarkdownLink} />
        </div>
      );
    }

    if (filePreview.kind === 'binary') {
      return (
        <div className="gn-note-empty-main">
          <h2>{filePreview.title}</h2>
          <p>这个文件更适合用系统应用打开。</p>
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
          spellCheck={false}
          disabled={!isFilePreviewEditable}
        />
      </div>
    );
  }, [filePreview, handleOpenInternalMarkdownLink, isFilePreviewEditable, refreshDocumentSelection, renderProjectionBlocks]);

  const renderPagTree = useCallback(
    (folder: PagTreeFolderNode, depth = 0): Array<ReactNode> => {
      const nextNodes: Array<ReactNode> = [];

      for (const childFolder of folder.folders) {
        const isExpanded = !collapsedFolderPaths.has(childFolder.path);
        const isSelected = selectedTreePaths.includes(childFolder.path);
        const isActive = isMultiSelecting && isSelected;
        const isDropTarget = treeDropTargetPath === childFolder.path;

        nextNodes.push(
          <div key={childFolder.path} className="pm-page-tree-group">
            <div className="pm-page-tree-row">
              <button
                className={`pm-page-tree-node ${isActive ? 'active' : ''}`}
                type="button"
                title={childFolder.path}
                style={{ paddingLeft: `${16 + depth * 14}px`, borderStyle: isDropTarget ? 'dashed' : undefined }}
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
                  setTreeContextMenuState({
                    x: event.clientX,
                    y: event.clientY,
                    targetPath: childFolder.path,
                    targetAbsolutePath: childFolder.absolutePath,
                    targetTitle: childFolder.name,
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
                <span className={`pm-page-tree-caret visible ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
                  <WorkbenchIcon name="chevronRight" />
                </span>
                <strong>{childFolder.name}</strong>
                <span className="pm-page-tree-actions" aria-hidden="true">
                  {childFolder.fileCount}
                </span>
              </button>
            </div>
            {isExpanded ? <div className="pm-page-tree-children">{renderPagTree(childFolder, depth + 1)}</div> : null}
          </div>
        );
      }

      for (const file of folder.files) {
        const isSelected = selectedTreePaths.includes(file.path);
        const isCurrent = activeTreePath === file.path;
        const isActive = isCurrent || (isMultiSelecting && isSelected);

        nextNodes.push(
          <div key={file.id} className="pm-page-tree-row">
            <button
              className={`pm-page-tree-node ${isActive ? 'active' : ''}`}
              type="button"
              title={file.path}
              style={{ paddingLeft: `${28 + depth * 14}px` }}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                  handleTreeSelection(file.path, event.metaKey || event.ctrlKey, event.shiftKey);
                  return;
                }

                setSelectedTreePaths([]);
                setAnchorTreePath(file.path);
                setActiveTreePath(file.path);
                if (PAG_SKETCH_PAGE_PATH_PATTERN.test(file.path)) {
                  setFilePreview(null);
                  onSelectPage(file.path);
                  return;
                }

                void handleOpenWorkbenchFilePreview(file);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const nextSelectedPaths = selectedTreePaths.includes(file.path) ? selectedTreePaths : [file.path];
                setSelectedTreePaths(nextSelectedPaths);
                setAnchorTreePath(file.path);
                setActiveTreePath(file.path);
                setTreeContextMenuState({
                  x: event.clientX,
                  y: event.clientY,
                  targetPath: file.path,
                  targetAbsolutePath: file.absolutePath,
                  targetTitle: file.name,
                  isFolder: false,
                  selectedPaths: nextSelectedPaths,
                  allowReference: true,
                });
              }}
            >
              <strong>{file.name}</strong>
            </button>
          </div>
        );
      }

      return nextNodes;
    },
    [
      activeTreePath,
      collapsedFolderPaths,
      handleImportDrop,
      handleOpenWorkbenchFilePreview,
      handleTreeSelection,
      isMultiSelecting,
      onSelectPage,
      selectedTreePaths,
      toggleFolderExpanded,
      treeDropTargetPath,
    ],
  );

  useEffect(() => {
    setSelectedTreePaths((current) => current.filter((path) => visibleTreePaths.includes(path)));
    setAnchorTreePath((current) => (current && visibleTreePaths.includes(current) ? current : null));
    setActiveTreePath((current) => (current && visibleTreePaths.includes(current) ? current : null));
  }, [visibleTreePaths]);

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
  }, [filePreview, handleSaveWorkbenchFilePreview, isFilePreviewDirty, isFilePreviewEditable]);

  useEffect(() => {
    if (!treeContextMenuState) {
      return;
    }

    const closeMenu = (event: Event) => {
      if (event.target instanceof Node && treeContextMenuRef.current?.contains(event.target)) {
        return;
      }
      setTreeContextMenuState(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [treeContextMenuState]);

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

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    setSceneContext(projectId, {
      scene: 'page',
      selectedKnowledgeEntryId: filePreview?.projection?.id || null,
      selectedPageId: effectiveSelectedPage?.id || null,
    });
  }, [effectiveSelectedPage?.id, filePreview?.projection?.id, projectId, setSceneContext]);

  return (
    <PageWorkspace
      content={
        <div className="pm-page-hub-grid">
          <NoteSurface
            className="pm-page-structure-panel pm-page-panel-surface"
            eyebrow="Files"
            title="文档目录树"
            subtitle="按真实项目文件系统浏览 Sketch 文档与页面草图。"
            toolbar={
              <div className="pm-inline-actions">
                <input
                  className="product-input pm-page-search-input"
                  type="search"
                  value={pageSearch}
                  onChange={(event) => onPageSearchChange(event.target.value)}
                  placeholder="搜索文件或文件夹"
                />
                <button className="doc-action-btn" type="button" onClick={() => onCreateNoteAtPath(null)}>
                  + 笔记
                </button>
                <button className="doc-action-btn" type="button" onClick={() => onCreateFileAtPath(null)}>
                  + 文件
                </button>
                <button className="doc-action-btn secondary" type="button" onClick={() => onCreateFolderAtPath(null)}>
                  + 文件夹
                </button>
                <button className="doc-action-btn secondary" type="button" onClick={onAddPage}>
                  + Sketch
                </button>
                <div className="gn-note-sort-menu" ref={sortMenuRef}>
                  <button
                    className={`doc-action-btn secondary${sortMenuOpen ? ' active' : ''}`}
                    type="button"
                    onClick={() => setSortMenuOpen((current) => !current)}
                  >
                    排序
                  </button>
                  {sortMenuOpen ? (
                    <div className="pm-knowledge-context-menu" role="menu" aria-label="Sketch 文件排序">
                      {PAG_TREE_SORT_OPTIONS.map((option) => {
                        const active = option.value === fileTreeSortMode;
                        return (
                          <button
                            key={option.value}
                            className={`pm-knowledge-context-action${active ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => {
                              setFileTreeSortMode(option.value);
                              closeSortMenu();
                            }}
                          >
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <button className="doc-action-btn secondary" type="button" onClick={handleToggleAllFolders}>
                  {allFoldersCollapsed ? '展开' : '折叠'}
                </button>
                <button className="doc-action-btn secondary" type="button" onClick={onRefreshFilesystem}>
                  刷新
                </button>
              </div>
            }
          >
            {pagErrorMessage ? (
              <StatusBanner tone="danger" title="Sketch 文件工作台异常" message={pagErrorMessage} />
            ) : null}
            {pagStatusMessage ? (
              <StatusBanner tone="info" title="Sketch 文件工作台" message={pagStatusMessage} />
            ) : null}
            {selectedTreePaths.length > 1 ? (
              <StatusBanner
                tone="info"
                title={`已选择 ${selectedTreePaths.length} 项`}
                message="可通过右键菜单或批量删除继续处理。"
              />
            ) : null}
            <div
              className="pm-page-tree"
              onDragOver={(event) => {
                event.preventDefault();
                setTreeDropTargetPath('');
              }}
              onDragLeave={() => {
                setTreeDropTargetPath((current) => (current === '' ? null : current));
              }}
              onDrop={(event) => void handleImportDrop(event)}
              onContextMenu={(event) => {
                event.preventDefault();
                setTreeContextMenuState({
                  x: event.clientX,
                  y: event.clientY,
                  targetPath: null,
                  targetAbsolutePath: null,
                  targetTitle: null,
                  isFolder: null,
                  selectedPaths: selectedTreePaths,
                  allowReference: false,
                });
              }}
            >
              {hasVisibleTreeNodes ? (
                renderPagTree(visibleFileTree)
              ) : (
                <EmptyStateView
                  icon={pageSearch.trim() ? 'search' : 'document'}
                  title={pageSearch.trim() ? '没有匹配的文件' : '还没有可用文件'}
                  description={
                    pageSearch.trim()
                      ? '换个关键词试试，或刷新目录。'
                      : '从这里新建文件、文件夹或 Sketch 页面，开始整理 Sketch 工作台。'
                  }
                />
              )}
            </div>
            {treeContextMenuState ? (
              <div
                className="pm-knowledge-context-menu"
                ref={treeContextMenuRef}
                style={{ left: `${treeContextMenuState.x}px`, top: `${treeContextMenuState.y}px` }}
                onClick={(event) => event.stopPropagation()}
              >
                {treeContextMenuState.targetAbsolutePath ? (
                  <button
                    className="pm-knowledge-context-action"
                    type="button"
                    onClick={() => {
                      const targetAbsolutePath = treeContextMenuState.targetAbsolutePath;
                      closeTreeContextMenu();
                      if (targetAbsolutePath) {
                        void invoke('open_path_in_shell', { path: targetAbsolutePath });
                      }
                    }}
                  >
                    系统打开
                  </button>
                ) : null}
                <button
                  className="pm-knowledge-context-action"
                  type="button"
                  onClick={() => {
                    closeTreeContextMenu();
                    onCreateNoteAtPath(
                      treeContextMenuState.isFolder === false && treeContextMenuState.targetPath
                        ? treeContextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                        : treeContextMenuState.targetPath
                    );
                  }}
                >
                  新建笔记
                </button>
                <button
                  className="pm-knowledge-context-action"
                  type="button"
                  onClick={() => {
                    closeTreeContextMenu();
                    onCreateFileAtPath(
                      treeContextMenuState.isFolder === false && treeContextMenuState.targetPath
                        ? treeContextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                        : treeContextMenuState.targetPath
                    );
                  }}
                >
                  新建文件
                </button>
                <button
                  className="pm-knowledge-context-action"
                  type="button"
                  onClick={() => {
                    closeTreeContextMenu();
                    onCreateFolderAtPath(
                      treeContextMenuState.isFolder === false && treeContextMenuState.targetPath
                        ? treeContextMenuState.targetPath.replace(/\/[^/]+$/, '') || null
                        : treeContextMenuState.targetPath
                    );
                  }}
                >
                  新建文件夹
                </button>
                {treeContextMenuState.allowReference ? (
                  <button className="pm-knowledge-context-action" type="button" onClick={() => void handleAddTreeItemToAI()}>
                    加入 AI
                  </button>
                ) : null}
                {treeContextMenuState.targetPath ? (
                  <button
                    className="pm-knowledge-context-action"
                    type="button"
                    onClick={() => {
                      const targetPath = treeContextMenuState.targetPath;
                      closeTreeContextMenu();
                      if (targetPath) {
                        onRenameTreePath(targetPath, treeContextMenuState.isFolder === true);
                      }
                    }}
                  >
                    重命名
                  </button>
                ) : null}
                <button
                  className="pm-knowledge-context-action"
                  type="button"
                  onClick={() => {
                    closeTreeContextMenu();
                    void navigator.clipboard?.writeText(
                      (treeContextMenuState.selectedPaths[0] || treeContextMenuState.targetPath || projectRootPath || '').toString()
                    );
                  }}
                >
                  复制路径
                </button>
                <button className="pm-knowledge-context-action" type="button" onClick={onRefreshFilesystem}>
                  刷新目录
                </button>
                {treeContextMenuState.targetPath || treeContextMenuState.selectedPaths.length > 0 ? (
                  <button
                    className="pm-knowledge-context-action danger"
                    type="button"
                    onClick={() => {
                      closeTreeContextMenu();
                      onDeleteTreePaths(
                        treeContextMenuState.selectedPaths.length > 0
                          ? treeContextMenuState.selectedPaths
                          : (treeContextMenuState.targetPath as string),
                        treeContextMenuState.isFolder,
                      );
                    }}
                  >
                    {treeContextMenuState.selectedPaths.length > 1 ? '批量删除' : '删除'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </NoteSurface>

          <div className="pm-page-hub-canvas">
            <div className="pm-page-workspace-frame">
              <div className="pm-page-workspace">
                {isSketchPageSelected && effectiveSelectedPage ? (
                  <NoteSurface
                    className="pm-wireframe-main pm-wireframe-main-canvas pm-page-panel-surface"
                    eyebrow="Canvas"
                    title={effectiveSelectedPage.name}
                    subtitle="当前文件是 Sketch 页面，主区继续使用现有页面画布。"
                    toolbar={
                      <div className="pm-inline-actions pm-wireframe-canvas-actions">
                        <button
                          className={`doc-action-btn secondary ${canvasPreset.frameType === 'browser' ? 'active' : ''}`}
                          type="button"
                          onClick={() => onApplyFrameValue('1280x800')}
                        >
                          网页端
                        </button>
                        <button
                          className={`doc-action-btn secondary ${canvasPreset.frameType === 'mobile' ? 'active' : ''}`}
                          type="button"
                          onClick={() => onApplyFrameValue('390x844')}
                        >
                          手机端
                        </button>
                        <button className="doc-action-btn" type="button" onClick={onAddModule}>
                          添加模块
                        </button>
                      </div>
                    }
                  >
                    <div className="pm-canvas-shell">
                      <div className="pm-canvas-frame-editor">
                        <button className="doc-action-btn secondary" type="button" onClick={onToggleFrameEditor}>
                          编辑 Frame
                        </button>
                        {isFrameEditorOpen ? (
                          <div className="pm-canvas-frame-editor-popover">
                            <label className="pm-canvas-frame-editor-field">
                              <span>Frame</span>
                              <input
                                className="product-input"
                                type="text"
                                value={frameEditorDraft}
                                onChange={(event) => onFrameEditorDraftChange(event.target.value)}
                                placeholder="例如 1440x900"
                              />
                            </label>
                            <div className="pm-inline-actions pm-canvas-frame-editor-actions">
                              <button className="doc-action-btn" type="button" onClick={() => onApplyFrameValue(frameEditorDraft)}>
                                应用
                              </button>
                              <button className="doc-action-btn secondary" type="button" onClick={onCloseFrameEditor}>
                                取消
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <Canvas
                        key={effectiveSelectedPage.id}
                        width={canvasPreset.width}
                        height={canvasPreset.height}
                        frameType={canvasPreset.frameType}
                        onRequestEdit={onRequestEditModule}
                      />
                      <PagePropertiesFloat
                        selectedPage={effectiveSelectedPage}
                        moduleCount={elements.length}
                        canvasLabel={effectiveSelectedPage.metadata.route || canvasPreset.label}
                        onClearCurrentWireframe={onClearCurrentWireframe}
                      />
                    </div>

                    {isModulePanelOpen ? (
                      <ModuleListFloat
                        selectedPage={effectiveSelectedPage}
                        appType={effectiveAppType}
                        featureTree={featureTree}
                        onAddModule={onAddModule}
                        onRequestDeleteModule={onRequestDeleteModule}
                        onClosePanel={onCloseModulePanel}
                      />
                    ) : null}
                  </NoteSurface>
                ) : filePreview ? (
                  <main
                    ref={documentSurfaceRef}
                    className="gn-note-editor-column pm-wireframe-main pm-page-panel-surface"
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
                    <div className="gn-note-editor-surface">
                      <div className="gn-note-document-toolbar">
                        <div className="gn-note-document-meta">
                          <strong>{filePreview.title}</strong>
                          <span>{filePreview.path}</span>
                        </div>
                        <div className="pm-inline-actions">
                          <button
                            className="doc-action-btn secondary"
                            type="button"
                            onClick={handleOpenCurrentDocumentInSystem}
                            disabled={!canOpenCurrentDocumentInSystem}
                          >
                            系统打开
                          </button>
                          <button
                            className="doc-action-btn"
                            type="button"
                            onClick={handleAddCurrentDocumentToAI}
                            disabled={!canAddCurrentDocumentToAI}
                          >
                            加入 AI
                          </button>
                        </div>
                      </div>
                      {filePreviewStatusLabel ? (
                        <StatusBanner tone="info" title="文档状态" message={filePreviewStatusLabel} />
                      ) : null}
                      {renderFilePreviewContent()}
                    </div>
                    {documentContextMenuState ? (
                      <div
                        className="pm-knowledge-context-menu"
                        ref={documentContextMenuRef}
                        style={{ left: `${documentContextMenuState.x}px`, top: `${documentContextMenuState.y}px` }}
                      >
                        <button className="pm-knowledge-context-action" type="button" onClick={handleAddSelectionToAI}>
                          将选区加入 AI
                        </button>
                      </div>
                    ) : null}
                  </main>
                ) : (
                  <NoteSurface
                    className="pm-wireframe-main pm-page-panel-surface"
                    eyebrow="Workbench"
                    title="Sketch 文档工作台"
                    subtitle="从左侧目录树中选择文件，或打开 Sketch 页面进入画布。"
                  >
                    <EmptyStateView
                      icon="document"
                      title="先选择一个文件"
                      description="普通文件会在这里进入统一文档工作面，sketch/pages 下的页面文件会切到画布编辑。"
                    />
                  </NoteSurface>
                )}
              </div>
              <WireframeSyncBridge selectedPage={effectiveSelectedPage} />
            </div>
          </div>
        </div>
      }
    />
  );
};

/*
  if (!selectedPage) {
    return (
      <PageWorkspace
        content={
          <NoteSurface
            className="pm-empty-panel pm-page-panel-surface"
            eyebrow="Sketch"
            title="Sketch 工作区"
            subtitle="先创建一个页面，再进入统一的线框与模块工作流。"
          >
            <EmptyStateView
              icon="page"
              title="还没有 Sketch 草图"
              description="页面树、线框画布和模块侧栏都已经按统一工作台标准组织好，选中页面后会直接展开。"
            />
          </NoteSurface>
        }
      />
    );
  }

  return (
    <PageWorkspace
      content={
        <div className="pm-page-hub-grid">
          <NoteSurface
            className="pm-page-structure-panel pm-page-panel-surface"
            eyebrow="Sketch"
            title="Sketch 结构"
            subtitle="用统一的目录树视觉管理页面层级、选择与删除。"
            toolbar={
              <div className="pm-inline-actions">
                <input
                  className="product-input pm-page-search-input"
                  type="search"
                  value={pageSearch}
                  onChange={(event) => onPageSearchChange(event.target.value)}
                  placeholder="搜索 Sketch 页面"
                />
                <button className="doc-action-btn" type="button" onClick={onAddPage}>
                  + Sketch
                </button>
              </div>
            }
          >
            {designPages.length > 0 ? (
              filteredDesignPages.length > 0 ? (
                <div className="pm-page-tree">
                  {filteredPageStructure.map((node) => (
                    <PageTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedPageId={selectedPage.id}
                      onSelect={onSelectPage}
                      onDeletePage={onDeletePage}
                    />
                  ))}
                </div>
              ) : (
                <EmptyStateView
                  icon="search"
                  title="没有匹配的 Sketch 页面"
                  description="换一个关键词试试，或者直接创建新页面。"
                />
              )
            ) : (
              <EmptyStateView
                icon="document"
                title="还没有 Sketch 页面"
                description="先创建一个页面，后续画布、模块和属性面板会自动接到这套统一 UI。"
              />
            )}
          </NoteSurface>

          <div className="pm-page-hub-canvas">
            <div className="pm-page-workspace-frame">
              <div className="pm-page-workspace">
                <NoteSurface
                  className="pm-wireframe-main pm-wireframe-main-canvas pm-page-panel-surface"
                  eyebrow="Canvas"
                  title="页面画布"
                  subtitle="更接近原生桌面文档工作台的线框舞台，保留现有模块编辑能力。"
                  toolbar={
                    <div className="pm-inline-actions pm-wireframe-canvas-actions">
                      <button
                        className={`doc-action-btn secondary ${canvasPreset.frameType === 'browser' ? 'active' : ''}`}
                        type="button"
                        onClick={() => onApplyFrameValue('1280x800')}
                      >
                        网页端
                      </button>
                      <button
                        className={`doc-action-btn secondary ${canvasPreset.frameType === 'mobile' ? 'active' : ''}`}
                        type="button"
                        onClick={() => onApplyFrameValue('390x844')}
                      >
                        手机端
                      </button>
                      <button className="doc-action-btn" type="button" onClick={onAddModule}>
                        添加模块
                      </button>
                    </div>
                  }
                >
                  <div className="pm-canvas-shell">
                    <div className="pm-canvas-frame-editor">
                      <button className="doc-action-btn secondary" type="button" onClick={onToggleFrameEditor}>
                        编辑 Frame
                      </button>
                      {isFrameEditorOpen ? (
                        <div className="pm-canvas-frame-editor-popover">
                          <label className="pm-canvas-frame-editor-field">
                            <span>Frame</span>
                            <input
                              className="product-input"
                              type="text"
                              value={frameEditorDraft}
                              onChange={(event) => onFrameEditorDraftChange(event.target.value)}
                              placeholder="例如 1440x900"
                            />
                          </label>
                          <div className="pm-inline-actions pm-canvas-frame-editor-actions">
                            <button className="doc-action-btn" type="button" onClick={() => onApplyFrameValue(frameEditorDraft)}>
                              应用
                            </button>
                            <button className="doc-action-btn secondary" type="button" onClick={onCloseFrameEditor}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <Canvas
                      key={selectedPage.id}
                      width={canvasPreset.width}
                      height={canvasPreset.height}
                      frameType={canvasPreset.frameType}
                      onRequestEdit={onRequestEditModule}
                    />
                    <PagePropertiesFloat
                      selectedPage={selectedPage}
                      moduleCount={elements.length}
                      canvasLabel={selectedPage.metadata.route || canvasPreset.label}
                      onClearCurrentWireframe={onClearCurrentWireframe}
                    />
                  </div>

                  {isModulePanelOpen ? (
                    <ModuleListFloat
                      selectedPage={selectedPage}
                      appType={effectiveAppType}
                      featureTree={featureTree}
                      onAddModule={onAddModule}
                      onRequestDeleteModule={onRequestDeleteModule}
                      onClosePanel={onCloseModulePanel}
                    />
                  ) : null}
                </NoteSurface>
              </div>
              <WireframeSyncBridge selectedPage={selectedPage} />
            </div>
          </div>
        </div>
      }
    />
  );
};
*/
