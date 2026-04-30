import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Canvas } from '../canvas/Canvas';
import {
  type KnowledgeDiskItem,
  type KnowledgeGroupId,
} from '../../modules/knowledge/knowledgeTree';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { AppType, CanvasElement, FeatureNode, FeatureTree, PageStructureNode } from '../../types';
import { featureTreeToMarkdown } from '../../utils/featureTreeToMarkdown';
import { useShallow } from 'zustand/react/shallow';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
import type { KnowledgeNote } from '../../features/knowledge/model/knowledge';
import { projectKnowledgeNotesToRequirementDocs } from '../../features/knowledge/adapters/knowledgeRequirementAdapter';
import { WorkbenchIcon } from '../ui/WorkbenchIcon';
import { MacDialog } from '../ui/MacDialog';
import {
  buildPageWireframeMarkdown,
  createWireframeModule,
  findMarkdownModuleByOffset,
  findMarkdownModuleMatch,
  formatCanvasPreset,
  getCanvasPreset,
  isMobileAppType,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  parseFrameFromWireframeMarkdown,
  parsePageWireframeMarkdown,
  resolveCanvasPresetFromFrame,
  toWireframeModuleDrafts,
  WireframeModuleDraft,
} from '../../utils/wireframe';
import {
  deleteSketchPageFile,
  ensureProjectKnowledgeDirectory,
  getProjectKnowledgeRootDir,
  isTauriRuntimeAvailable,
  loadSketchPageArtifactsFromProjectDir,
  writeSketchPageFile,
} from '../../utils/projectPersistence';
import {
  getDirectoryPath,
  getRelativePathFromRoot,
  joinFileSystemPath,
  normalizeRelativeFileSystemPath,
} from '../../utils/fileSystemPaths.ts';
import { PageWorkspace } from './PageWorkspace';
import { KnowledgeNoteWorkspace, type KnowledgeNoteFilter } from '../../features/knowledge/workspace/KnowledgeNoteWorkspace';
import {
  extractKnowledgeNoteEditorBody,
  serializeKnowledgeNoteMarkdown,
} from '../../features/knowledge/workspace/knowledgeNoteMarkdown';
import { ensureProjectSystemIndex } from '../../modules/knowledge/systemIndexProject';

type SidebarTab = 'knowledge' | 'page';
export type WorkbenchLayoutFocus = 'canvas' | 'balanced' | 'sidebar';
export type WorkbenchLayoutDensity = 'comfortable' | 'compact';

type PendingDeleteRequest =
  | { type: 'knowledge-note'; id: string; title: string; sourceUrl: string | null }
  | { type: 'knowledge-tree-paths'; paths: string[]; title: string; containsFolders: boolean }
  | { type: 'page'; id: string; title: string }
  | { type: 'module'; id: string; title: string };

type KnowledgePathDialogState =
  | {
      mode: 'create-note' | 'create-folder' | 'rename-path';
      targetDirectory: string | null;
      relativePath: string | null;
      isFolder: boolean;
      inputValue: string;
    }
  | null;

const normalizeRequirementFilename = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!normalized) {
    return '未命名需求.md';
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
};

const normalizeKnowledgeNoteTitle = (value: string) => {
  const normalized = value.trim();
  return normalized || '未命名笔记';
};

const normalizeKnowledgeTreeSegment = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/-+/g, '-');

const joinDiskPath = (basePath: string, fileName: string) => joinFileSystemPath(basePath, fileName);

const normalizeRelativePath = (value: string) => normalizeRelativeFileSystemPath(value);

const getKnowledgeGroupOverridesStorageKey = (projectId: string) =>
  `goodnight:knowledge-group-overrides:${projectId}`;

const readKnowledgeGroupOverrides = (projectId: string | null) => {
  if (!projectId || typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(getKnowledgeGroupOverridesStorageKey(projectId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, KnowledgeGroupId>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeKnowledgeGroupOverrides = (projectId: string | null, value: Record<string, KnowledgeGroupId>) => {
  if (!projectId || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getKnowledgeGroupOverridesStorageKey(projectId), JSON.stringify(value));
};

const shouldIgnoreKnowledgePath = (relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  return normalized === '.goodnight' || normalized.startsWith('.goodnight/') || normalized === 'project.json';
};

const listKnowledgeDiskItems = async (rootPath: string): Promise<KnowledgeDiskItem[]> => {
  const walk = async (absolutePath: string, relativeBase = ''): Promise<KnowledgeDiskItem[]> => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_ls', {
      params: {
        path: absolutePath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `读取目录失败：${absolutePath}`);
    }

    const items: KnowledgeDiskItem[] = [];
    const entries = result.content
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const isFolder = entry.endsWith('/');
      const name = isFolder ? entry.slice(0, -1) : entry;
      const nextRelativePath = normalizeRelativePath(relativeBase ? `${relativeBase}/${name}` : name);
      if (!nextRelativePath || shouldIgnoreKnowledgePath(nextRelativePath)) {
        continue;
      }

      const nextAbsolutePath = joinDiskPath(absolutePath, name);
      items.push({
        path: nextAbsolutePath,
        relativePath: nextRelativePath,
        type: isFolder ? 'folder' : 'file',
      });

      if (isFolder) {
        items.push(...await walk(nextAbsolutePath, nextRelativePath));
      }
    }

    return items;
  };

  return walk(rootPath);
};

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const collectFeatureNodes = (nodes: FeatureNode[]): FeatureNode[] =>
  nodes.flatMap((node) => [node, ...collectFeatureNodes(node.children)]);

const filterPageTree = (nodes: PageStructureNode[], keyword: string): PageStructureNode[] => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterPageTree(node.children, normalizedKeyword);
    const matchesSelf = [node.name, node.description, node.metadata.route]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedKeyword));

    if (!matchesSelf && filteredChildren.length === 0) {
      return [];
    }

    return [{ ...node, children: filteredChildren }];
  });
};

const getRelativeDirectory = (value: string) => {
  const normalized = normalizeRelativePath(value);
  return normalized.includes('/') ? normalized.replace(/\/[^/]+$/, '') : '';
};

const getRelativePathWithinKnowledgeRoots = (
  filePath: string,
  projectRootDir: string | null,
  legacyVaultRoot: string | null
) =>
  normalizeRelativePath(
    (filePath && projectRootDir && getRelativePathFromRoot(filePath, projectRootDir)) ||
      (filePath && legacyVaultRoot && getRelativePathFromRoot(filePath, legacyVaultRoot)) ||
      ''
  );

const filterKnowledgeNotes = (notes: KnowledgeNote[], keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return notes;
  }

  return notes.filter((note) =>
    [note.title, note.bodyMarkdown, note.sourceUrl || '', ...(note.tags || [])]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedKeyword))
  );
};

const filterKnowledgeNotesByType = (notes: KnowledgeNote[], filter: KnowledgeNoteFilter) => {
  if (filter === 'all') {
    return notes;
  }

  if (filter === 'wiki-index' || filter === 'ai-summary') {
    return notes.filter((note) => note.docType === filter);
  }

  return notes.filter((note) => (note.kind || 'note') === filter);
};

const createCanvasId = () =>
  globalThis.crypto?.randomUUID?.() ?? `canvas-${Math.random().toString(36).slice(2, 10)}`;

const buildSampleWireframe = (pageName: string, featureName: string, isMobile: boolean): CanvasElement[] =>
  isMobile
    ? [
        createWireframeModule({ id: createCanvasId(), name: `${pageName} 顶部`, x: 20, y: 28, content: featureName }, 'mobile'),
        createWireframeModule({ id: createCanvasId(), name: '搜索按钮', x: 20, y: 142, content: '搜索入口' }, 'mobile'),
        createWireframeModule({ id: createCanvasId(), name: '主内容区', x: 20, y: 256, content: '列表或卡片主区域' }, 'mobile'),
        createWireframeModule({ id: createCanvasId(), name: '底部操作', x: 20, y: 370, content: '提交 / 下一步' }, 'mobile'),
      ]
    : [
        createWireframeModule({ id: createCanvasId(), name: `${pageName} 页头`, x: 28, y: 24, content: featureName }, 'web'),
        createWireframeModule({ id: createCanvasId(), name: '左侧导航', x: 28, y: 138, content: '一级导航 / 二级导航' }, 'web'),
        createWireframeModule({ id: createCanvasId(), name: '搜索按钮', x: 356, y: 138, content: '搜索与筛选' }, 'web'),
        createWireframeModule({ id: createCanvasId(), name: '主内容区', x: 356, y: 252, content: '表格、卡片或列表区域' }, 'web'),
      ];

