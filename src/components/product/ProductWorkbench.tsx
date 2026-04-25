import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Canvas } from '../canvas/Canvas';
import {
  buildKnowledgeEntries,
  findKnowledgeEntry,
} from '../../modules/knowledge/knowledgeEntries';
import {
  buildKnowledgeTree,
  filterKnowledgeTree,
  findFirstKnowledgeFileNode,
  findKnowledgeTreeNode,
  type KnowledgeDiskItem,
  type KnowledgeGroupId,
  type KnowledgeTreeNode,
} from '../../modules/knowledge/knowledgeTree';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
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
import {
  deleteSketchPageFile,
  ensureProjectFilesystemStructure,
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

type SidebarTab = 'requirement' | 'page';
export type WorkbenchLayoutFocus = 'canvas' | 'balanced' | 'sidebar';
export type WorkbenchLayoutDensity = 'comfortable' | 'compact';
type PreviewFrameMode = 'browser' | 'mobile';
type RequirementViewMode = 'preview' | 'edit';
type KnowledgeSourceFilter = 'all' | 'requirement' | 'generated';
type MarkdownListItem = {
  kind: 'bullet' | 'ordered' | 'task';
  text: string;
  checked?: boolean;
};
type KnowledgeContextMenuState = {
  x: number;
  y: number;
  node: KnowledgeTreeNode;
} | null;

const normalizeRequirementFilename = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!normalized) {
    return '未命名需求.md';
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
};

const joinDiskPath = (basePath: string, fileName: string) => joinFileSystemPath(basePath, fileName);

const normalizeRelativePath = (value: string) => normalizeRelativeFileSystemPath(value);

const getKnowledgeGroupOverridesStorageKey = (projectId: string) =>
  `devflow:knowledge-group-overrides:${projectId}`;

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
  return normalized === '.devflow' || normalized.startsWith('.devflow/') || normalized === 'project.json';
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

const buildKnowledgeDocsFromDisk = async (
  diskItems: KnowledgeDiskItem[],
  readRequirementFile: (filePath: string) => Promise<string>,
  groupOverrides: Record<string, KnowledgeGroupId>
) => {
  const markdownItems = diskItems.filter(
    (item) => item.type === 'file' && /\.(md|markdown)$/i.test(item.relativePath)
  );

  return Promise.all(
    markdownItems.map(async (item) => {
      const content = await readRequirementFile(item.path);
      const overrideGroup = groupOverrides[item.relativePath];
      const isSketchPath = overrideGroup === 'sketch' || item.relativePath.startsWith('sketch/');
      const resolvedGroup = overrideGroup || (item.relativePath.startsWith('design/') ? 'design' : isSketchPath ? 'sketch' : null);

      return {
        id: item.path,
        title: item.relativePath.split('/').pop() || item.relativePath,
        content,
        summary: content.replace(/\s+/g, ' ').trim().slice(0, 96),
        filePath: item.path,
        kind: isSketchPath ? 'sketch' as const : 'note' as const,
        tags: resolvedGroup ? [resolvedGroup] : [],
        relatedIds: [],
        authorRole: '产品' as const,
        sourceType: 'manual' as const,
        updatedAt: new Date().toISOString(),
        status: 'ready' as const,
      };
    })
  );
};

const getDefaultKnowledgeFileName = (group: KnowledgeGroupId) => {
  if (group === 'sketch') {
    return '新建草图.md';
  }

  if (group === 'design') {
    return '新建设计.md';
  }

  return '新建项目文件.md';
};

