import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  toWireframeModuleDrafts,
  WireframeModuleDraft,
} from '../../utils/wireframe';

type SidebarTab = 'requirement' | 'page';
export type WorkbenchLayoutFocus = 'canvas' | 'balanced' | 'sidebar';
export type WorkbenchLayoutDensity = 'comfortable' | 'compact';
type PreviewFrameMode = 'browser' | 'mobile';
type RequirementViewMode = 'preview' | 'edit';
type MarkdownListItem = {
  kind: 'bullet' | 'ordered' | 'task';
  text: string;
  checked?: boolean;
};

const normalizeRequirementFilename = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!normalized) {
    return '未命名需求.md';
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
};

const joinDiskPath = (basePath: string, fileName: string) => {
  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${basePath.replace(/[\\/]+$/, '')}${separator}${fileName}`;
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

const renderInlineMarkdown = (text: string) => {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\(([^)]+)\))/g).filter(Boolean);

  return tokens.map((token, index) => {
    if (/^`[^`]+`$/.test(token)) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>;
    }

    if (/^\*\*[^*]+\*\*$/.test(token)) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
    }

    if (/^~~[^~]+~~$/.test(token)) {
      return <del key={`${token}-${index}`}>{token.slice(2, -2)}</del>;
    }

    if (/^\*[^*]+\*$/.test(token)) {
      return <em key={`${token}-${index}`}>{token.slice(1, -1)}</em>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (linkMatch) {
      return (
        <a key={`${token}-${index}`} href={linkMatch[2]} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={`${token}-${index}`}>{token}</span>;
  });
};