interface PageTreeNodeProps {
  node: PageStructureNode;
  depth: number;
  selectedPageId: string | null;
  onSelect: (pageId: string) => void;
  onAddPage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
}

const PageTreeNode = memo<PageTreeNodeProps>(({ node, depth, selectedPageId, onSelect, onAddPage, onDeletePage }) => {
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
            onAddPage={onAddPage}
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
              className="pm-page-tree-action"
              type="button"
              title={`给 ${node.name} 添加子页面`}
              aria-label={`给 ${node.name} 添加子页面`}
              onClick={(event) => {
                event.stopPropagation();
                onAddPage(node.id);
              }}
            >
              <WorkbenchIcon name="plus" />
            </button>
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
              onAddPage={onAddPage}
              onDeletePage={onDeletePage}
            />
          ))}
        </div>
      )}
    </div>
  );
});

interface WireframeSidebarProps {
  selectedPage: PageStructureNode;
  appType?: AppType;
  featureTree: FeatureTree | null;
  draggingModuleId: string | null;
  setDraggingModuleId: Dispatch<SetStateAction<string | null>>;
  linkedFeatureName: string;
  canvasLabel: string;
  onAddModule: (position?: { x: number; y: number }) => void;
  onAddChildPage: () => void;
  onGenerateSampleWireframe: () => void;
  onClearCurrentWireframe: () => void;
  onRequestDeleteModule: (moduleId: string, moduleTitle: string) => void;
}