const findKnowledgeNodeByEntryId = (nodes: KnowledgeTreeNode[], entryId: string): KnowledgeTreeNode | null => {
  for (const node of nodes) {
    if (node.entryId === entryId) {
      return node;
    }

    const childMatch = findKnowledgeNodeByEntryId(node.children, entryId);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
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
}

export const ProductWorkbench = ({ onFeatureSelect, layoutFocus, layoutDensity }: ProductWorkbenchProps) => {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('requirement');
  const [requirementViewMode, setRequirementViewMode] = useState<RequirementViewMode>('preview');
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [selectedKnowledgeNodeId, setSelectedKnowledgeNodeId] = useState<string | null>(null);
  const [requirementDraftTitle, setRequirementDraftTitle] = useState('');
  const [requirementDraftContent, setRequirementDraftContent] = useState('');
  const [requirementSaveMessage, setRequirementSaveMessage] = useState<string | null>(null);
  const [projectRootDir, setProjectRootDir] = useState<string | null>(null);
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [manualPageId, setManualPageId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeSourceFilter, setKnowledgeSourceFilter] = useState<KnowledgeSourceFilter>('all');
  const [knowledgeDiskItems, setKnowledgeDiskItems] = useState<KnowledgeDiskItem[]>([]);
  const [knowledgeGroupOverrides, setKnowledgeGroupOverrides] = useState<Record<string, KnowledgeGroupId>>({});
  const [expandedKnowledgeNodeIds, setExpandedKnowledgeNodeIds] = useState<Set<string>>(
    () => new Set(['project', 'sketch', 'design'])
  );
  const [knowledgeContextMenu, setKnowledgeContextMenu] = useState<KnowledgeContextMenuState>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [previewFrameMode, setPreviewFrameMode] = useState<PreviewFrameMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requirementTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const knowledgeRefreshRequestIdRef = useRef(0);
  const lastPersistedSketchSnapshotRef = useRef('');

  const {
    currentProject,
    featuresMarkdown,
    requirementDocs,
    activeKnowledgeFileId,
    generatedFiles,
    pageStructure,
    wireframes,
    setFeaturesMarkdown,
    setActiveKnowledgeFileId,
    updateRequirementDoc,
    deleteRequirementDoc,
    addRootPage,
    addSiblingPage,
    addChildPage,
    deletePageStructureNode,
    replaceRequirementDocs,
    replacePageStructure,
    replaceWireframes,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    featuresMarkdown: state.featuresMarkdown,
    requirementDocs: state.requirementDocs,
    activeKnowledgeFileId: state.activeKnowledgeFileId,
    generatedFiles: state.generatedFiles,
    pageStructure: state.pageStructure,
    wireframes: state.wireframes,
    setFeaturesMarkdown: state.setFeaturesMarkdown,
    setActiveKnowledgeFileId: state.setActiveKnowledgeFileId,
    updateRequirementDoc: state.updateRequirementDoc,
    deleteRequirementDoc: state.deleteRequirementDoc,
    addRootPage: state.addRootPage,
    addSiblingPage: state.addSiblingPage,
    addChildPage: state.addChildPage,
    deletePageStructureNode: state.deletePageStructureNode,
    replaceRequirementDocs: state.replaceRequirementDocs,
    replacePageStructure: state.replacePageStructure,
    replaceWireframes: state.replaceWireframes,
  })));

  const tree = useFeatureTreeStore((state) => state.tree);
  const selectFeature = useFeatureTreeStore((state) => state.selectFeature);
  const setSceneContext = useAIContextStore((state) => state.setSceneContext);
  const setCanvasSize = usePreviewStore((state) => state.setCanvasSize);
  const clearCanvas = usePreviewStore((state) => state.clearCanvas);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const canUseProjectFilesystem = isTauriRuntimeAvailable();

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedPage = designPages.find((page) => page.id === manualPageId) || designPages[0] || null;
  const selectedPageWireframe = selectedPage ? wireframes[selectedPage.id] || null : null;
  const knowledgeEntries = useMemo(
    () => buildKnowledgeEntries(requirementDocs, generatedFiles),
    [generatedFiles, requirementDocs]
  );
  const filteredKnowledgeEntries = useMemo(() => {
    const keyword = knowledgeSearch.trim().toLowerCase();

    return knowledgeEntries.filter((entry) => {
      if (knowledgeSourceFilter !== 'all' && entry.source !== knowledgeSourceFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [entry.title, entry.summary, entry.filePath || '', entry.tags.join(' '), entry.content]
        .join('\n')
        .toLowerCase()
        .includes(keyword);
    });
  }, [knowledgeEntries, knowledgeSearch, knowledgeSourceFilter]);
  const knowledgeTree = useMemo(
    () => buildKnowledgeTree(knowledgeEntries, knowledgeDiskItems, projectRootDir, knowledgeGroupOverrides),
    [knowledgeDiskItems, knowledgeEntries, knowledgeGroupOverrides, projectRootDir]
  );
  const filteredKnowledgeTree = useMemo(
    () => filterKnowledgeTree(knowledgeTree, knowledgeSearch),
    [knowledgeSearch, knowledgeTree]
  );
  const filteredPageStructure = useMemo(() => filterPageTree(pageStructure, pageSearch), [pageSearch, pageStructure]);
  const filteredDesignPages = useMemo(() => collectDesignPages(filteredPageStructure), [filteredPageStructure]);
  const firstKnowledgeFileNode = useMemo(() => findFirstKnowledgeFileNode(knowledgeTree), [knowledgeTree]);
  const selectedKnowledgeNode = useMemo(
    () => findKnowledgeTreeNode(knowledgeTree, selectedKnowledgeNodeId || firstKnowledgeFileNode?.id || null),
    [firstKnowledgeFileNode?.id, knowledgeTree, selectedKnowledgeNodeId]
  );
  const selectedKnowledgeEntry =
    findKnowledgeEntry(knowledgeEntries, selectedRequirementId || selectedKnowledgeNode?.entryId || null) || null;
  const selectedRequirement =
    selectedKnowledgeEntry?.source === 'requirement'
      ? requirementDocs.find((doc) => doc.id === selectedKnowledgeEntry.id) || null
      : null;
  const derivedKnowledgeEntries = useMemo(
    () =>
      selectedRequirement
        ? knowledgeEntries.filter((entry) => entry.sourceRequirementId === selectedRequirement.id)
        : [],
    [knowledgeEntries, selectedRequirement]
  );
  const selectedKnowledgeRelatedEntries = useMemo(() => {
    if (!selectedKnowledgeEntry) {
      return [];
    }

    const relatedIds = new Set(selectedKnowledgeEntry.relatedIds);
    if (selectedKnowledgeEntry.sourceRequirementId) {
      relatedIds.add(selectedKnowledgeEntry.sourceRequirementId);
    }

    return knowledgeEntries.filter(
      (entry) => entry.id !== selectedKnowledgeEntry.id && relatedIds.has(entry.id)
    );
  }, [knowledgeEntries, selectedKnowledgeEntry]);
  const sourceKnowledgeEntry = useMemo(
    () =>
      selectedKnowledgeEntry?.sourceRequirementId
        ? findKnowledgeEntry(knowledgeEntries, selectedKnowledgeEntry.sourceRequirementId)
        : null,
    [knowledgeEntries, selectedKnowledgeEntry]
  );
  const hasRequirementChanges = selectedRequirement
    ? requirementDraftTitle !== selectedRequirement.title || requirementDraftContent !== selectedRequirement.content
    : false;
  const canPersistRequirementToDisk = Boolean(projectRootDir);
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
    if (!firstKnowledgeFileNode) {
      setSelectedRequirementId(null);
      setSelectedKnowledgeNodeId(null);
      return;
    }

    setSelectedKnowledgeNodeId((current) =>
      current && findKnowledgeTreeNode(knowledgeTree, current) ? current : firstKnowledgeFileNode.id
    );
  }, [firstKnowledgeFileNode, knowledgeTree]);

  useEffect(() => {
    if (selectedKnowledgeNode?.type !== 'file' || !selectedKnowledgeNode.entryId) {
      return;
    }

    if (selectedRequirementId !== selectedKnowledgeNode.entryId) {
      setSelectedRequirementId(selectedKnowledgeNode.entryId);
    }
  }, [selectedKnowledgeNode, selectedRequirementId]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setSceneContext(currentProject.id, {
      scene: sidebarTab === 'requirement' ? 'knowledge' : 'page',
      selectedKnowledgeEntryId: selectedKnowledgeEntry?.id || null,
      selectedPageId: selectedPage?.id || null,
    });
  }, [
    currentProject,
    selectedKnowledgeEntry?.id,
    selectedPage?.id,
    setSceneContext,
    sidebarTab,
  ]);

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
    if (selectedKnowledgeEntry?.source === 'requirement' && activeKnowledgeFileId !== selectedKnowledgeEntry.id) {
      setActiveKnowledgeFileId(selectedKnowledgeEntry.id);
    }
  }, [activeKnowledgeFileId, selectedKnowledgeEntry, setActiveKnowledgeFileId]);

  useEffect(() => {
    if (!currentProject) {
      setProjectRootDir(null);
      return;
    }

    if (!canUseProjectFilesystem) {
      setProjectRootDir(null);
      setRequirementSaveMessage('当前运行在浏览器开发环境，需求文档会先保存在项目状态中；桌面版会同步到磁盘。');
      return;
    }

    let isMounted = true;

    invoke<string>('get_project_dir', { projectId: currentProject.id })
      .then((dirPath) => {
        if (!isMounted) {
          return;
        }

        setProjectRootDir(dirPath);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setProjectRootDir(null);
        setRequirementSaveMessage('当前运行在浏览器开发环境，需求文档会先保存到项目状态；桌面版会同步到磁盘。');
      });

    return () => {
      isMounted = false;
    };
  }, [canUseProjectFilesystem, currentProject]);

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

  const createKnowledgeFolder = useCallback(async (directoryPath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_mkdir', {
      params: {
        file_path: directoryPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `创建文件夹失败：${directoryPath}`);
    }
  }, []);

  const refreshKnowledgeFilesystem = useCallback(async (overrides = knowledgeGroupOverrides) => {
    const requestId = ++knowledgeRefreshRequestIdRef.current;

    if (!canUseProjectFilesystem || !currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    await ensureProjectFilesystemStructure(currentProject.id);
    const diskItems = await listKnowledgeDiskItems(projectRootDir);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }
    setKnowledgeDiskItems(diskItems);

    const docs = await buildKnowledgeDocsFromDisk(diskItems, readRequirementFile, overrides);
    const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }
    replaceRequirementDocs(docs);
    replacePageStructure(sketchArtifacts.pageStructure, tree);
    replaceWireframes(sketchArtifacts.wireframes, tree);
  }, [canUseProjectFilesystem, currentProject, knowledgeGroupOverrides, projectRootDir, readRequirementFile, replacePageStructure, replaceRequirementDocs, replaceWireframes, tree]);

  useEffect(() => {
    if (!currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    let isMounted = true;

    const syncRequirementDocsFromDisk = async () => {
      try {
        await refreshKnowledgeFilesystem(readKnowledgeGroupOverrides(currentProject.id));
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
      elements: selectedPageWireframe?.elements || [],
    });

    if (snapshot === lastPersistedSketchSnapshotRef.current) {
      return;
    }

    lastPersistedSketchSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      void writeSketchPageFile(currentProject.id, selectedPage, selectedPageWireframe).catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [canUseProjectFilesystem, currentProject, selectedPage, selectedPageWireframe]);

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

    if (!canPersistRequirementToDisk || !projectRootDir) {
      window.alert('当前环境不支持直接导入到项目目录，请在桌面版中使用上传。');
      event.target.value = '';
      return;
    }

    try {
      for (const file of markdownFiles) {
        const content = await file.text();
        const normalizedTitle = normalizeRequirementFilename(file.name);
        const filePath = joinDiskPath(projectRootDir, normalizedTitle);
        await writeRequirementFile(filePath, content);
      }

      await refreshKnowledgeFilesystem();
      setRequirementSaveMessage(`已导入 ${markdownFiles.length} 个 Markdown 文件到 ${projectRootDir}`);
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
    await refreshKnowledgeFilesystem();
    setRequirementSaveMessage(canPersistRequirementToDisk ? '文件已从项目目录中删除。' : '文件已从当前项目状态中删除。');
  }, [canPersistRequirementToDisk, deleteRequirementDoc, refreshKnowledgeFilesystem, removeRequirementFile, selectedRequirement]);

  const handleCreateKnowledgeFile = useCallback(async (
    group: KnowledgeGroupId,
    parentFolderPath: string | null = null
  ) => {
    if (!projectRootDir) {
      return;
    }

    const suggestedName = window.prompt('输入新文件名', getDefaultKnowledgeFileName(group));
    const normalizedTitle = normalizeRequirementFilename(suggestedName || '');
    if (!normalizedTitle) {
      return;
    }

    const targetDirectory = parentFolderPath || projectRootDir;
    const nextFilePath = joinDiskPath(targetDirectory, normalizedTitle);
    const relativePath = normalizeRelativePath(getRelativePathFromRoot(nextFilePath, projectRootDir) || normalizedTitle);

    try {
      await writeRequirementFile(nextFilePath, '');
      const nextOverrides = {
        ...knowledgeGroupOverrides,
        [relativePath]: group,
      };
      setKnowledgeGroupOverrides(nextOverrides);
      writeKnowledgeGroupOverrides(currentProject?.id || null, nextOverrides);
      await refreshKnowledgeFilesystem(nextOverrides);
      setSelectedKnowledgeNodeId(`file:${group}:${relativePath}`);
      setSelectedRequirementId(nextFilePath);
      setRequirementDraftTitle(normalizedTitle);
      setRequirementDraftContent('');
      setRequirementViewMode('edit');
      setRequirementSaveMessage(`已创建 ${normalizedTitle}`);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [currentProject?.id, knowledgeGroupOverrides, projectRootDir, refreshKnowledgeFilesystem, writeRequirementFile]);

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
    const currentFilePath = selectedRequirement.filePath;
    const currentDirectory = (currentFilePath ? getDirectoryPath(currentFilePath) : '') || projectRootDir;
    const nextFilePath =
      canPersistRequirementToDisk && currentDirectory
        ? joinDiskPath(currentDirectory, nextTitle)
        : selectedRequirement.filePath;
    const currentRelativePath = normalizeRelativePath(
      (currentFilePath && projectRootDir && getRelativePathFromRoot(currentFilePath, projectRootDir)) ||
        selectedRequirement.title
    );
    const nextRelativePath = normalizeRelativePath(
      (nextFilePath && projectRootDir && getRelativePathFromRoot(nextFilePath, projectRootDir)) || nextTitle
    );

    try {
      setIsSavingRequirement(true);

      if (canPersistRequirementToDisk && currentFilePath && nextFilePath && currentFilePath !== nextFilePath) {
        await removeRequirementFile(currentFilePath);
      }

      if (canPersistRequirementToDisk && nextFilePath) {
        await writeRequirementFile(nextFilePath, requirementDraftContent);
      }

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

      updateRequirementDoc(selectedRequirement.id, {
        title: nextTitle,
        content: requirementDraftContent,
        filePath: nextFilePath,
      });
      await refreshKnowledgeFilesystem(nextOverrides);
      setSelectedRequirementId(nextFilePath || selectedRequirement.id);
      if (selectedKnowledgeNode?.group && nextRelativePath) {
        setSelectedKnowledgeNodeId(`file:${selectedKnowledgeNode.group}:${nextRelativePath}`);
      }
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
  }, [
    canPersistRequirementToDisk,
    currentProject?.id,
    knowledgeGroupOverrides,
    projectRootDir,
    refreshKnowledgeFilesystem,
    removeRequirementFile,
    requirementDraftContent,
    requirementDraftTitle,
    selectedKnowledgeNode?.group,
    selectedRequirement,
    updateRequirementDoc,
    writeRequirementFile,
  ]);

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

    const relativePath = await writeSketchPageFile(currentProject.id, nextPage, null);
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

  const handleDeletePageById = useCallback(async (pageId: string) => {
    const page = designPages.find((item) => item.id === pageId);
    if (!page || !currentProject) {
      return;
    }

    if (!window.confirm(`确定删除页面“${page.name}”吗？该页面下的所有子页面都会一起删除。`)) {
      return;
    }

    if (!canUseProjectFilesystem) {
      deletePageStructureNode(pageId);
      if (selectedPage?.id === pageId) {
        setManualPageId(null);
        loadFromCode([]);
      }
      return;
    }

    try {
      await deleteSketchPageFile(currentProject.id, pageId);
      await refreshKnowledgeFilesystem();
      if (selectedPage?.id === pageId) {
        setManualPageId(null);
        loadFromCode([]);
      }
    } catch {
      return;
    }
  }, [canUseProjectFilesystem, currentProject, deletePageStructureNode, designPages, loadFromCode, refreshKnowledgeFilesystem, selectedPage]);

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

  const openKnowledgeEntry = useCallback((entryId: string) => {
    const node = findKnowledgeNodeByEntryId(knowledgeTree, entryId);
    if (node) {
      setSelectedKnowledgeNodeId(node.id);
    }
    setSelectedRequirementId(entryId);
    setSidebarTab('requirement');
  }, [knowledgeTree]);

  const toggleKnowledgeNode = useCallback((nodeId: string) => {
    setExpandedKnowledgeNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSelectKnowledgeNode = useCallback((node: KnowledgeTreeNode) => {
    setSelectedKnowledgeNodeId(node.id);
    setKnowledgeContextMenu(null);

    if (node.type === 'file') {
      if (node.entryId) {
        setSelectedRequirementId(node.entryId);
      }
      return;
    }

    toggleKnowledgeNode(node.id);
  }, [toggleKnowledgeNode]);

  const handleCreateKnowledgeFolder = useCallback(async (node: KnowledgeTreeNode) => {
    if (!projectRootDir) {
      return;
    }

    const folderName = window.prompt('输入文件夹名', '新建文件夹');
    if (!folderName) {
      return;
    }

    const basePath =
      node.type === 'folder' && node.path
        ? node.path
        : node.type === 'file' && node.path
          ? node.path.replace(/[\\/][^\\/]+$/, '')
          : projectRootDir;
    const nextFolderPath = joinDiskPath(basePath, folderName);
    const relativePath = normalizeRelativePath(getRelativePathFromRoot(nextFolderPath, projectRootDir) || folderName);

    try {
      await createKnowledgeFolder(nextFolderPath);
      const nextOverrides = {
        ...knowledgeGroupOverrides,
        [relativePath]: node.group,
      };
      setKnowledgeGroupOverrides(nextOverrides);
      writeKnowledgeGroupOverrides(currentProject?.id || null, nextOverrides);
      setExpandedKnowledgeNodeIds((current) => new Set(current).add(node.id));
      await refreshKnowledgeFilesystem(nextOverrides);
      setRequirementSaveMessage(`已创建文件夹 ${folderName}`);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [createKnowledgeFolder, currentProject?.id, knowledgeGroupOverrides, projectRootDir, refreshKnowledgeFilesystem]);

  const handleDeleteKnowledgeNode = useCallback(async (node: KnowledgeTreeNode) => {
    if (node.protected || !node.path) {
      return;
    }

    const label = node.type === 'folder'
      ? `文件夹“${node.label}”及其所有内容`
      : `文件“${node.label}”`;

    if (!window.confirm(`确定删除${label}吗？`)) {
      return;
    }

    try {
      await removeRequirementFile(node.path);
      const nextOverrides = { ...knowledgeGroupOverrides };
      const relativePath = node.relativePath || '';
      Object.keys(nextOverrides).forEach((key) => {
        if (key === relativePath || key.startsWith(`${relativePath}/`)) {
          delete nextOverrides[key];
        }
      });
      setKnowledgeGroupOverrides(nextOverrides);
      writeKnowledgeGroupOverrides(currentProject?.id || null, nextOverrides);
      if (
        node.type === 'file' && node.entryId ||
        (selectedKnowledgeNode?.relativePath &&
          relativePath &&
          selectedKnowledgeNode.relativePath.startsWith(relativePath))
      ) {
        setSelectedKnowledgeNodeId(null);
        setSelectedRequirementId(null);
      }
      await refreshKnowledgeFilesystem(nextOverrides);
      setRequirementSaveMessage(`已删除${label}`);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [currentProject?.id, knowledgeGroupOverrides, refreshKnowledgeFilesystem, removeRequirementFile, selectedKnowledgeNode?.relativePath]);

  const renderKnowledgeTree = (nodes: KnowledgeTreeNode[], depth = 0): ReactNode =>
    nodes.map((node) => {
      const isExpanded = expandedKnowledgeNodeIds.has(node.id);
      const isSelected = selectedKnowledgeNode?.id === node.id;
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.id} className="pm-knowledge-tree-node">
          <button
            className={`pm-knowledge-tree-row ${isSelected ? 'active' : ''} ${node.type} ${node.protected ? 'protected' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 10}px` }}
            onClick={() => handleSelectKnowledgeNode(node)}
            onContextMenu={(event) => {
              event.preventDefault();
              setKnowledgeContextMenu({ x: event.clientX, y: event.clientY, node });
            }}
            type="button"
          >
            <span
              className={`pm-knowledge-tree-caret ${hasChildren ? 'visible' : 'placeholder'} ${isExpanded ? 'expanded' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren || node.type === 'group') {
                  toggleKnowledgeNode(node.id);
                }
              }}
            >
              {hasChildren || node.type === 'group' ? '>' : ''}
            </span>
            <span className="pm-knowledge-tree-label">{node.label}</span>
          </button>
          {isExpanded && node.children.length > 0 ? renderKnowledgeTree(node.children, depth + 1) : null}
        </div>
      );
    });

  const handleUseKnowledgeForDesign = useCallback(() => {
    if (!selectedRequirement) {
      return;
    }

    setActiveKnowledgeFileId(selectedRequirement.id);
    setSidebarTab('page');
  }, [selectedRequirement, setActiveKnowledgeFileId]);

  const renderRequirementMain = () => (
    <div className="pm-viewer-stack">
      <section className="pm-card">
        <div className="pm-card-header">
          <div>
            <h3>知识库</h3>
          </div>
          <div className="pm-inline-actions">
            <button className="doc-action-btn secondary" type="button" onClick={() => void handleCreateKnowledgeFile('project')}>
              新建
            </button>
            <button className="doc-action-btn secondary" type="button" onClick={handleUploadClick}>
              上传
            </button>
          </div>
        </div>
        {selectedKnowledgeEntry ? (
          <div className="requirement-file-editor">
            <div className="requirement-file-meta">
              <div>
                <strong>{selectedKnowledgeEntry.title}</strong>
                <span>
                  {selectedKnowledgeEntry.type === 'html'
                    ? 'HTML 设计稿'
                    : selectedRequirement?.kind === 'sketch'
                      ? '草图 Markdown'
                      : selectedRequirement?.kind === 'spec'
                        ? '规范 Markdown'
                        : '知识 Markdown'}
                  {' / '}
                  {selectedKnowledgeEntry.status}
                  {' / '}
                  {new Date(selectedKnowledgeEntry.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="requirement-file-toolbar">
                {selectedRequirement ? (
                  <>
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
                    {selectedRequirement.kind === 'sketch' ? (
                      <button className="doc-action-btn secondary" type="button" onClick={handleUseKnowledgeForDesign}>
                        用于设计
                      </button>
                    ) : null}
                    <button className="doc-action-btn" type="button" onClick={handleDeleteRequirement}>
                      删除
                    </button>
                  </>
                ) : (
                  <>
                    {sourceKnowledgeEntry ? (
                      <button
                        className="doc-action-btn secondary"
                        type="button"
                        onClick={() => openKnowledgeEntry(sourceKnowledgeEntry.id)}
                      >
                        查看来源
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {selectedKnowledgeRelatedEntries.length > 0 || derivedKnowledgeEntries.length > 0 || sourceKnowledgeEntry ? (
              <div className="pm-knowledge-context-card">
                {sourceKnowledgeEntry ? (
                  <div className="pm-knowledge-meta-item">
                    <strong>来源草稿</strong>
                    <button className="pm-knowledge-link" type="button" onClick={() => openKnowledgeEntry(sourceKnowledgeEntry.id)}>
                      {sourceKnowledgeEntry.title}
                    </button>
                  </div>
                ) : null}
                {selectedKnowledgeRelatedEntries.length > 0 ? (
                  <div className="pm-knowledge-meta-item">
                    <strong>关联文件</strong>
                    <div className="pm-knowledge-link-list">
                      {selectedKnowledgeRelatedEntries.map((entry) => (
                        <button key={entry.id} className="pm-knowledge-link" type="button" onClick={() => openKnowledgeEntry(entry.id)}>
                          {entry.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {derivedKnowledgeEntries.length > 0 ? (
                  <div className="pm-knowledge-meta-item">
                    <strong>派生设计</strong>
                    <div className="pm-knowledge-link-list">
                      {derivedKnowledgeEntries.map((entry) => (
                        <button key={entry.id} className="pm-knowledge-link" type="button" onClick={() => openKnowledgeEntry(entry.id)}>
                          {entry.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedRequirement ? (
              requirementViewMode === 'edit' ? (
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
                    {requirementSaveMessage ? <span className="requirement-save-message">{requirementSaveMessage}</span> : null}
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
                  <article className="requirement-markdown-preview">{renderMarkdownPreview(selectedRequirement.content)}</article>
                </div>
              )
            ) : (
              <div className="pm-html-preview-shell">
                <iframe
                  className="pm-html-preview-frame"
                  title={selectedKnowledgeEntry.title}
                  srcDoc={selectedKnowledgeEntry.content}
                  sandbox="allow-scripts"
                />
                {selectedKnowledgeEntry.summary ? <div className="pm-html-preview-caption">{selectedKnowledgeEntry.summary}</div> : null}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">还没有知识文件。</div>
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
    <div className="product-workbench-shell" style={layoutStyle} onClick={() => setKnowledgeContextMenu(null)}>
      <aside className="pm-left-nav">
        <div className="pm-nav-header">
          <strong>{currentProject?.name || '产品工作台'}</strong>
        </div>

        <div className="pm-sidebar-tabs">
          <button className={sidebarTab === 'requirement' ? 'active' : ''} onClick={() => setSidebarTab('requirement')} type="button">
            知识库
          </button>
          <button className={sidebarTab === 'page' ? 'active' : ''} onClick={() => setSidebarTab('page')} type="button">
            页面
          </button>
        </div>

        {false && (
          <section className="pm-nav-section">
            <div className="pm-nav-section-header">
              <div className="pm-nav-title">
                {filteredKnowledgeEntries.length} / {knowledgeEntries.length} 条
              </div>
            </div>
            <input
              className="product-input pm-knowledge-search-input"
              type="search"
              value={knowledgeSearch}
              onChange={(event) => setKnowledgeSearch(event.target.value)}
              placeholder="搜索文档"
            />
            <div className="pm-knowledge-filter-tabs">
              <button
                className={knowledgeSourceFilter === 'all' ? 'active' : ''}
                type="button"
                onClick={() => setKnowledgeSourceFilter('all')}
              >
                全部
              </button>
              <button
                className={knowledgeSourceFilter === 'requirement' ? 'active' : ''}
                type="button"
                onClick={() => setKnowledgeSourceFilter('requirement')}
              >
                Markdown
              </button>
              <button
                className={knowledgeSourceFilter === 'generated' ? 'active' : ''}
                type="button"
                onClick={() => setKnowledgeSourceFilter('generated')}
              >
                设计稿
              </button>
            </div>
            <div className="pm-knowledge-list">
              {filteredKnowledgeEntries.length > 0 ? (
                filteredKnowledgeEntries.map((entry) => (
                  <button
                    key={entry.id}
                    className={`pm-nav-item pm-knowledge-nav-item ${selectedKnowledgeEntry?.id === entry.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedRequirementId(entry.id);
                    }}
                    type="button"
                  >
                    <strong>{entry.title}</strong>
                    {entry.summary ? <span className="pm-knowledge-summary">{entry.summary}</span> : null}
                    <div className="pm-knowledge-nav-meta">
                      <span>
                        {entry.type === 'html'
                          ? 'HTML'
                          : entry.kind === 'sketch'
                            ? '草图'
                            : entry.kind === 'spec'
                              ? '规范'
                              : '知识'}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="pm-page-tree-empty">没有匹配的知识条目</div>
              )}
            </div>
          </section>
        )}

        {sidebarTab === 'requirement' && (
          <section className="pm-nav-section">
            <div className="pm-nav-section-header">
              <div className="pm-nav-title">{knowledgeEntries.length} 条</div>
              <div className="pm-inline-actions">
                <button className="pm-nav-mini-action" type="button" onClick={() => void handleCreateKnowledgeFile('project')}>
                  + 文件
                </button>
              </div>
            </div>
            <input
              className="product-input pm-knowledge-search-input"
              type="search"
              value={knowledgeSearch}
              onChange={(event) => setKnowledgeSearch(event.target.value)}
              placeholder="搜索文档"
            />
            <div className="pm-knowledge-tree">
              {filteredKnowledgeTree.length > 0 ? renderKnowledgeTree(filteredKnowledgeTree) : (
                <div className="pm-page-tree-empty">没有匹配的知识条目</div>
              )}
            </div>
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

      {knowledgeContextMenu ? (
        <div
          className="pm-knowledge-context-menu"
          style={{ left: `${knowledgeContextMenu.x}px`, top: `${knowledgeContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="pm-knowledge-context-action"
            type="button"
            onClick={() => {
              void handleCreateKnowledgeFile(
                knowledgeContextMenu.node.group,
                knowledgeContextMenu.node.type === 'folder'
                  ? knowledgeContextMenu.node.path
                  : knowledgeContextMenu.node.type === 'file' && knowledgeContextMenu.node.path
                    ? knowledgeContextMenu.node.path.replace(/[\\/][^\\/]+$/, '')
                    : null
              );
              setKnowledgeContextMenu(null);
            }}
          >
            新建文件
          </button>
          <button
            className="pm-knowledge-context-action"
            type="button"
            onClick={() => {
              void handleCreateKnowledgeFolder(knowledgeContextMenu.node);
              setKnowledgeContextMenu(null);
            }}
          >
            新建文件夹
          </button>
          {!knowledgeContextMenu.node.protected ? (
            <button
              className="pm-knowledge-context-action danger"
              type="button"
              onClick={() => {
                void handleDeleteKnowledgeNode(knowledgeContextMenu.node);
                setKnowledgeContextMenu(null);
              }}
            >
              删除
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
