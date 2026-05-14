import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import { Canvas } from '../canvas/Canvas';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { AppType, CanvasElement, type FeatureTree, type PageStructureNode } from '../../types';
import { EmptyStateView, NoteSurface, WorkbenchIcon } from '../ui';
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

interface PageTreeNodeProps {
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
  designPages: PageStructureNode[];
  filteredPageStructure: PageStructureNode[];
  filteredDesignPages: PageStructureNode[];
  selectedPage: PageStructureNode | null;
  pageSearch: string;
  onPageSearchChange: (value: string) => void;
  onAddPage: () => void;
  onSelectPage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
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
  featureTree: FeatureTree | null;
  effectiveAppType?: AppType;
  onRequestDeleteModule: (moduleId: string, moduleTitle: string) => void;
}

export const ProductPageWorkspacePane = ({
  designPages,
  filteredPageStructure,
  filteredDesignPages,
  selectedPage,
  pageSearch,
  onPageSearchChange,
  onAddPage,
  onSelectPage,
  onDeletePage,
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
  featureTree,
  effectiveAppType,
  onRequestDeleteModule,
}: ProductPageWorkspacePaneProps) => {
  const elements = usePreviewStore((state) => state.elements);

  if (!selectedPage) {
    return (
      <PageWorkspace
        content={
          <NoteSurface
            className="pm-empty-panel pm-page-panel-surface"
            eyebrow="Page"
            title="页面工作区"
            subtitle="先创建一个页面，再进入统一的线框与模块工作流。"
          >
            <EmptyStateView
              icon="page"
              title="还没有页面草图"
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
            eyebrow="Pages"
            title="页面结构"
            subtitle="用统一的目录树视觉管理页面层级、选择与删除。"
            toolbar={
              <div className="pm-inline-actions">
                <input
                  className="product-input pm-page-search-input"
                  type="search"
                  value={pageSearch}
                  onChange={(event) => onPageSearchChange(event.target.value)}
                  placeholder="搜索页面"
                />
                <button className="doc-action-btn" type="button" onClick={onAddPage}>
                  + 页面
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
                  title="没有匹配的页面"
                  description="换一个关键词试试，或者直接创建新页面。"
                />
              )
            ) : (
              <EmptyStateView
                icon="document"
                title="还没有页面"
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