const getModuleDraft = (element: CanvasElement): WireframeModuleDraft => ({
  id: element.id,
  name: String(element.props.name || element.props.title || element.props.text || '未命名模块'),
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

interface WireframeModuleCardProps {
  moduleId: string;
  draggingModuleId: string | null;
  setDraggingModuleId: Dispatch<SetStateAction<string | null>>;
  appType?: AppType;
  onRequestDelete: (moduleId: string, moduleTitle: string) => void;
}

const WireframeModuleCard = memo<WireframeModuleCardProps>(({ moduleId, draggingModuleId, setDraggingModuleId, appType, onRequestDelete }) => {
  const element = usePreviewStore((state) => state.elements.find((item) => item.id === moduleId) || null);
  const isActive = usePreviewStore((state) => state.selectedElementId === moduleId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const reorderElements = usePreviewStore((state) => state.reorderElements);
  const updateElement = usePreviewStore((state) => state.updateElement);
  const module = useMemo(() => (element ? getModuleDraft(element) : null), [element]);
  const [textDrafts, setTextDrafts] = useState<{ name: string; content: string }>({
    name: '',
    content: '',
  });
  const [numericDrafts, setNumericDrafts] = useState<{ x: string; y: string; width: string; height: string }>({
    x: '0',
    y: '0',
    width: String(MIN_MODULE_WIDTH),
    height: String(MIN_MODULE_HEIGHT),
  });

  const handleModuleFieldChange = useCallback((updates: Partial<{ name: string; x: number; y: number; width: number; height: number; content: string }>) => {
    if (!element) {
      return;
    }

    const nextElement = createWireframeModule(
      {
        id: moduleId,
        name: typeof updates.name === 'string' ? updates.name : String(element.props.name || element.props.title || '模块'),
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

  const handleNumericDraftChange = useCallback((
    field: 'x' | 'y' | 'width' | 'height',
    value: string
  ) => {
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
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggingModuleId && draggingModuleId !== moduleId) {
          reorderElements(draggingModuleId, moduleId);
          selectElement(draggingModuleId);
        }
        setDraggingModuleId(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectElement(moduleId);
        }
      }}
    >
      <div className="pm-module-card-header">
        <div className="pm-module-card-title">
          <button
            className="pm-drag-handle"
            type="button"
            draggable
            onDragStart={() => setDraggingModuleId(moduleId)}
            onDragEnd={() => setDraggingModuleId(null)}
            onClick={(event) => event.stopPropagation()}
            title="拖动调整层级"
          >
            ⋮⋮
          </button>
          <strong>{module.name}</strong>
        </div>
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

      <div className="pm-module-card-meta">
        <span>{`X ${module.x}`}</span>
        <span>{`Y ${module.y}`}</span>
        <span>{`宽 ${module.width}`}</span>
        <span>{`高 ${module.height}`}</span>
      </div>

      {isActive ? (
        <>
          <label className="pm-field-stack pm-field-stack-compact">
            <span>{'\u6a21\u5757\u540d\u79f0'}</span>
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
              placeholder={"\u8f93\u5165\u6a21\u5757\u540d\u79f0"}
            />
          </label>
          <div className="pm-form-grid">
            <label className="pm-field-stack pm-field-stack-compact">
              <span>{'X \u5750\u6807'}</span>
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
              <span>{'Y \u5750\u6807'}</span>
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
              <span>{'\u6a21\u5757\u5bbd\u5ea6'}</span>
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
                placeholder={"\u5bbd\u5ea6"}
              />
            </label>
            <label className="pm-field-stack pm-field-stack-compact">
              <span>{'\u6a21\u5757\u9ad8\u5ea6'}</span>
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
                placeholder={"\u9ad8\u5ea6"}
              />
            </label>
          </div>
          <label className="pm-field-stack pm-field-stack-compact">
            <span>{'\u6a21\u5757\u5185\u5bb9'}</span>
            <textarea
              className="product-textarea compact pm-module-content-input"
              value={textDrafts.content}
              onChange={(event) => handleTextDraftChange('content', event.target.value)}
              onBlur={() => handleTextFieldCommit('content')}
              placeholder={"\u6a21\u5757\u5185\u5bb9"}
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

const WireframeSidebar = memo<WireframeSidebarProps>(({
  selectedPage,
  appType,
  featureTree,
  draggingModuleId,
  setDraggingModuleId,
  linkedFeatureName,
  canvasLabel,
  onAddModule,
  onAddChildPage,
  onGenerateSampleWireframe,
  onClearCurrentWireframe,
  onRequestDeleteModule,
}) => {
  const [isMarkdownEditorOpen, setIsMarkdownEditorOpen] = useState(false);
  const [pageMarkdownDraft, setPageMarkdownDraft] = useState('');
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const moduleListRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const elements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const updatePageStructureNode = useProjectStore((state) => state.updatePageStructureNode);
  const updateWireframeFrame = useProjectStore((state) => state.updateWireframeFrame);
  const currentWireframeFrame = useProjectStore((state) => state.wireframes[selectedPage.id]?.frame || null);
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
  }, [appType, currentWireframeFrame, featureTree, selectedPage]);

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
      module.name === match.name &&
      module.x === match.x &&
      module.y === match.y
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

  return (
    <section className="pm-card pm-wireframe-side">
      <div className="pm-wireframe-inline-meta">
        <div className="pm-context-card pm-wireframe-page-card">
          <div className="pm-wireframe-side-header">
            <div>
              <strong>{selectedPage.name}</strong>
              <span>{selectedPage.metadata.route || canvasLabel}</span>
            </div>
            <div className="pm-inline-actions">
              <button className="doc-action-btn" type="button" onClick={() => onAddModule()}>
                添加模块
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onAddChildPage}>
                添加子页面
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onGenerateSampleWireframe}>
                示例草图
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onClearCurrentWireframe}>
                清空
              </button>
            </div>
          </div>

          <div className="pm-form-grid pm-page-form-grid">
            <label className="pm-field-stack">
              <span>{'\u9875\u9762\u540d\u79f0'}</span>
              <input
                className="product-input pm-form-input pm-page-form-input"
              value={selectedPage.name}
              onChange={(event) => updatePageStructureNode(selectedPage.id, { name: event.target.value })}
              placeholder="\u9875\u9762\u540d\u79f0"
              />
            </label>
            <label className="pm-field-stack">
              <span>{'\u9875\u9762\u63cf\u8ff0'}</span>
              <textarea
                className="product-textarea compact pm-page-description-input pm-page-form-input"
              value={selectedPage.description}
              onChange={(event) => updatePageStructureNode(selectedPage.id, { description: event.target.value })}
              placeholder="\u9875\u9762\u63cf\u8ff0"
              />
            </label>
          </div>

          <div className="pm-wireframe-meta-strip">
            <span>{moduleDrafts.length} 个模块</span>
            {linkedFeatureName ? <span>{linkedFeatureName}</span> : null}
          </div>
        </div>

        <div className="pm-card-header pm-wireframe-section-header">
          <div>
            <h3>模块清单</h3>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={handleToggleMarkdownEditor}>
              {isMarkdownEditorOpen ? '收起 Markdown' : '编辑 Markdown'}
            </button>
          </div>
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
            <div className="pm-context-card">
              <strong>暂无模块</strong>
              <span>点击“添加模块”或“生成示例草图”开始编辑。</span>
            </div>
          )}
        </div>

        {isMarkdownEditorOpen && (
          <div className="pm-context-card">
            <strong>页面 Markdown</strong>
            <textarea
              ref={markdownTextareaRef}
              className="product-textarea pm-markdown-editor"
              value={pageMarkdownDraft}
              onChange={(event) => {
                setPageMarkdownDraft(event.target.value);
              }}
              onClick={(event) => handleMarkdownCursorSync(event.currentTarget.selectionStart)}
              onKeyUp={(event) => handleMarkdownCursorSync(event.currentTarget.selectionStart)}
            />
            <div className="pm-inline-actions">
              <button className="doc-action-btn" type="button" onClick={handleApplyMarkdown}>
                应用到画布
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={handleResetMarkdown}>
                重置
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
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

interface ProductWorkbenchProps {
  onFeatureSelect?: (node: FeatureNode) => void;
  layoutFocus: WorkbenchLayoutFocus;
  layoutDensity: WorkbenchLayoutDensity;
  entryTab?: SidebarTab;
  preferredPageId?: string | null;
  onEntryTabChange?: (tab: SidebarTab) => void;
}

export const ProductWorkbench = ({
  onFeatureSelect,
  layoutFocus,
  layoutDensity,
  entryTab,
  preferredPageId,
  onEntryTabChange,
}: ProductWorkbenchProps) => {
  const [internalSidebarTab, setInternalSidebarTab] = useState<SidebarTab>('knowledge');
  const sidebarTab = entryTab || internalSidebarTab;
  const [selectedKnowledgeNoteId, setSelectedKnowledgeNoteId] = useState<string | null>(null);
  const [openKnowledgeTabIds, setOpenKnowledgeTabIds] = useState<string[]>([]);
  const [requirementDraftTitle, setRequirementDraftTitle] = useState('');
  const [requirementDraftContent, setRequirementDraftContent] = useState('');
  const [requirementSaveMessage, setRequirementSaveMessage] = useState<string | null>(null);
  const [projectRootDir, setProjectRootDir] = useState<string | null>(null);
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [manualPageId, setManualPageId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeFilter, setKnowledgeFilter] = useState<KnowledgeNoteFilter>('all');
  const [knowledgeDiskItems, setKnowledgeDiskItems] = useState<KnowledgeDiskItem[]>([]);
  const [knowledgeGroupOverrides, setKnowledgeGroupOverrides] = useState<Record<string, KnowledgeGroupId>>({});
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<PendingDeleteRequest | null>(null);
  const [knowledgePathDialog, setKnowledgePathDialog] = useState<KnowledgePathDialogState>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [isFrameEditorOpen, setIsFrameEditorOpen] = useState(false);
  const [frameEditorDraft, setFrameEditorDraft] = useState('');
  const knowledgeRefreshRequestIdRef = useRef(0);
  const hydratedKnowledgeNoteSignatureRef = useRef('');
  const lastPersistedSketchSnapshotRef = useRef('');

  const {
    currentProject,
    featuresMarkdown,
    pageStructure,
    wireframes,
    generatedFiles,
    setFeaturesMarkdown,
    addRootPage,
    addSiblingPage,
    addChildPage,
    deletePageStructureNode,
    replaceRequirementDocs,
    replacePageStructure,
    replaceWireframes,
    updateWireframeFrame,
    updateProject,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    featuresMarkdown: state.featuresMarkdown,
    pageStructure: state.pageStructure,
    wireframes: state.wireframes,
    generatedFiles: state.generatedFiles,
    setFeaturesMarkdown: state.setFeaturesMarkdown,
    addRootPage: state.addRootPage,
    addSiblingPage: state.addSiblingPage,
    addChildPage: state.addChildPage,
    deletePageStructureNode: state.deletePageStructureNode,
    replaceRequirementDocs: state.replaceRequirementDocs,
    replacePageStructure: state.replacePageStructure,
    replaceWireframes: state.replaceWireframes,
    updateWireframeFrame: state.updateWireframeFrame,
    updateProject: state.updateProject,
  })));
  const projectKnowledgeRootDir = useMemo(
    () => (currentProject?.vaultPath ? getProjectKnowledgeRootDir(currentProject) : null),
    [currentProject]
  );

  const tree = useFeatureTreeStore((state) => state.tree);
  const selectFeature = useFeatureTreeStore((state) => state.selectFeature);
  const setSceneContext = useAIContextStore((state) => state.setSceneContext);
  const setCanvasSize = usePreviewStore((state) => state.setCanvasSize);
  const clearCanvas = usePreviewStore((state) => state.clearCanvas);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const deleteElement = usePreviewStore((state) => state.deleteElement);
  const serverNotes = useKnowledgeStore((state) => state.notes);
  const serverSearchResults = useKnowledgeStore((state) => state.searchResults);
  const serverSearchQuery = useKnowledgeStore((state) => state.searchQuery);
  const isKnowledgeSearching = useKnowledgeStore((state) => state.isSearching);
  const isKnowledgeSyncing = useKnowledgeStore((state) => state.isSyncing);
  const knowledgeSidecarError = useKnowledgeStore((state) => state.error);
  const searchServerNotes = useKnowledgeStore((state) => state.searchNotes);
  const loadServerNotes = useKnowledgeStore((state) => state.loadNotes);
  const createServerNote = useKnowledgeStore((state) => state.createProjectNote);
  const deleteServerNote = useKnowledgeStore((state) => state.deleteProjectNote);
  const updateServerNote = useKnowledgeStore((state) => state.updateProjectNote);
  const canUseProjectFilesystem = isTauriRuntimeAvailable();

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedPage = designPages.find((page) => page.id === manualPageId) || designPages[0] || null;
  const selectedPageWireframe = selectedPage ? wireframes[selectedPage.id] || null : null;
  const baseCanvasPreset = useMemo(() => getCanvasPreset(currentProject?.appType), [currentProject?.appType]);
  const selectedPageFrame = selectedPageWireframe?.frame || formatCanvasPreset(baseCanvasPreset);
  const canvasPreset = useMemo(
    () => resolveCanvasPresetFromFrame(selectedPageFrame, currentProject?.appType),
    [currentProject?.appType, selectedPageFrame]
  );
  const projectedRequirementDocs = useMemo(
    () => projectKnowledgeNotesToRequirementDocs(serverNotes),
    [serverNotes]
  );
  const filteredServerNotes = useMemo(() => {
    const normalizedSearch = knowledgeSearch.trim();
    const searchedNotes = !normalizedSearch
      ? serverNotes
      : serverSearchQuery === normalizedSearch
        ? serverSearchResults
        : filterKnowledgeNotes(serverNotes, normalizedSearch);

    return filterKnowledgeNotesByType(searchedNotes, knowledgeFilter);
  }, [knowledgeFilter, knowledgeSearch, serverNotes, serverSearchQuery, serverSearchResults]);
  const filteredPageStructure = useMemo(() => filterPageTree(pageStructure, pageSearch), [pageSearch, pageStructure]);
  const filteredDesignPages = useMemo(() => collectDesignPages(filteredPageStructure), [filteredPageStructure]);
  const selectedServerNote = useMemo(
    () => serverNotes.find((note) => note.id === selectedKnowledgeNoteId) || null,
    [serverNotes, selectedKnowledgeNoteId]
  );
  const selectedKnowledgeMarkdownValue = selectedServerNote
    ? serializeKnowledgeNoteMarkdown(
        selectedServerNote.title,
        extractKnowledgeNoteEditorBody(selectedServerNote.title, selectedServerNote.bodyMarkdown)
      )
    : '';
  const currentKnowledgeMarkdownValue = selectedServerNote
    ? serializeKnowledgeNoteMarkdown(requirementDraftTitle, requirementDraftContent)
    : '';
  const hasRequirementChanges = selectedServerNote
    ? requirementDraftTitle !== selectedServerNote.title || currentKnowledgeMarkdownValue !== selectedKnowledgeMarkdownValue
    : false;
  const canPersistRequirementToDisk = Boolean(projectRootDir);
  const canSaveRequirement = Boolean(
    selectedServerNote &&
    !isSavingRequirement &&
    (hasRequirementChanges || !selectedServerNote.sourceUrl)
  );
  const effectiveAppType = useMemo<AppType | undefined>(() => {
    if (canvasPreset.frameType === 'mobile') {
      return currentProject?.appType === 'mini_program' ? 'mini_program' : 'mobile';
    }

    return currentProject?.appType === 'desktop' || currentProject?.appType === 'backend' || currentProject?.appType === 'api'
      ? 'web'
      : currentProject?.appType || 'web';
  }, [canvasPreset.frameType, currentProject?.appType]);
  const featureMap = useMemo(() => {
    const nodes = tree ? collectFeatureNodes(tree.children) : [];
    return new Map(nodes.map((node) => [node.id, node]));
  }, [tree]);
  const linkedFeatures = selectedPage?.featureIds.map((id) => featureMap.get(id)).filter(Boolean) as FeatureNode[] | undefined;
  const linkedFeatureName = linkedFeatures?.map((feature) => feature.name).join(' / ') || '核心页面';
  const layoutStyle = useMemo<CSSProperties>(() => {
    const pageColumns =
      layoutFocus === 'canvas'
        ? 'minmax(0, 1.92fr) minmax(268px, 0.42fr)'
        : layoutFocus === 'sidebar'
          ? 'minmax(0, 1.34fr) minmax(292px, 0.62fr)'
          : 'minmax(0, 1.72fr) minmax(280px, 0.48fr)';

    return {
      ['--pm-page-columns' as string]: pageColumns,
      ['--pm-shell-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-padding' as string]: layoutDensity === 'compact' ? '12px' : '16px',
      ['--pm-canvas-height' as string]: layoutDensity === 'compact' ? 'clamp(540px, 70vh, 780px)' : 'clamp(600px, 76vh, 860px)',
    };
  }, [layoutDensity, layoutFocus]);

  const setSidebarTab = useCallback(
    (nextTab: SidebarTab) => {
      if (entryTab) {
        onEntryTabChange?.(nextTab);
        return;
      }

      setInternalSidebarTab(nextTab);
    },
    [entryTab, onEntryTabChange]
  );

  useEffect(() => {
    if (!tree) {
      return;
    }

    const nextMarkdown = featureTreeToMarkdown(tree);
    if (nextMarkdown !== featuresMarkdown) {
      setFeaturesMarkdown(nextMarkdown);
    }
  }, [featuresMarkdown, setFeaturesMarkdown, tree]);

  useEffect(() => {
    setCanvasSize(canvasPreset.width, canvasPreset.height);
  }, [canvasPreset.height, canvasPreset.width, setCanvasSize]);

  useEffect(() => {
    setFrameEditorDraft(selectedPageFrame);
  }, [selectedPageFrame]);

  useEffect(() => {
    setIsFrameEditorOpen(false);
  }, [selectedPage?.id]);

  const handleApplyFrameValue = useCallback((nextFrame: string) => {
    if (!selectedPage) {
      return;
    }

    const normalizedFrame = nextFrame.trim();
    if (!normalizedFrame) {
      return;
    }

    updateWireframeFrame(selectedPage, nextFrame);
    setFrameEditorDraft(normalizedFrame);
    setIsFrameEditorOpen(false);
  }, [selectedPage, updateWireframeFrame]);

  const handleToggleFrameEditor = useCallback(() => {
    setIsFrameEditorOpen((current) => {
      if (current) {
        return false;
      }

      setFrameEditorDraft(selectedPageFrame);
      return true;
    });
  }, [selectedPageFrame]);

  useEffect(() => {
    setSelectedKnowledgeNoteId((current) =>
      current && serverNotes.some((note) => note.id === current) ? current : null
    );
  }, [serverNotes]);

  useEffect(() => {
    if (!selectedServerNote) {
      return;
    }

    setOpenKnowledgeTabIds((current) =>
      current.includes(selectedServerNote.id) ? current : [...current, selectedServerNote.id]
    );
  }, [selectedServerNote]);

  useEffect(() => {
    if (!currentProject || !canUseProjectFilesystem) {
      return;
    }

    void loadServerNotes(currentProject.id);
  }, [canUseProjectFilesystem, currentProject, loadServerNotes]);

  useEffect(() => {
    if (!currentProject || !canUseProjectFilesystem) {
      return;
    }

    const normalizedSearch = knowledgeSearch.trim();
    if (!normalizedSearch) {
      void searchServerNotes(currentProject.id, '');
      return;
    }

    const searchTimer = window.setTimeout(() => {
      void searchServerNotes(currentProject.id, normalizedSearch);
    }, 180);

    return () => {
      window.clearTimeout(searchTimer);
    };
  }, [canUseProjectFilesystem, currentProject, knowledgeSearch, searchServerNotes]);

  useEffect(() => {
    if (serverNotes.length === 0) {
      return;
    }

    replaceRequirementDocs(projectedRequirementDocs);
  }, [projectedRequirementDocs, replaceRequirementDocs, serverNotes.length]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setSceneContext(currentProject.id, {
      scene: sidebarTab === 'knowledge' ? 'knowledge' : 'page',
      selectedKnowledgeEntryId: selectedServerNote?.id || null,
      selectedPageId: selectedPage?.id || null,
      openedKnowledgeEntryIds: openKnowledgeTabIds,
    });
  }, [
    currentProject,
    openKnowledgeTabIds,
    selectedPage?.id,
    selectedServerNote?.id,
    setSceneContext,
    sidebarTab,
  ]);

  useEffect(() => {
    if (!selectedServerNote) {
      setRequirementDraftTitle('');
      setRequirementDraftContent('');
      hydratedKnowledgeNoteSignatureRef.current = '';
      return;
    }

    const nextHydratedSignature = `${selectedServerNote.id}:${selectedServerNote.title}:${selectedServerNote.bodyMarkdown}`;
    if (hydratedKnowledgeNoteSignatureRef.current === nextHydratedSignature) {
      return;
    }

    hydratedKnowledgeNoteSignatureRef.current = nextHydratedSignature;
    setRequirementDraftTitle(selectedServerNote.title);
    setRequirementDraftContent(extractKnowledgeNoteEditorBody(selectedServerNote.title, selectedServerNote.bodyMarkdown));
    setRequirementSaveMessage(null);
  }, [selectedServerNote]);

  useEffect(() => {
    if (!currentProject) {
      setProjectRootDir(null);
      return;
    }

    if (!canUseProjectFilesystem) {
      setProjectRootDir(null);
      setRequirementSaveMessage('当前运行在浏览器开发环境，知识笔记会保存到本地知识库；桌面版可同步 Markdown 镜像。');
      return;
    }

    setProjectRootDir(projectKnowledgeRootDir);
  }, [canUseProjectFilesystem, currentProject, projectKnowledgeRootDir]);

  useEffect(() => {
    setKnowledgeGroupOverrides(readKnowledgeGroupOverrides(currentProject?.id || null));
  }, [currentProject?.id]);

  useEffect(() => {
    writeKnowledgeGroupOverrides(currentProject?.id || null, knowledgeGroupOverrides);
  }, [currentProject?.id, knowledgeGroupOverrides]);

  const writeRequirementFile = useCallback(async (filePath: string, content: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
      params: {
        file_path: filePath,
        content,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `写入文件失败：${filePath}`);
    }
  }, []);

  const renameRequirementFile = useCallback(async (fromPath: string, toPath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_rename', {
      params: {
        from_path: fromPath,
        to_path: toPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `重命名文件失败：${fromPath} -> ${toPath}`);
    }
  }, []);

  const createKnowledgeDirectory = useCallback(async (directoryPath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_mkdir', {
      params: {
        file_path: directoryPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `创建文件夹失败：${directoryPath}`);
    }
  }, []);

  const removeKnowledgePath = useCallback(async (targetPath: string) => {
    const result = await invoke<{ success: boolean; error: string | null }>('tool_remove', {
      params: {
        file_path: targetPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `删除路径失败：${targetPath}`);
    }
  }, []);

  const refreshKnowledgeFilesystem = useCallback(async () => {
    const requestId = ++knowledgeRefreshRequestIdRef.current;

    if (!canUseProjectFilesystem || !currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    await ensureProjectKnowledgeDirectory(currentProject);
    const diskItems = await listKnowledgeDiskItems(projectRootDir);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }
    setKnowledgeDiskItems(diskItems);

    const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }

    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }

    replacePageStructure(sketchArtifacts.pageStructure, tree);
    replaceWireframes(sketchArtifacts.wireframes, tree);
  }, [canUseProjectFilesystem, currentProject, projectRootDir, replacePageStructure, replaceWireframes, tree]);

  const handleRefreshKnowledgeFilesystem = useCallback(() => {
    void refreshKnowledgeFilesystem();
  }, [refreshKnowledgeFilesystem]);

  const collectNotesForKnowledgePaths = useCallback((relativePaths: string[]) => {
    if (!projectRootDir) {
      return [];
    }

    const normalizedTargets = relativePaths.map((path) => normalizeRelativePath(path)).filter(Boolean);
    return serverNotes.filter((note) => {
      const noteRelativePath = normalizeRelativePath(
        getRelativePathFromRoot(note.sourceUrl || '', projectRootDir) || note.sourceUrl || ''
      );
      if (!noteRelativePath) {
        return false;
      }

      return normalizedTargets.some(
        (targetPath) => noteRelativePath === targetPath || noteRelativePath.startsWith(`${targetPath}/`)
      );
    });
  }, [projectRootDir, serverNotes]);

  const handleCreateKnowledgeNoteAtPath = useCallback((relativeDirectory: string | null) => {
    setKnowledgePathDialog({
      mode: 'create-note',
      targetDirectory: normalizeRelativePath(relativeDirectory || ''),
      relativePath: null,
      isFolder: false,
      inputValue: '未命名笔记',
    });
  }, []);

  const handleCreateKnowledgeFolderAtPath = useCallback((relativeDirectory: string | null) => {
    setKnowledgePathDialog({
      mode: 'create-folder',
      targetDirectory: normalizeRelativePath(relativeDirectory || ''),
      relativePath: null,
      isFolder: true,
      inputValue: '新建文件夹',
    });
  }, []);

  const handleRenameKnowledgeTreePath = useCallback((relativePath: string, isFolder: boolean) => {
    const normalizedPath = normalizeRelativePath(relativePath);
    setKnowledgePathDialog({
      mode: 'rename-path',
      targetDirectory: getRelativeDirectory(normalizedPath),
      relativePath: normalizedPath,
      isFolder,
      inputValue: normalizedPath.split('/').pop() || normalizedPath,
    });
  }, []);

  const handleDeleteKnowledgeTreePaths = useCallback((relativePaths: string[] | string, isFolder: boolean | null) => {
    const normalizedPaths = (Array.isArray(relativePaths) ? relativePaths : [relativePaths])
      .map((path) => normalizeRelativePath(path))
      .filter(Boolean);
    const uniquePaths = normalizedPaths.filter(
      (path, index, paths) => paths.findIndex((candidate) => candidate === path) === index
    );
    const compactPaths = uniquePaths.filter(
      (path) => !uniquePaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`))
    );

    if (compactPaths.length === 0) {
      return;
    }

    setPendingDeleteRequest({
      type: 'knowledge-tree-paths',
      paths: compactPaths,
      title:
        compactPaths.length > 1
          ? `批量删除 ${compactPaths.length} 项`
          : compactPaths[0].split('/').pop() || compactPaths[0],
      containsFolders: isFolder === true || compactPaths.some((path) =>
        knowledgeDiskItems.some((item) => item.type === 'folder' && normalizeRelativePath(item.relativePath) === path)
      ),
    });
  }, [knowledgeDiskItems]);

  const handleConfirmKnowledgePathDialog = useCallback(async () => {
    if (!knowledgePathDialog || !currentProject || !projectRootDir) {
      setKnowledgePathDialog(null);
      return;
    }

    const normalizedName =
      knowledgePathDialog.mode === 'create-note'
        ? normalizeRequirementFilename(knowledgePathDialog.inputValue)
        : normalizeKnowledgeTreeSegment(knowledgePathDialog.inputValue);

    if (!normalizedName) {
      setRequirementSaveMessage('请输入有效名称。');
      return;
    }

    const baseRelativePath =
      knowledgePathDialog.mode === 'rename-path'
        ? getRelativeDirectory(knowledgePathDialog.relativePath || '')
        : normalizeRelativePath(knowledgePathDialog.targetDirectory || '');
    const nextRelativePath = normalizeRelativePath(
      baseRelativePath ? `${baseRelativePath}/${normalizedName}` : normalizedName
    );
    const nextAbsolutePath = joinDiskPath(projectRootDir, nextRelativePath);

    try {
      if (knowledgePathDialog.mode === 'create-folder') {
        await createKnowledgeDirectory(nextAbsolutePath);
        setRequirementSaveMessage(`已创建文件夹 ${normalizedName}。`);
      } else if (knowledgePathDialog.mode === 'create-note') {
        const nextTitle = normalizedName.replace(/\.(md|markdown)$/i, '');
        const nextContent = serializeKnowledgeNoteMarkdown(nextTitle, '');
        await writeRequirementFile(nextAbsolutePath, nextContent);
        const note = await createServerNote(currentProject.id, {
          title: nextTitle,
          content: nextContent,
          filePath: nextAbsolutePath,
          updatedAt: new Date().toISOString(),
          tags: [],
        });
        setSelectedKnowledgeNoteId(note.id);
        setRequirementDraftTitle(nextTitle);
        setRequirementDraftContent('');
        setRequirementSaveMessage(`已创建 ${nextTitle}。`);
      } else if (knowledgePathDialog.relativePath) {
        const previousRelativePath = normalizeRelativePath(knowledgePathDialog.relativePath);
        const previousAbsolutePath = joinDiskPath(projectRootDir, previousRelativePath);
        await renameRequirementFile(previousAbsolutePath, nextAbsolutePath);
        const affectedNotes = collectNotesForKnowledgePaths([previousRelativePath]);
        await Promise.all(
          affectedNotes.map((note) => {
            const noteRelativePath = normalizeRelativePath(
              getRelativePathFromRoot(note.sourceUrl || '', projectRootDir) || note.sourceUrl || ''
            );
            const movedRelativePath =
              noteRelativePath === previousRelativePath
                ? nextRelativePath
                : normalizeRelativePath(noteRelativePath.replace(previousRelativePath, nextRelativePath));
            return updateServerNote(currentProject.id, note.id, {
              title: note.title,
              content: note.bodyMarkdown,
              filePath: joinDiskPath(projectRootDir, movedRelativePath),
              updatedAt: new Date().toISOString(),
              tags: note.tags,
            });
          })
        );
        setRequirementSaveMessage(`已重命名为 ${normalizedName}。`);
      }

      setKnowledgePathDialog(null);
      await refreshKnowledgeFilesystem();
      await loadServerNotes(currentProject.id);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    collectNotesForKnowledgePaths,
    createKnowledgeDirectory,
    createServerNote,
    currentProject,
    knowledgePathDialog,
    loadServerNotes,
    projectRootDir,
    refreshKnowledgeFilesystem,
    renameRequirementFile,
    updateServerNote,
    writeRequirementFile,
  ]);

  const handleOrganizeKnowledge = useCallback(async () => {
    if (!currentProject || !projectRootDir) {
      setRequirementSaveMessage('当前项目还没有绑定本地知识库文件夹。');
      return;
    }

    if (!canUseProjectFilesystem) {
      setRequirementSaveMessage('当前运行在浏览器开发环境，暂不支持刷新本地系统索引。');
      return;
    }

    setRequirementSaveMessage('正在刷新系统索引...');

    try {
      const ensuredIndex = await ensureProjectSystemIndex({
        projectId: currentProject.id,
        projectName: currentProject.name,
        vaultPath: projectRootDir,
        knowledgeRetrievalMethod: currentProject.knowledgeRetrievalMethod,
        requirementDocs: projectedRequirementDocs,
        generatedFiles,
      });
      await refreshKnowledgeFilesystem();
      setRequirementSaveMessage(
        ensuredIndex.refreshed
          ? `系统索引已刷新：${ensuredIndex.index.manifest.sourceCount} 个来源，${ensuredIndex.index.manifest.chunkCount} 个索引块。`
          : `系统索引已是最新状态：${ensuredIndex.index.manifest.sourceCount} 个来源，${ensuredIndex.index.manifest.chunkCount} 个索引块。`
      );
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [canUseProjectFilesystem, currentProject, generatedFiles, projectRootDir, projectedRequirementDocs, refreshKnowledgeFilesystem]);

  const handleKnowledgeRetrievalMethodChange = useCallback(
    (knowledgeRetrievalMethod: 'm-flow' | 'llmwiki' | 'rag') => {
      updateProject({ knowledgeRetrievalMethod });
      setRequirementSaveMessage(`默认检索方式已切换为 ${knowledgeRetrievalMethod}。`);
    },
    [updateProject]
  );

  useEffect(() => {
    if (!currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    let isMounted = true;

    const syncRequirementDocsFromDisk = async () => {
      try {
        await refreshKnowledgeFilesystem();
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void syncRequirementDocsFromDisk();

    return () => {
      isMounted = false;
    };
  }, [currentProject, projectRootDir, refreshKnowledgeFilesystem]);

  useEffect(() => {
    if (designPages.length === 0) {
      setManualPageId(null);
      clearCanvas();
      return;
    }

    setManualPageId((current) =>
      current && designPages.some((page) => page.id === current) ? current : designPages[0].id
    );
  }, [clearCanvas, designPages]);

  useEffect(() => {
    if (!preferredPageId || !designPages.some((page) => page.id === preferredPageId)) {
      return;
    }

    setManualPageId((current) => (current === preferredPageId ? current : preferredPageId));
  }, [designPages, preferredPageId]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProject || !selectedPage) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    const snapshot = JSON.stringify({
      id: selectedPage.id,
      name: selectedPage.name,
      description: selectedPage.description,
      route: selectedPage.metadata.route,
      goal: selectedPage.metadata.goal,
      frame: selectedPageWireframe?.frame || selectedPageFrame,
      elements: selectedPageWireframe?.elements || [],
    });

    if (snapshot === lastPersistedSketchSnapshotRef.current) {
      return;
    }

    lastPersistedSketchSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      void writeSketchPageFile(currentProject.id, selectedPage, selectedPageWireframe, currentProject.appType).catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [canUseProjectFilesystem, currentProject, selectedPage, selectedPageFrame, selectedPageWireframe]);

  useEffect(() => {
    if (!selectedPage) {
      selectFeature(null);
      return;
    }

    const firstFeature = selectedPage.featureIds.map((id) => featureMap.get(id)).find(Boolean) || null;
    selectFeature(firstFeature?.id || null);
    if (firstFeature) {
      onFeatureSelect?.(firstFeature);
    }
  }, [featureMap, onFeatureSelect, selectFeature, selectedPage]);

  const handleOpenKnowledgeAttachment = useCallback(async (attachmentPath: string) => {
    try {
      await invoke('open_path_in_shell', { path: attachmentPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleDeleteKnowledgeNote = useCallback(() => {
    if (!currentProject || !selectedServerNote) {
      return;
    }

    setPendingDeleteRequest({
      type: 'knowledge-note',
      id: selectedServerNote.id,
      title: selectedServerNote.title,
      sourceUrl: selectedServerNote.sourceUrl || null,
    });
  }, [currentProject, selectedServerNote]);

  const handleCreateKnowledgeNote = useCallback(async () => {
    handleCreateKnowledgeNoteAtPath(null);
  }, [handleCreateKnowledgeNoteAtPath]);

  const handleSaveKnowledgeNote = useCallback(async () => {
    if (!selectedServerNote || !currentProject) {
      return;
    }

    const nextTitle = normalizeKnowledgeNoteTitle(requirementDraftTitle);
    const nextContent = serializeKnowledgeNoteMarkdown(nextTitle, requirementDraftContent);
    const currentFilePath = selectedServerNote.sourceUrl || '';
    const currentRelativePath = getRelativePathWithinKnowledgeRoots(
      currentFilePath,
      projectRootDir,
      currentProject.vaultPath || null
    );
    const currentDirectory =
      canPersistRequirementToDisk && projectRootDir
        ? joinDiskPath(projectRootDir, getRelativeDirectory(currentRelativePath))
        : currentFilePath
          ? getDirectoryPath(currentFilePath)
          : '';
    const nextFilePath =
      canPersistRequirementToDisk && projectRootDir && currentDirectory
        ? joinDiskPath(currentDirectory, normalizeRequirementFilename(nextTitle))
        : currentFilePath;
    const nextRelativePath = normalizeRelativePath(
      (nextFilePath && projectRootDir && getRelativePathFromRoot(nextFilePath, projectRootDir)) || nextTitle
    );

    try {
      setIsSavingRequirement(true);

      const nextOverrides = { ...knowledgeGroupOverrides };
      const overrideGroup = nextOverrides[currentRelativePath];
      if (currentRelativePath && currentRelativePath !== nextRelativePath) {
        delete nextOverrides[currentRelativePath];
      }
      if (overrideGroup) {
        nextOverrides[nextRelativePath] = overrideGroup;
      }

      setKnowledgeGroupOverrides(nextOverrides);
      writeKnowledgeGroupOverrides(currentProject?.id || null, nextOverrides);

      await updateServerNote(currentProject.id, selectedServerNote.id, {
        title: nextTitle,
        content: nextContent,
        filePath: nextFilePath || currentFilePath || '',
        updatedAt: new Date().toISOString(),
        tags: selectedServerNote.tags,
      });

      const shouldSyncMarkdownMirror = Boolean(canPersistRequirementToDisk && nextFilePath);
      if (shouldSyncMarkdownMirror && currentFilePath && currentFilePath !== nextFilePath) {
        await writeRequirementFile(currentFilePath, nextContent);
        await renameRequirementFile(currentFilePath, nextFilePath);
      } else if (shouldSyncMarkdownMirror) {
        await writeRequirementFile(nextFilePath, nextContent);
      }

      if (shouldSyncMarkdownMirror) {
        await refreshKnowledgeFilesystem();
      }

      setSelectedKnowledgeNoteId(selectedServerNote.id);
      setRequirementDraftTitle(nextTitle);
      setRequirementSaveMessage(
        shouldSyncMarkdownMirror
          ? `已保存到知识库，并同步 Markdown 镜像：${nextFilePath}`
          : '已保存到知识库。'
      );
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingRequirement(false);
    }
  }, [
    canPersistRequirementToDisk,
    currentProject,
    knowledgeGroupOverrides,
    projectRootDir,
    refreshKnowledgeFilesystem,
    renameRequirementFile,
    requirementDraftContent,
    requirementDraftTitle,
    selectedServerNote,
    updateServerNote,
    writeRequirementFile,
  ]);

  useEffect(() => {
    if (!selectedServerNote) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSaveRequirement) {
          void handleSaveKnowledgeNote();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSaveRequirement, handleSaveKnowledgeNote, selectedServerNote]);

  const handleCreateSketchPage = useCallback(async () => {
    if (!currentProject) {
      return null;
    }

    const nextIndex = designPages.length + 1;
    const nextName = `新页面 ${nextIndex}`;
    const nextPage: PageStructureNode = {
      id: `page-${Date.now()}`,
      name: nextName,
      kind: 'page',
      description: '由 sketch/pages 目录直接维护的页面。',
      featureIds: [],
      metadata: {
        route: `/pages/${nextIndex}`,
        title: nextName,
        goal: `继续完善 ${nextName} 的页面结构与模块布局`,
        template: 'custom',
        ownerRole: 'UI设计',
        notes: '',
        status: 'draft',
      },
      children: [],
    };

    const relativePath = await writeSketchPageFile(currentProject.id, nextPage, null, currentProject.appType);
    await refreshKnowledgeFilesystem();
    return relativePath;
  }, [currentProject, designPages.length, refreshKnowledgeFilesystem]);

  const handleAddPageAfter = useCallback(async (_pageId: string) => {
    if (!canUseProjectFilesystem) {
      const nextPage = addSiblingPage(_pageId);
      if (nextPage) {
        setManualPageId(nextPage.id);
        setSidebarTab('page');
      }
      return;
    }

    const nextPageId = await handleCreateSketchPage();
    if (nextPageId) {
      setManualPageId(nextPageId);
      setSidebarTab('page');
    }
  }, [addSiblingPage, canUseProjectFilesystem, handleCreateSketchPage]);

  const handleAddRootPage = useCallback(async () => {
    if (!canUseProjectFilesystem) {
      const nextPage = addRootPage();
      if (nextPage) {
        setManualPageId(nextPage.id);
        setSidebarTab('page');
      }
      return;
    }

    const nextPageId = await handleCreateSketchPage();
    if (nextPageId) {
      setManualPageId(nextPageId);
      setSidebarTab('page');
    }
  }, [addRootPage, canUseProjectFilesystem, handleCreateSketchPage]);

  const handleAddPageFromSidebar = useCallback(() => {
    const referencePageId = selectedPage?.id || designPages[designPages.length - 1]?.id;
    if (!referencePageId) {
      handleAddRootPage();
      return;
    }

    handleAddPageAfter(referencePageId);
  }, [designPages, handleAddPageAfter, handleAddRootPage, selectedPage]);

  const handleAddChildPageById = useCallback(async (_pageId: string) => {
    if (!canUseProjectFilesystem) {
      const nextPage = addChildPage(_pageId);
      if (nextPage) {
        setManualPageId(nextPage.id);
      }
      return;
    }

    const nextPageId = await handleCreateSketchPage();
    if (nextPageId) {
      setManualPageId(nextPageId);
    }
  }, [addChildPage, canUseProjectFilesystem, handleCreateSketchPage]);

  const handleAddChildPage = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    handleAddChildPageById(selectedPage.id);
  }, [handleAddChildPageById, selectedPage]);

  const handleDeletePageById = useCallback((pageId: string) => {
    const page = designPages.find((item) => item.id === pageId);
    if (!page || !currentProject) {
      return;
    }

    setPendingDeleteRequest({
      type: 'page',
      id: pageId,
      title: page.name,
    });
  }, [currentProject, designPages]);

  const handleRequestDeleteModule = useCallback((moduleId: string, moduleTitle: string) => {
    setPendingDeleteRequest({
      type: 'module',
      id: moduleId,
      title: moduleTitle,
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteRequest || !currentProject) {
      setPendingDeleteRequest(null);
      return;
    }

    const request = pendingDeleteRequest;
    setPendingDeleteRequest(null);

    if (request.type === 'knowledge-note') {
      await deleteServerNote(currentProject.id, request.id);
      setSelectedKnowledgeNoteId(null);
      setOpenKnowledgeTabIds((current) => current.filter((id) => id !== request.id));
      setRequirementSaveMessage(
        request.sourceUrl
          ? '笔记已从知识库中删除，Markdown 镜像文件会保留。'
          : '笔记已从知识库中删除。'
      );
      return;
    }

    if (request.type === 'knowledge-tree-paths') {
      if (!projectRootDir) {
        setRequirementSaveMessage('当前项目知识目录还没有准备好。');
        return;
      }
      try {
        const affectedNotes = collectNotesForKnowledgePaths(request.paths);
        await Promise.all(
          request.paths
            .map((relativePath) => joinDiskPath(projectRootDir, relativePath))
            .map((absolutePath) => removeKnowledgePath(absolutePath))
        );
        await Promise.all(
          affectedNotes.map((note) => deleteServerNote(currentProject.id, note.id))
        );
        if (selectedServerNote && affectedNotes.some((note) => note.id === selectedServerNote.id)) {
          setSelectedKnowledgeNoteId(null);
        }
        setOpenKnowledgeTabIds((current) =>
          current.filter((id) => !affectedNotes.some((note) => note.id === id))
        );
        await refreshKnowledgeFilesystem();
        await loadServerNotes(currentProject.id);
        setRequirementSaveMessage(
          request.paths.length > 1
            ? `已批量删除 ${request.paths.length} 个项目。`
            : `已删除 ${request.title}。`
        );
      } catch (error) {
        setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (request.type === 'module') {
      deleteElement(request.id);
      return;
    }

    if (!canUseProjectFilesystem) {
      deletePageStructureNode(request.id);
      if (selectedPage?.id === request.id) {
        setManualPageId(null);
        loadFromCode([]);
      }
      return;
    }

    try {
      await deleteSketchPageFile(currentProject.id, request.id);
      await refreshKnowledgeFilesystem();
      if (selectedPage?.id === request.id) {
        setManualPageId(null);
        loadFromCode([]);
      }
    } catch {
      return;
    }
  }, [
    canUseProjectFilesystem,
    currentProject,
    deleteElement,
    deletePageStructureNode,
    deleteServerNote,
    collectNotesForKnowledgePaths,
    loadFromCode,
    loadServerNotes,
    pendingDeleteRequest,
    projectRootDir,
    refreshKnowledgeFilesystem,
    removeKnowledgePath,
    selectedPage?.id,
    selectedServerNote,
  ]);

  const handleAddModule = useCallback(() => {
    const currentElements = usePreviewStore.getState().elements;
    const moduleCount = currentElements.length;
    const offset = moduleCount * 28;
    const nextModule = createWireframeModule(
      {
        name: `模块 ${moduleCount + 1}`,
        x: isMobileAppType(effectiveAppType) ? 40 : 72 + (moduleCount % 2) * 360,
        y: isMobileAppType(effectiveAppType) ? 56 + offset : 84 + Math.floor(moduleCount / 2) * 132,
        content: '',
      },
      effectiveAppType
    );

    usePreviewStore.getState().addMultipleElements([nextModule]);
    selectElement(nextModule.id);
  }, [effectiveAppType, selectElement]);

  const handleGenerateSampleWireframe = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    const sampleElements = buildSampleWireframe(
      selectedPage.name,
      linkedFeatureName,
      isMobileAppType(effectiveAppType)
    );
    loadFromCode(sampleElements);
  }, [effectiveAppType, linkedFeatureName, loadFromCode, selectedPage]);

  const handleClearCurrentWireframe = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    loadFromCode([]);
  }, [loadFromCode, selectedPage]);

  const openKnowledgeNote = useCallback((noteId: string) => {
    setSelectedKnowledgeNoteId(noteId);
    setSidebarTab('knowledge');
  }, [setSidebarTab]);

  const renderRequirementMain = () => {
    if (!currentProject) {
      return null;
    }

    return (
      <KnowledgeNoteWorkspace
        notes={serverNotes}
        filteredNotes={filteredServerNotes}
        diskItems={knowledgeDiskItems}
        selectedNote={selectedServerNote}
        activeFilter={knowledgeFilter}
        projectRootPath={projectRootDir}
        titleValue={requirementDraftTitle}
        mirrorSourcePath={selectedServerNote?.sourceUrl || null}
        editorValue={selectedServerNote ? requirementDraftContent : ''}
        editable={Boolean(selectedServerNote)}
        isSaving={isSavingRequirement}
        saveMessage={requirementSaveMessage || ''}
        canSave={canSaveRequirement}
        knowledgeRetrievalMethod={currentProject.knowledgeRetrievalMethod}
        searchValue={knowledgeSearch}
        isSearching={isKnowledgeSearching}
        isSyncing={isKnowledgeSyncing}
        error={knowledgeSidecarError}
        onSearchChange={setKnowledgeSearch}
        onSelectNote={openKnowledgeNote}
        onTitleChange={setRequirementDraftTitle}
        onEditorChange={selectedServerNote ? setRequirementDraftContent : () => undefined}
        onSave={handleSaveKnowledgeNote}
        onDelete={handleDeleteKnowledgeNote}
        onOrganizeKnowledge={handleOrganizeKnowledge}
        onCreateNote={() => {
          void handleCreateKnowledgeNote();
        }}
        onCreateNoteAtPath={handleCreateKnowledgeNoteAtPath}
        onCreateFolderAtPath={handleCreateKnowledgeFolderAtPath}
        onRenameTreePath={handleRenameKnowledgeTreePath}
        onDeleteTreePaths={handleDeleteKnowledgeTreePaths}
        onRefreshFilesystem={handleRefreshKnowledgeFilesystem}
        onKnowledgeRetrievalMethodChange={handleKnowledgeRetrievalMethodChange}
        onFilterChange={setKnowledgeFilter}
        onOpenAttachment={(attachmentPath) => {
          void handleOpenKnowledgeAttachment(attachmentPath);
        }}
      />
    );
  };

  const renderPageLibraryMain = () => (
    <PageWorkspace
      content={
        <div className="pm-page-hub-grid">
          <section className="pm-card pm-page-structure-panel">
            <div className="pm-card-header">
              <div>
                <h3>页面结构</h3>
              </div>
              <div className="pm-inline-actions">
                <input
                  className="product-input"
                  type="search"
                  value={pageSearch}
                  onChange={(event) => setPageSearch(event.target.value)}
                  placeholder="搜索页面"
                />
                <button className="doc-action-btn" type="button" onClick={handleAddPageFromSidebar}>
                  + 页面
                </button>
              </div>
            </div>
            {designPages.length > 0 ? (
              filteredDesignPages.length > 0 ? (
                <div className="pm-page-tree">
                  {filteredPageStructure.map((node) => (
                    <PageTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedPageId={selectedPage?.id || null}
                      onSelect={setManualPageId}
                      onAddPage={handleAddChildPageById}
                      onDeletePage={handleDeletePageById}
                    />
                  ))}
                </div>
              ) : (
                <div className="pm-page-tree-empty">没有匹配的页面</div>
              )
            ) : (
              <div className="pm-page-tree-empty">还没有页面，请先创建</div>
            )}
          </section>

          <div className="pm-page-hub-canvas">
            <div className="pm-page-workspace-frame">
              {renderDesignMain()}
              <WireframeSyncBridge selectedPage={selectedPage} />
            </div>
          </div>
        </div>
      }
    />
  );

  const renderDesignMain = () => {
    if (!selectedPage) {
      return (
        <section className="pm-card pm-empty-panel">
          <div className="pm-card-header">
            <div>
              <h3>页面草图</h3>
            </div>
          </div>
          <div className="empty-state">还没有页面草图。</div>
        </section>
      );
    }

    return (
      <div className="pm-page-workspace">
        <section className="pm-card pm-wireframe-main pm-wireframe-main-canvas">
          <div className="pm-card-header pm-wireframe-section-header pm-wireframe-canvas-header">
            <div>
              <h3>页面画布</h3>
            </div>
            <div className="pm-inline-actions pm-wireframe-canvas-actions">
              <button
                className={`doc-action-btn secondary ${canvasPreset.frameType === 'browser' ? 'active' : ''}`}
                type="button"
                onClick={() => handleApplyFrameValue('1280x800')}
              >
                网页端
              </button>
              <button
                className={`doc-action-btn secondary ${canvasPreset.frameType === 'mobile' ? 'active' : ''}`}
                type="button"
                onClick={() => handleApplyFrameValue('390x844')}
              >
                手机端
              </button>
              <button className="doc-action-btn" type="button" onClick={handleAddModule}>
                添加模块
              </button>
            </div>
          </div>
          <div className="pm-canvas-shell">
            <div className="pm-canvas-frame-editor">
              <button className="doc-action-btn secondary" type="button" onClick={handleToggleFrameEditor}>
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
                      onChange={(event) => setFrameEditorDraft(event.target.value)}
                      placeholder="例如 1440x900"
                    />
                  </label>
                  <div className="pm-inline-actions pm-canvas-frame-editor-actions">
                    <button className="doc-action-btn" type="button" onClick={() => handleApplyFrameValue(frameEditorDraft)}>
                      应用
                    </button>
                    <button className="doc-action-btn secondary" type="button" onClick={() => setIsFrameEditorOpen(false)}>
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
            />
          </div>
        </section>

        <WireframeSidebar
          selectedPage={selectedPage}
          appType={effectiveAppType}
          featureTree={tree}
          draggingModuleId={draggingModuleId}
          setDraggingModuleId={setDraggingModuleId}
          linkedFeatureName={linkedFeatureName}
          canvasLabel={canvasPreset.label}
          onAddModule={handleAddModule}
          onAddChildPage={handleAddChildPage}
          onGenerateSampleWireframe={handleGenerateSampleWireframe}
          onClearCurrentWireframe={handleClearCurrentWireframe}
          onRequestDeleteModule={handleRequestDeleteModule}
        />
      </div>
    );
  };

  const deleteDialogDescription = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? `确定删除笔记“${pendingDeleteRequest.title}”吗？`
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.paths.length > 1
          ? `确定批量删除这 ${pendingDeleteRequest.paths.length} 项吗？`
          : `确定删除“${pendingDeleteRequest.title}”吗？`
      : pendingDeleteRequest.type === 'page'
        ? `确定删除页面“${pendingDeleteRequest.title}”吗？`
        : `确定删除模块“${pendingDeleteRequest.title}”吗？`
    : '';
  const deleteDialogBody = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? '这只会删除知识库里的笔记；Markdown 镜像文件会保留。'
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.containsFolders
          ? '会递归删除所选文件夹及其中的文件，同时移除关联的知识笔记。这个操作不可撤销。'
          : '会删除所选文件，并移除关联的知识笔记。这个操作不可撤销。'
      : pendingDeleteRequest.type === 'page'
        ? '该页面下的所有子页面都会一起删除。'
        : '该模块会从当前页面草图中移除。'
    : '';
  const deleteDialogActionLabel = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? '删除笔记'
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.paths.length > 1
          ? '批量删除'
          : '删除文件'
      : pendingDeleteRequest.type === 'page'
        ? '删除页面'
        : '删除模块'
    : '删除';
  const knowledgePathDialogTitle = knowledgePathDialog
    ? knowledgePathDialog.mode === 'create-note'
      ? '新建笔记'
      : knowledgePathDialog.mode === 'create-folder'
        ? '新建文件夹'
        : knowledgePathDialog.isFolder
          ? '重命名文件夹'
          : '重命名文件'
    : '';
  const knowledgePathDialogDescription = knowledgePathDialog
    ? knowledgePathDialog.mode === 'rename-path'
      ? '请输入新的名称。'
      : knowledgePathDialog.targetDirectory
        ? `目标目录：${knowledgePathDialog.targetDirectory}`
        : '将在知识库根目录创建。'
    : '';
  const knowledgePathDialogActionLabel = knowledgePathDialog
    ? knowledgePathDialog.mode === 'rename-path'
      ? '确认重命名'
      : knowledgePathDialog.mode === 'create-folder'
        ? '创建文件夹'
        : '创建笔记'
    : '确认';

  return (
    <>
      <div className="product-workbench-shell" style={layoutStyle}>
        {sidebarTab === 'knowledge' && renderRequirementMain()}
        {sidebarTab === 'page' && renderPageLibraryMain()}
      </div>
      <MacDialog
        open={Boolean(knowledgePathDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setKnowledgePathDialog(null);
          }
        }}
        title={knowledgePathDialogTitle}
        description={knowledgePathDialogDescription}
        footer={
          <>
            <button className="mac-button mac-button-secondary" type="button" onClick={() => setKnowledgePathDialog(null)}>
              取消
            </button>
            <button className="mac-button" type="button" onClick={() => void handleConfirmKnowledgePathDialog()}>
              {knowledgePathDialogActionLabel}
            </button>
          </>
        }
      >
        <input
          className="product-input"
          type="text"
          value={knowledgePathDialog?.inputValue || ''}
          onChange={(event) =>
            setKnowledgePathDialog((current) => (current ? { ...current, inputValue: event.target.value } : current))
          }
          placeholder={knowledgePathDialog?.isFolder ? '输入文件夹名称' : '输入文件名称'}
          autoFocus
        />
      </MacDialog>
      <MacDialog
        open={Boolean(pendingDeleteRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteRequest(null);
          }
        }}
        title="确认删除"
        description={deleteDialogDescription}
        footer={
          <>
            <button className="mac-button mac-button-secondary" type="button" onClick={() => setPendingDeleteRequest(null)}>
              取消
            </button>
            <button className="mac-button mac-button-danger" type="button" onClick={() => void handleConfirmDelete()}>
              {deleteDialogActionLabel}
            </button>
          </>
        }
      >
        <p>{deleteDialogBody}</p>
      </MacDialog>
    </>
  );
};

