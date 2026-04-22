import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Canvas } from '../canvas/Canvas';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { AppType, CanvasElement, FeatureNode, FeatureTree, PageStructureNode } from '../../types';
import { featureTreeToMarkdown } from '../../utils/featureTreeToMarkdown';
import { useShallow } from 'zustand/react/shallow';
import {
  buildPageWireframeMarkdown,
  createWireframeModule,
  findMarkdownModuleByOffset,
  findMarkdownModuleMatch,
  getCanvasPreset,
  isMobileAppType,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  parsePageWireframeMarkdown,
  snapToGrid,
  toWireframeModuleDrafts,
  WireframeModuleDraft,
} from '../../utils/wireframe';

type SidebarTab = 'requirement' | 'page';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const collectFeatureNodes = (nodes: FeatureNode[]): FeatureNode[] =>
  nodes.flatMap((node) => [node, ...collectFeatureNodes(node.children)]);

const getPagePath = (nodes: PageStructureNode[], targetId: string, path: PageStructureNode[] = []): PageStructureNode[] => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [...path, node];
    }

    const nextPath = getPagePath(node.children, targetId, [...path, node]);
    if (nextPath.length > 0) {
      return nextPath;
    }
  }

  return [];
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
}

const PageTreeNode = memo<PageTreeNodeProps>(({ node, depth, selectedPageId, onSelect }) => {
  const childPages = collectDesignPages(node.children);
  const isPage = node.kind === 'page';
  const isSelected = selectedPageId === node.id;

  return (
    <div className="pm-page-tree-group">
      <div className="pm-page-tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
        {isPage ? (
          <button
            className={`pm-page-tree-node ${isSelected ? 'active' : ''}`}
            onClick={() => onSelect(node.id)}
            type="button"
          >
            <strong>{node.name}</strong>
            <span>{node.metadata.route || node.kind}</span>
          </button>
        ) : (
          <div className="pm-page-tree-label">
            <strong>{node.name}</strong>
            <span>
              {node.kind === 'flow' ? '页面组' : '模块'}{childPages.length > 0 ? ` · ${childPages.length} 个页面` : ''}
            </span>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="pm-page-tree-children">
          {node.children.map((child) => (
            <PageTreeNode key={child.id} node={child} depth={depth + 1} selectedPageId={selectedPageId} onSelect={onSelect} />
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
  pagePathText: string;
  linkedFeatureName: string;
  childPageCount: number;
  canvasLabel: string;
  onAddModule: (position?: { x: number; y: number }) => void;
  onGenerateSampleWireframe: () => void;
  onClearCurrentWireframe: () => void;
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
}

const WireframeModuleCard = memo<WireframeModuleCardProps>(({ moduleId, draggingModuleId, setDraggingModuleId, appType }) => {
  const element = usePreviewStore((state) => state.elements.find((item) => item.id === moduleId) || null);
  const isActive = usePreviewStore((state) => state.selectedElementId === moduleId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const deleteElement = usePreviewStore((state) => state.deleteElement);
  const reorderElements = usePreviewStore((state) => state.reorderElements);
  const updateElement = usePreviewStore((state) => state.updateElement);
  const module = useMemo(() => (element ? getModuleDraft(element) : null), [element]);
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

    setNumericDrafts({
      x: String(module.x),
      y: String(module.y),
      width: String(module.width ?? MIN_MODULE_WIDTH),
      height: String(module.height ?? MIN_MODULE_HEIGHT),
    });
  }, [module]);

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
            ≡
          </button>
          <strong>{module.name}</strong>
        </div>
        <button
          className="pm-link-btn"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteElement(moduleId);
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
          <input
            className="product-input"
            value={module.name}
            onChange={(event) => handleModuleFieldChange({ name: event.target.value })}
            placeholder="模块名称"
          />
          <div className="pm-form-grid">
            <input
              className="product-input"
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
            <input
              className="product-input"
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
            <input
              className="product-input"
              type="number"
              value={numericDrafts.width}
              onChange={(event) => handleNumericDraftChange('width', event.target.value)}
              onBlur={() => handleNumericFieldCommit('width')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              placeholder="宽"
            />
            <input
              className="product-input"
              type="number"
              value={numericDrafts.height}
              onChange={(event) => handleNumericDraftChange('height', event.target.value)}
              onBlur={() => handleNumericFieldCommit('height')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              placeholder="高"
            />
          </div>
          <textarea
            className="product-textarea compact"
            value={module.content}
            onChange={(event) => handleModuleFieldChange({ content: event.target.value })}
            placeholder="模块内容说明"
          />
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
  pagePathText,
  linkedFeatureName,
  childPageCount,
  canvasLabel,
  onAddModule,
  onGenerateSampleWireframe,
  onClearCurrentWireframe,
}) => {
  const [isMarkdownEditorOpen, setIsMarkdownEditorOpen] = useState(false);
  const [isArtifactsPanelOpen, setIsArtifactsPanelOpen] = useState(false);
  const [isArtifactsRefreshing, setIsArtifactsRefreshing] = useState(false);
  const [wireframesPreview, setWireframesPreview] = useState('');
  const [pageMarkdownDraft, setPageMarkdownDraft] = useState('');
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const moduleListRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const elements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const generateDeliveryArtifacts = useProjectStore((state) => state.generateDeliveryArtifacts);
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
    setIsArtifactsPanelOpen(false);
    setIsArtifactsRefreshing(false);
    setPageMarkdownDraft('');
    setWireframesPreview('');
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
    lastSyncedMarkdownRef.current = pageMarkdownDraft;
    loadFromCode(parsedElements);
  }, [appType, loadFromCode, pageMarkdownDraft]);

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

  const handleRefreshArtifacts = useCallback(() => {
    setIsArtifactsRefreshing(true);

    window.requestAnimationFrame(() => {
      generateDeliveryArtifacts(featureTree);
      setWireframesPreview(useProjectStore.getState().wireframesMarkdown || '# 线框说明\n\n暂无页面线框。');
      setIsArtifactsPanelOpen(true);
      setIsArtifactsRefreshing(false);
    });
  }, [featureTree, generateDeliveryArtifacts]);

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
              <button className="doc-action-btn secondary" type="button" onClick={onGenerateSampleWireframe}>
                示例草图
              </button>
              <button className="doc-action-btn secondary" type="button" onClick={onClearCurrentWireframe}>
                清空
              </button>
            </div>
          </div>

          <div className="pm-wireframe-meta-strip">
            <span>{pagePathText}</span>
            <span>{linkedFeatureName}</span>
            <span>{moduleDrafts.length} 个模块</span>
            <span>{childPageCount > 0 ? `${childPageCount} 个下级页面` : '无下级页面'}</span>
          </div>

          <span>右键画布空白处可在当前位置快速添加模块。</span>
        </div>

        <div className="pm-card-header pm-wireframe-section-header">
          <div>
            <h3>模块清单</h3>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={handleToggleMarkdownEditor}>
              {isMarkdownEditorOpen ? '收起 Markdown' : '编辑 Markdown'}
            </button>
            <button className="doc-action-btn secondary" type="button" onClick={handleRefreshArtifacts}>
              {isArtifactsRefreshing ? '生成中' : '生成线稿说明'}
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
            <strong>当前页面 Markdown</strong>
            <span>需要时再展开编辑，避免实时生成拖慢草稿图。</span>
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
                恢复当前页面
              </button>
            </div>
          </div>
        )}

        {isArtifactsPanelOpen && (
          <div className="pm-context-card">
            <strong>完整线稿文件</strong>
            <span>按需生成，避免拖拽和输入时实时刷新整份文档。</span>
            <pre className="pm-markdown-preview pm-markdown-preview-compact">
              {wireframesPreview || '# 线框说明\n\n暂无页面线框。'}
            </pre>
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
    hydratedPageIdRef.current = selectedPage?.id || null;
    lastWireframeSnapshotRef.current = snapshot;
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
}

export const ProductWorkbench = ({ onFeatureSelect }: ProductWorkbenchProps) => {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('requirement');
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [manualPageId, setManualPageId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    currentProject,
    rawRequirementInput,
    featuresMarkdown,
    requirementDocs,
    pageStructure,
    setRawRequirementInput,
    setFeaturesMarkdown,
    updateRequirementDoc,
    addRequirementDoc,
    ingestRequirementDoc,
    generateProductArtifactsFromRequirements,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    rawRequirementInput: state.rawRequirementInput,
    featuresMarkdown: state.featuresMarkdown,
    requirementDocs: state.requirementDocs,
    pageStructure: state.pageStructure,
    setRawRequirementInput: state.setRawRequirementInput,
    setFeaturesMarkdown: state.setFeaturesMarkdown,
    updateRequirementDoc: state.updateRequirementDoc,
    addRequirementDoc: state.addRequirementDoc,
    ingestRequirementDoc: state.ingestRequirementDoc,
    generateProductArtifactsFromRequirements: state.generateProductArtifactsFromRequirements,
  })));

  const tree = useFeatureTreeStore((state) => state.tree);
  const setTree = useFeatureTreeStore((state) => state.setTree);
  const selectFeature = useFeatureTreeStore((state) => state.selectFeature);
  const setCanvasSize = usePreviewStore((state) => state.setCanvasSize);
  const clearCanvas = usePreviewStore((state) => state.clearCanvas);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const selectElement = usePreviewStore((state) => state.selectElement);

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedRequirement = requirementDocs.find((doc) => doc.id === selectedRequirementId) || requirementDocs[0] || null;
  const selectedPage = designPages.find((page) => page.id === manualPageId) || designPages[0] || null;
  const canvasPreset = useMemo(() => getCanvasPreset(currentProject?.appType), [currentProject?.appType]);
  const selectedPagePath = selectedPage ? getPagePath(pageStructure, selectedPage.id) : [];
  const selectedPageChildren = useMemo(() => collectDesignPages(selectedPage?.children || []), [selectedPage]);
  const featureMap = useMemo(() => {
    const nodes = tree ? collectFeatureNodes(tree.children) : [];
    return new Map(nodes.map((node) => [node.id, node]));
  }, [tree]);
  const linkedFeatures = selectedPage?.featureIds.map((id) => featureMap.get(id)).filter(Boolean) as FeatureNode[] | undefined;
  const linkedFeatureName = linkedFeatures?.map((feature) => feature.name).join(' / ') || '核心页面';

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
    if (requirementDocs.length === 0) {
      setSelectedRequirementId(null);
      return;
    }

    setSelectedRequirementId((current) =>
      current && requirementDocs.some((doc) => doc.id === current) ? current : requirementDocs[0].id
    );
  }, [requirementDocs]);

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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      const content = await file.text();
      ingestRequirementDoc({
        title: file.name,
        content,
        sourceType: 'upload',
      });
    }
    event.target.value = '';
  };

  const handleGenerateFromRequirements = useCallback(() => {
    const nextTree = generateProductArtifactsFromRequirements();
    if (nextTree) {
      setTree(nextTree);
      setSidebarTab('page');
      if (nextTree.children[0]) {
        selectFeature(nextTree.children[0].id);
        onFeatureSelect?.(nextTree.children[0]);
      }
    }
  }, [generateProductArtifactsFromRequirements, onFeatureSelect, selectFeature, setTree]);

  const handleAddModule = useCallback(() => {
    const currentElements = usePreviewStore.getState().elements;
    const moduleCount = currentElements.length;
    const offset = moduleCount * 28;
    const nextModule = createWireframeModule(
      {
        name: `模块 ${moduleCount + 1}`,
        x: isMobileAppType(currentProject?.appType) ? 40 : 72 + (moduleCount % 2) * 360,
        y: isMobileAppType(currentProject?.appType) ? 56 + offset : 84 + Math.floor(moduleCount / 2) * 132,
        content: '',
      },
      currentProject?.appType
    );

    usePreviewStore.getState().addMultipleElements([nextModule]);
    selectElement(nextModule.id);
  }, [currentProject?.appType, selectElement]);

  const handleAddModuleAtPosition = useCallback((position?: { x: number; y: number }) => {
    if (!position) {
      handleAddModule();
      return;
    }

    const currentElements = usePreviewStore.getState().elements;
    const moduleCount = currentElements.length;
    const nextModule = createWireframeModule(
      {
        name: `模块 ${moduleCount + 1}`,
        x: snapToGrid(position.x),
        y: snapToGrid(position.y),
        content: '',
      },
      currentProject?.appType
    );

    usePreviewStore.getState().addMultipleElements([nextModule]);
    selectElement(nextModule.id);
  }, [currentProject?.appType, handleAddModule, selectElement]);

  const handleGenerateSampleWireframe = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    const sampleElements = buildSampleWireframe(
      selectedPage.name,
      linkedFeatureName,
      isMobileAppType(currentProject?.appType)
    );
    loadFromCode(sampleElements);
  }, [currentProject?.appType, linkedFeatureName, loadFromCode, selectedPage]);

  const handleClearCurrentWireframe = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    loadFromCode([]);
  }, [loadFromCode, selectedPage]);

  const renderRequirementMain = () => (
    <div className="pm-viewer-stack">
      <section className="pm-card">
        <div className="pm-card-header">
          <div>
            <h3>需求输入</h3>
            <span>先把需求、场景和约束补全，再由系统自动整理成页面清单和草图入口。</span>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={handleUploadClick}>
              上传文档
            </button>
            <button className="doc-action-btn secondary" type="button" onClick={addRequirementDoc}>
              + 新需求
            </button>
            <button className="doc-action-btn" type="button" onClick={handleGenerateFromRequirements}>
              生成页面清单
            </button>
          </div>
        </div>
        <textarea
          className="product-textarea"
          value={rawRequirementInput}
          onChange={(event) => setRawRequirementInput(event.target.value)}
          placeholder="描述首页、列表页、详情页、关键按钮、页面之间的跳转关系，以及你希望 AI 补出来的页面结构。"
        />
      </section>

      {selectedRequirement && (
        <section className="pm-card">
          <div className="pm-card-header">
            <div>
              <h3>{selectedRequirement.title}</h3>
              <span>{selectedRequirement.sourceType || 'manual'} · {selectedRequirement.status}</span>
            </div>
          </div>
          <div className="pm-form-grid">
            <input
              className="product-input"
              value={selectedRequirement.title}
              onChange={(event) => updateRequirementDoc(selectedRequirement.id, { title: event.target.value })}
              placeholder="需求标题"
            />
            <input
              className="product-input"
              value={selectedRequirement.summary}
              onChange={(event) => updateRequirementDoc(selectedRequirement.id, { summary: event.target.value })}
              placeholder="需求摘要"
            />
          </div>
          <textarea
            className="product-textarea compact"
            value={selectedRequirement.content}
            onChange={(event) => updateRequirementDoc(selectedRequirement.id, { content: event.target.value })}
            placeholder="需求详细内容"
          />
        </section>
      )}

      <input
        ref={fileInputRef}
        className="product-hidden-input"
        type="file"
        accept=".txt,.md,.markdown,.json"
        multiple
        onChange={handleFileChange}
      />
    </div>
  );

  const renderPageMain = () => {
    if (!selectedPage) {
      return (
        <section className="pm-card pm-empty-panel">
          <div className="pm-card-header">
            <div>
              <h3>页面草图</h3>
              <span>先从需求生成页面清单，或者在已有页面结构里选择一个页面。</span>
            </div>
          </div>
          <div className="empty-state">当前还没有可展示的页面草图。</div>
        </section>
      );
    }

    return (
      <div className="pm-page-workspace">
        <section className="pm-card pm-wireframe-main">
          <div className="pm-canvas-shell">
            <Canvas
              key={selectedPage.id}
              width={canvasPreset.width}
              height={canvasPreset.height}
              frameType={canvasPreset.frameType}
              frameLabel={canvasPreset.label}
              onAddModuleAt={handleAddModuleAtPosition}
            />
          </div>
        </section>

        <WireframeSidebar
          selectedPage={selectedPage}
          appType={currentProject?.appType}
          featureTree={tree}
          draggingModuleId={draggingModuleId}
          setDraggingModuleId={setDraggingModuleId}
          pagePathText={selectedPagePath.map((item) => item.name).join(' / ') || selectedPage.name}
          linkedFeatureName={linkedFeatureName}
          childPageCount={selectedPageChildren.length}
          canvasLabel={canvasPreset.label}
          onAddModule={handleAddModuleAtPosition}
          onGenerateSampleWireframe={handleGenerateSampleWireframe}
          onClearCurrentWireframe={handleClearCurrentWireframe}
        />
      </div>
    );
  };

  return (
    <div className="product-workbench-shell">
      <aside className="pm-left-nav">
        <div className="pm-nav-header">
          <strong>{currentProject?.name || '产品工作台'}</strong>
          <span>{designPages.length} 个页面可继续出草图</span>
        </div>

        <div className="pm-sidebar-tabs">
          <button className={sidebarTab === 'requirement' ? 'active' : ''} onClick={() => setSidebarTab('requirement')} type="button">
            需求
          </button>
          <button className={sidebarTab === 'page' ? 'active' : ''} onClick={() => setSidebarTab('page')} type="button">
            页面
          </button>
        </div>

        {sidebarTab === 'requirement' && (
          <section className="pm-nav-section">
            <div className="pm-nav-title">需求列表</div>
            {requirementDocs.map((doc) => (
              <button
                key={doc.id}
                className={`pm-nav-item ${selectedRequirement?.id === doc.id ? 'active' : ''}`}
                onClick={() => setSelectedRequirementId(doc.id)}
                type="button"
              >
                {doc.title}
              </button>
            ))}
          </section>
        )}

        {sidebarTab === 'page' && (
          <section className="pm-nav-section">
            <div className="pm-nav-title">页面清单</div>
            {pageStructure.length > 0 ? (
              <div className="pm-page-tree">
                {pageStructure.map((node) => (
                  <PageTreeNode key={node.id} node={node} depth={0} selectedPageId={selectedPage?.id || null} onSelect={setManualPageId} />
                ))}
              </div>
            ) : (
              <div className="pm-page-tree-empty">先从需求生成页面清单。</div>
            )}
          </section>
        )}
      </aside>

      <main className="pm-main-viewer">
        {sidebarTab === 'requirement' && renderRequirementMain()}
        {sidebarTab === 'page' && renderPageMain()}
        {sidebarTab === 'page' && <WireframeSyncBridge selectedPage={selectedPage} />}
      </main>
    </div>
  );
};