const renderMarkdownPreview = (markdown: string) => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: MarkdownListItem[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;
  let codeFenceLanguage = '';

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="requirement-markdown-paragraph">
        {renderInlineMarkdown(paragraphLines.join(' '))}
      </p>
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    const isOrdered = listItems.every((item) => item.kind === 'ordered');
    const ListTag = isOrdered ? 'ol' : 'ul';

    blocks.push(
      <ListTag key={`list-${blocks.length}`} className={`requirement-markdown-list ${isOrdered ? 'ordered' : 'unordered'}`}>
        {listItems.map((item, index) => (
          <li key={`list-item-${index}`} className={item.kind === 'task' ? 'task-item' : ''}>
            {item.kind === 'task' ? (
              <label className="requirement-markdown-task">
                <input checked={Boolean(item.checked)} readOnly type="checkbox" />
                <span>{renderInlineMarkdown(item.text)}</span>
              </label>
            ) : (
              renderInlineMarkdown(item.text)
            )}
          </li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }

    blocks.push(
      <blockquote key={`quote-${blocks.length}`} className="requirement-markdown-quote">
        {quoteLines.map((line, index) => (
          <p key={`quote-line-${index}`}>{renderInlineMarkdown(line)}</p>
        ))}
      </blockquote>
    );
    quoteLines = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0 && !codeFenceLanguage) {
      return;
    }

    blocks.push(
      <pre key={`code-${blocks.length}`} className="requirement-markdown-code">
        {codeFenceLanguage ? <span className="requirement-markdown-code-lang">{codeFenceLanguage}</span> : null}
        <code>{codeLines.join('\n')}</code>
      </pre>
    );
    codeLines = [];
    codeFenceLanguage = '';
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      flushQuote();

      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeFenceLanguage = trimmed.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      return;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(<hr key={`hr-${blocks.length}`} className="requirement-markdown-divider" />);
      return;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();

      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2]);

      if (level === 1) {
        blocks.push(
          <h1 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-1">
            {content}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-2">
            {content}
          </h2>
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-3">
            {content}
          </h3>
        );
      } else if (level === 4) {
        blocks.push(
          <h4 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-4">
            {content}
          </h4>
        );
      } else if (level === 5) {
        blocks.push(
          <h5 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-5">
            {content}
          </h5>
        );
      } else {
        blocks.push(
          <h6 key={`heading-${blocks.length}`} className="requirement-markdown-heading level-6">
            {content}
          </h6>
        );
      }
      return;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      return;
    }

    const taskMatch = /^[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (taskMatch) {
      flushParagraph();
      flushQuote();
      listItems.push({
        kind: 'task',
        text: taskMatch[2],
        checked: taskMatch[1].toLowerCase() === 'x',
      });
      return;
    }

    const listMatch = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      flushQuote();
      listItems.push({ kind: 'bullet', text: listMatch[1] });
      return;
    }

    const orderedListMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedListMatch) {
      flushParagraph();
      flushQuote();
      listItems.push({ kind: 'ordered', text: orderedListMatch[1] });
      return;
    }

    paragraphLines.push(trimmed);
  });

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  if (blocks.length === 0) {
    return <div className="empty-state">这个 Markdown 文件还是空的。</div>;
  }

  return blocks;
};

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
            aria-label={hasChildren ? `${isExpanded ? '??' : '??'} ${node.name}` : `${node.name} ????`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) {
                setIsExpanded((current) => !current);
              }
            }}
          >
            {hasChildren ? '>' : ''}
          </button>
          <button
            className={`pm-page-tree-node ${isSelected ? 'active' : ''}`}
            onClick={() => onSelect(node.id)}
            type="button"
          >
            <strong>{node.name}</strong>
          </button>
          <div className="pm-page-tree-actions" aria-label={`${node.name} ????`}>
            <button
              className="pm-page-tree-action"
              type="button"
              title={`? ${node.name} ?????`}
              aria-label={`? ${node.name} ?????`}
              onClick={(event) => {
                event.stopPropagation();
                onAddPage(node.id);
              }}
            >
              +
            </button>
            <button
              className="pm-page-tree-action danger"
              type="button"
              title={`?? ${node.name}`}
              aria-label={`?? ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeletePage(node.id);
              }}
            >
              x
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
          <label className="pm-field-stack pm-field-stack-compact">
            <span>{'\u6a21\u5757\u540d\u79f0'}</span>
            <input
              className="product-input pm-form-input"
              value={module.name}
              onChange={(event) => handleModuleFieldChange({ name: event.target.value })}
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
              value={module.content}
              onChange={(event) => handleModuleFieldChange({ content: event.target.value })}
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
  layoutFocus: WorkbenchLayoutFocus;
  layoutDensity: WorkbenchLayoutDensity;
}

export const ProductWorkbench = ({ onFeatureSelect, layoutFocus, layoutDensity }: ProductWorkbenchProps) => {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('requirement');
  const [requirementViewMode, setRequirementViewMode] = useState<RequirementViewMode>('preview');
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [requirementDraftTitle, setRequirementDraftTitle] = useState('');
  const [requirementDraftContent, setRequirementDraftContent] = useState('');
  const [requirementSaveMessage, setRequirementSaveMessage] = useState<string | null>(null);
  const [requirementsDir, setRequirementsDir] = useState<string | null>(null);
  const [requirementStorageMode, setRequirementStorageMode] = useState<'disk' | 'local'>('local');
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [manualPageId, setManualPageId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [previewFrameMode, setPreviewFrameMode] = useState<PreviewFrameMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requirementTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    currentProject,
    featuresMarkdown,
    requirementDocs,
    pageStructure,
    setFeaturesMarkdown,
    updateRequirementDoc,
    addRequirementDoc,
    deleteRequirementDoc,
    ingestRequirementDoc,
    replaceRequirementDocs,
    addRootPage,
    addSiblingPage,
    addChildPage,
    deletePageStructureNode,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    featuresMarkdown: state.featuresMarkdown,
    requirementDocs: state.requirementDocs,
    pageStructure: state.pageStructure,
    setFeaturesMarkdown: state.setFeaturesMarkdown,
    updateRequirementDoc: state.updateRequirementDoc,
    addRequirementDoc: state.addRequirementDoc,
    deleteRequirementDoc: state.deleteRequirementDoc,
    ingestRequirementDoc: state.ingestRequirementDoc,
    replaceRequirementDocs: state.replaceRequirementDocs,
    addRootPage: state.addRootPage,
    addSiblingPage: state.addSiblingPage,
    addChildPage: state.addChildPage,
    deletePageStructureNode: state.deletePageStructureNode,
  })));

  const tree = useFeatureTreeStore((state) => state.tree);
  const selectFeature = useFeatureTreeStore((state) => state.selectFeature);
  const setCanvasSize = usePreviewStore((state) => state.setCanvasSize);
  const clearCanvas = usePreviewStore((state) => state.clearCanvas);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const selectElement = usePreviewStore((state) => state.selectElement);

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const filteredPageStructure = useMemo(() => filterPageTree(pageStructure, pageSearch), [pageSearch, pageStructure]);
  const filteredDesignPages = useMemo(() => collectDesignPages(filteredPageStructure), [filteredPageStructure]);
  const selectedRequirement = requirementDocs.find((doc) => doc.id === selectedRequirementId) || requirementDocs[0] || null;
  const selectedPage = designPages.find((page) => page.id === manualPageId) || designPages[0] || null;
  const hasRequirementChanges = selectedRequirement
    ? requirementDraftTitle !== selectedRequirement.title || requirementDraftContent !== selectedRequirement.content
    : false;
  const canPersistRequirementToDisk = requirementStorageMode === 'disk' && Boolean(requirementsDir);
  const canSaveRequirement = Boolean(
    selectedRequirement &&
    !isSavingRequirement &&
    (hasRequirementChanges || !selectedRequirement.filePath)
  );
  const effectiveAppType = useMemo<AppType | undefined>(() => {
    if (previewFrameMode === 'mobile') {
      return 'mobile';
    }

    if (previewFrameMode === 'browser') {
      return 'web';
    }

    return currentProject?.appType;
  }, [currentProject?.appType, previewFrameMode]);
  const canvasPreset = useMemo(() => getCanvasPreset(effectiveAppType), [effectiveAppType]);
  const featureMap = useMemo(() => {
    const nodes = tree ? collectFeatureNodes(tree.children) : [];
    return new Map(nodes.map((node) => [node.id, node]));
  }, [tree]);
  const linkedFeatures = selectedPage?.featureIds.map((id) => featureMap.get(id)).filter(Boolean) as FeatureNode[] | undefined;
  const linkedFeatureName = linkedFeatures?.map((feature) => feature.name).join(' / ') || '核心页面';
  const layoutStyle = useMemo<CSSProperties>(() => {
    const pageColumns =
      layoutFocus === 'canvas'
        ? 'minmax(0, 1.62fr) minmax(300px, 0.58fr)'
        : layoutFocus === 'sidebar'
          ? 'minmax(0, 1.1fr) minmax(360px, 0.9fr)'
          : 'minmax(0, 1.42fr) minmax(320px, 0.66fr)';

    return {
      ['--pm-left-width' as string]: layoutFocus === 'canvas' ? '212px' : layoutFocus === 'sidebar' ? '252px' : '228px',
      ['--pm-page-columns' as string]: pageColumns,
      ['--pm-shell-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-padding' as string]: layoutDensity === 'compact' ? '12px' : '16px',
      ['--pm-canvas-height' as string]: layoutDensity === 'compact' ? 'clamp(620px, 78vh, 920px)' : 'clamp(700px, 84vh, 1020px)',
    };
  }, [layoutDensity, layoutFocus]);

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
    if (!selectedRequirement) {
      setRequirementDraftTitle('');
      setRequirementDraftContent('');
      return;
    }

    setRequirementDraftTitle(selectedRequirement.title);
    setRequirementDraftContent(selectedRequirement.content);
    setRequirementSaveMessage(null);
  }, [selectedRequirement]);

  useEffect(() => {
    if (!currentProject) {
      setRequirementsDir(null);
      return;
    }

    let isMounted = true;

    invoke<string>('get_requirements_dir', { projectId: currentProject.id })
      .then((dirPath) => {
        if (isMounted) {
          setRequirementsDir(dirPath);
          setRequirementStorageMode('disk');
        }
      })
      .catch(() => {
        if (isMounted) {
          setRequirementsDir(null);
          setRequirementStorageMode('local');
          setRequirementSaveMessage('当前运行在浏览器开发环境，需求文档会先保存到项目状态；桌面版会同步到磁盘。');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentProject]);

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

  const removeRequirementFile = useCallback(async (filePath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_remove', {
      params: {
        file_path: filePath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `删除文件失败：${filePath}`);
    }
  }, []);

  const readRequirementFile = useCallback(async (filePath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_view', {
      params: {
        file_path: filePath,
        offset: 0,
        limit: 2000,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `读取文件失败：${filePath}`);
    }

    return result.content
      .replace(/^<file>\n/, '')
      .replace(/\n<\/file>\n?$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\d+\|/, ''))
      .join('\n');
  }, []);

  useEffect(() => {
    if (!currentProject || !requirementsDir || requirementStorageMode !== 'disk') {
      return;
    }

    let isMounted = true;

    const syncRequirementDocsFromDisk = async () => {
      try {
        const listResult = await invoke<{ success: boolean; content: string; error: string | null }>('tool_ls', {
          params: {
            path: requirementsDir,
          },
        });

        if (!listResult.success) {
          throw new Error(listResult.error || '读取需求目录失败');
        }

        const fileNames = listResult.content
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && /\.(md|markdown)$/i.test(item));

        if (fileNames.length === 0) {
          return;
        }

        const docs = await Promise.all(
          fileNames.map(async (fileName) => {
            const filePath = joinDiskPath(requirementsDir, fileName);
            const content = await readRequirementFile(filePath);

            return {
              id: filePath,
              title: fileName,
              content,
              summary: content.replace(/\s+/g, ' ').trim().slice(0, 96),
              filePath,
              authorRole: '产品' as const,
              sourceType: 'manual' as const,
              updatedAt: new Date().toISOString(),
              status: 'ready' as const,
            };
          })
        );

        if (isMounted) {
          replaceRequirementDocs(docs);
          setRequirementSaveMessage(`已从 ${requirementsDir} 读取 ${docs.length} 个 Markdown 文件。`);
        }
      } catch (error) {
        if (isMounted) {
          setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void syncRequirementDocsFromDisk();

    return () => {
      isMounted = false;
    };
  }, [currentProject, readRequirementFile, replaceRequirementDocs, requirementStorageMode, requirementsDir]);

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

  const applyRequirementEditorTransform = useCallback(
    (
      transform: (input: { value: string; start: number; end: number; selectedText: string }) => {
        value: string;
        start: number;
        end: number;
      }
    ) => {
      const textarea = requirementTextareaRef.current;
      const value = requirementDraftContent;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      const selectedText = value.slice(start, end);
      const next = transform({ value, start, end, selectedText });

      setRequirementDraftContent(next.value);

      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(next.start, next.end);
      });
    },
    [requirementDraftContent]
  );

  const handleWrapSelection = useCallback(
    (prefix: string, suffix = prefix, placeholder = '') => {
      applyRequirementEditorTransform(({ value, start, end, selectedText }) => {
        const content = selectedText || placeholder;
        const nextValue = `${value.slice(0, start)}${prefix}${content}${suffix}${value.slice(end)}`;
        const selectionStart = start + prefix.length;
        const selectionEnd = selectionStart + content.length;

        return {
          value: nextValue,
          start: selectionStart,
          end: selectionEnd,
        };
      });
    },
    [applyRequirementEditorTransform]
  );

  const handleInsertLinePrefix = useCallback(
    (prefix: string, placeholder: string) => {
      applyRequirementEditorTransform(({ value, start, end, selectedText }) => {
        const content = selectedText || placeholder;
        const prefixed = content
          .split('\n')
          .map((line) => `${prefix}${line}`)
          .join('\n');
        const nextValue = `${value.slice(0, start)}${prefixed}${value.slice(end)}`;

        return {
          value: nextValue,
          start,
          end: start + prefixed.length,
        };
      });
    },
    [applyRequirementEditorTransform]
  );

  const handleInsertLink = useCallback(() => {
    handleWrapSelection('[', '](https://example.com)', '链接文字');
  }, [handleWrapSelection]);

  const handleInsertCodeBlock = useCallback(() => {
    applyRequirementEditorTransform(({ value, start, end, selectedText }) => {
      const blockContent = selectedText || '在这里写代码';
      const insertion = `\n\`\`\`md\n${blockContent}\n\`\`\`\n`;
      const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
      const cursorStart = start + 7;

      return {
        value: nextValue,
        start: cursorStart,
        end: cursorStart + blockContent.length,
      };
    });
  }, [applyRequirementEditorTransform]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const markdownFiles = files.filter((file) => /\.(md|markdown)$/i.test(file.name));
    const invalidFiles = files.filter((file) => !/\.(md|markdown)$/i.test(file.name));

    if (invalidFiles.length > 0) {
      window.alert(`只能上传 Markdown 文件：${invalidFiles.map((file) => file.name).join('、')}`);
    }

    if (!canPersistRequirementToDisk || !requirementsDir) {
      window.alert('当前环境不支持直接导入到磁盘目录，请在桌面版中使用上传。');
      event.target.value = '';
      return;
    }

    try {
      for (const file of markdownFiles) {
        const content = await file.text();
        const normalizedTitle = normalizeRequirementFilename(file.name);
        const filePath = joinDiskPath(requirementsDir, normalizedTitle);

        await writeRequirementFile(filePath, content);

        ingestRequirementDoc({
          title: normalizedTitle,
          content,
          sourceType: 'upload',
          filePath,
        });
      }

      setRequirementSaveMessage(`已导入 ${markdownFiles.length} 个 Markdown 文件到 ${requirementsDir}`);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
    event.target.value = '';
  };

  const handleDeleteRequirement = useCallback(async () => {
    if (!selectedRequirement) {
      return;
    }

    if (!window.confirm(`确定删除文件“${selectedRequirement.title}”吗？`)) {
      return;
    }

    if (canPersistRequirementToDisk && selectedRequirement.filePath) {
      try {
        await removeRequirementFile(selectedRequirement.filePath);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    deleteRequirementDoc(selectedRequirement.id);
    setRequirementSaveMessage(canPersistRequirementToDisk ? '文件已从项目和磁盘中删除。' : '文件已从当前项目状态中删除。');
  }, [canPersistRequirementToDisk, deleteRequirementDoc, removeRequirementFile, selectedRequirement]);

  const handleCreateRequirement = useCallback(() => {
    const nextDoc = addRequirementDoc();
    if (!nextDoc) {
      return;
    }

    setSelectedRequirementId(nextDoc.id);
    setRequirementDraftTitle(nextDoc.title);
    setRequirementDraftContent(nextDoc.content);
    setRequirementViewMode('edit');
    setRequirementSaveMessage(null);
  }, [addRequirementDoc]);

  const handleEditRequirement = useCallback(() => {
    if (!selectedRequirement) {
      return;
    }

    setRequirementDraftTitle(selectedRequirement.title);
    setRequirementDraftContent(selectedRequirement.content);
    setRequirementViewMode('edit');
    setRequirementSaveMessage(null);
  }, [selectedRequirement]);

  const handleCancelRequirementEdit = useCallback(() => {
    if (!selectedRequirement) {
      return;
    }

    setRequirementDraftTitle(selectedRequirement.title);
    setRequirementDraftContent(selectedRequirement.content);
    setRequirementViewMode('preview');
    setRequirementSaveMessage(null);
  }, [selectedRequirement]);

  const handleSaveRequirement = useCallback(async () => {
    if (!selectedRequirement) {
      return;
    }

    const nextTitle = normalizeRequirementFilename(requirementDraftTitle);
    const nextFilePath =
      canPersistRequirementToDisk && requirementsDir
        ? joinDiskPath(requirementsDir, nextTitle)
        : selectedRequirement.filePath;

    try {
      setIsSavingRequirement(true);

      if (canPersistRequirementToDisk && selectedRequirement.filePath && nextFilePath && selectedRequirement.filePath !== nextFilePath) {
        await removeRequirementFile(selectedRequirement.filePath);
      }

      if (canPersistRequirementToDisk && nextFilePath) {
        await writeRequirementFile(nextFilePath, requirementDraftContent);
      }

      updateRequirementDoc(selectedRequirement.id, {
        title: nextTitle,
        content: requirementDraftContent,
        filePath: nextFilePath,
      });
      setRequirementDraftTitle(nextTitle);
      setRequirementViewMode('preview');
      setRequirementSaveMessage(
        canPersistRequirementToDisk && nextFilePath
          ? `已保存到 ${nextFilePath}`
          : '已保存到当前项目状态。桌面版运行时会同步到磁盘。'
      );
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingRequirement(false);
    }
  }, [canPersistRequirementToDisk, removeRequirementFile, requirementDraftContent, requirementDraftTitle, requirementsDir, selectedRequirement, updateRequirementDoc, writeRequirementFile]);

  useEffect(() => {
    if (requirementViewMode !== 'edit') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSaveRequirement) {
          void handleSaveRequirement();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSaveRequirement, handleSaveRequirement, requirementViewMode]);

  const handleAddPageAfter = useCallback((pageId: string) => {
    const nextPage = addSiblingPage(pageId);
    if (nextPage) {
      setManualPageId(nextPage.id);
      setSidebarTab('page');
    }
  }, [addSiblingPage]);

  const handleAddRootPage = useCallback(() => {
    const nextPage = addRootPage();
    if (nextPage) {
      setManualPageId(nextPage.id);
      setSidebarTab('page');
    }
  }, [addRootPage]);

  const handleAddPageFromSidebar = useCallback(() => {
    const referencePageId = selectedPage?.id || designPages[designPages.length - 1]?.id;
    if (!referencePageId) {
      handleAddRootPage();
      return;
    }

    handleAddPageAfter(referencePageId);
  }, [designPages, handleAddPageAfter, handleAddRootPage, selectedPage]);

  const handleAddChildPageById = useCallback((pageId: string) => {
    const nextPage = addChildPage(pageId);
    if (nextPage) {
      setManualPageId(nextPage.id);
    }
  }, [addChildPage]);

  const handleAddChildPage = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    handleAddChildPageById(selectedPage.id);
  }, [handleAddChildPageById, selectedPage]);

  const handleDeletePageById = useCallback((pageId: string) => {
    const page = designPages.find((item) => item.id === pageId);
    if (!page) {
      return;
    }

    if (!window.confirm(`确定删除页面“${page.name}”吗？该页面下的所有子页面都会一起删除。`)) {
      return;
    }

    deletePageStructureNode(pageId);

    if (selectedPage?.id === pageId) {
      setManualPageId(null);
      loadFromCode([]);
    }
  }, [deletePageStructureNode, designPages, loadFromCode, selectedPage]);

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

  const renderRequirementMain = () => (
    <div className="pm-viewer-stack">
      <section className="pm-card">
        <div className="pm-card-header">
          <div>
            <h3>需求文件</h3>
            <span>只支持 Markdown 上传、阅读、编辑、保存和删除</span>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={handleCreateRequirement}>
              新建 Markdown
            </button>
            <button className="doc-action-btn secondary" type="button" onClick={handleUploadClick}>
              上传 Markdown
            </button>
          </div>
        </div>
        {selectedRequirement ? (
          <div className="requirement-file-editor">
            <div className="requirement-file-meta">
              <div>
                <strong>{selectedRequirement.title}</strong>
                <span>
                  {selectedRequirement.sourceType || 'manual'} · {selectedRequirement.status} ·{' '}
                  {new Date(selectedRequirement.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="requirement-file-toolbar">
                <div className="pm-segmented-control">
                  <button
                    className={requirementViewMode === 'preview' ? 'active' : ''}
                    type="button"
                    onClick={() => {
                      if (requirementViewMode === 'edit') {
                        handleCancelRequirementEdit();
                        return;
                      }

                      setRequirementViewMode('preview');
                    }}
                  >
                    阅读
                  </button>
                  <button
                    className={requirementViewMode === 'edit' ? 'active' : ''}
                    type="button"
                    onClick={handleEditRequirement}
                  >
                    编辑
                  </button>
                </div>
                <button className="doc-action-btn" type="button" onClick={handleDeleteRequirement}>
                  删除
                </button>
              </div>
            </div>

            <div className="requirement-storage-note">
              <strong>保存位置</strong>
              <span>
                {selectedRequirement.filePath
                  ? selectedRequirement.filePath
                  : canPersistRequirementToDisk && requirementsDir
                    ? `当前项目目录：${requirementsDir}`
                    : '当前运行在浏览器开发环境，保存会进入项目状态；桌面版运行时会同步到磁盘。'}
              </span>
            </div>

            {requirementViewMode === 'edit' ? (
              <div className="requirement-editor-shell">
                <input
                  className="product-input requirement-file-name-input"
                  value={requirementDraftTitle}
                  onChange={(event) => setRequirementDraftTitle(event.target.value)}
                  placeholder="文件名，例如 product-requirements.md"
                />
                <div className="requirement-editor-toolbar">
                  <button className="doc-action-btn secondary" type="button" onClick={() => handleInsertLinePrefix('# ', '标题')}>
                    H1
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={() => handleWrapSelection('**', '**', '加粗')}>
                    加粗
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={() => handleWrapSelection('*', '*', '斜体')}>
                    斜体
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={() => handleInsertLinePrefix('- ', '列表项')}>
                    列表
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={() => handleInsertLinePrefix('> ', '引用内容')}>
                    引用
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={handleInsertLink}>
                    链接
                  </button>
                  <button className="doc-action-btn secondary" type="button" onClick={handleInsertCodeBlock}>
                    代码块
                  </button>
                </div>
                <div className="requirement-editor-layout">
                  <textarea
                    ref={requirementTextareaRef}
                    className="product-textarea requirement-file-textarea"
                    value={requirementDraftContent}
                    onChange={(event) => setRequirementDraftContent(event.target.value)}
                    placeholder="在这里编辑 Markdown 内容"
                  />
                  <div className="requirement-live-preview-shell">
                    <div className="requirement-preview-header">
                      <span>实时预览</span>
                      <span className="requirement-preview-shortcut">Ctrl+S 保存</span>
                    </div>
                    <article className="requirement-markdown-preview">{renderMarkdownPreview(requirementDraftContent)}</article>
                  </div>
                </div>
                <div className="requirement-editor-actions">
                  <span className="requirement-save-message">
                    {requirementSaveMessage || '编辑完成后点击保存。'}
                  </span>
                  <div className="pm-inline-actions">
                    <button className="doc-action-btn secondary" type="button" onClick={handleCancelRequirementEdit}>
                      取消
                    </button>
                    <button className="doc-action-btn" type="button" onClick={handleSaveRequirement} disabled={!canSaveRequirement}>
                      {isSavingRequirement ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="requirement-preview-shell">
                <div className="requirement-preview-header">
                  <span>{selectedRequirement.title}</span>
                  <button className="doc-action-btn secondary" type="button" onClick={handleEditRequirement}>
                    进入编辑
                  </button>
                </div>
                <article className="requirement-markdown-preview">{renderMarkdownPreview(selectedRequirement.content)}</article>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">还没有需求文件，可以直接新建，或上传 `.md` / `.markdown` 文件。</div>
        )}
      </section>

      <input
        ref={fileInputRef}
        className="product-hidden-input"
        type="file"
        accept=".md,.markdown,text/markdown"
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
            </div>
          </div>
          <div className="empty-state">还没有页面草图。</div>
        </section>
      );
    }

    return (
      <div className="pm-page-workspace">
        <section className="pm-card pm-wireframe-main">
          <div className="pm-card-header pm-wireframe-section-header">
            <div>
              <h3>页面画布</h3>
            </div>
            <div className="pm-inline-actions">
              <button
                className={`doc-action-btn secondary ${canvasPreset.frameType === 'browser' ? 'active' : ''}`}
                type="button"
                onClick={() => setPreviewFrameMode('browser')}
              >
                网页端
              </button>
              <button
                className={`doc-action-btn secondary ${canvasPreset.frameType === 'mobile' ? 'active' : ''}`}
                type="button"
                onClick={() => setPreviewFrameMode('mobile')}
              >
                手机端
              </button>
              <button className="doc-action-btn" type="button" onClick={handleAddModule}>
                添加模块
              </button>
            </div>
          </div>
          <div className="pm-canvas-shell">
            <Canvas
              key={selectedPage.id}
              width={canvasPreset.width}
              height={canvasPreset.height}
              frameType={canvasPreset.frameType}
              frameLabel={canvasPreset.label}
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
        />
      </div>
    );
  };

  return (
    <div className="product-workbench-shell" style={layoutStyle}>
      <aside className="pm-left-nav">
        <div className="pm-nav-header">
          <strong>{currentProject?.name || '产品工作台'}</strong>
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
            <div className="pm-nav-title">Markdown 文件</div>
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
            <div className="pm-nav-section-header">
              <div className="pm-nav-title">{filteredDesignPages.length || designPages.length} 个页面</div>
              <button className="pm-nav-mini-action" type="button" onClick={handleAddPageFromSidebar}>
                + 页面
              </button>
            </div>
            <input
              className="product-input pm-page-search-input"
              type="search"
              value={pageSearch}
              onChange={(event) => setPageSearch(event.target.value)}
              placeholder="搜索页面"
            />
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
