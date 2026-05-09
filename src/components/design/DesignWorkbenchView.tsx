import React, { useMemo } from 'react';
import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react';
import { buildDesignStyleReferencePath, buildSketchReferencePath } from '../../modules/knowledge/referenceFiles';
import {
  createWireframeModule,
  getWireframeModuleTypeLabel,
  getWireframeModuleVisualType,
  isMobileAppType,
} from '../../utils/wireframe';
import type { AppType, PageStructureNode, WireframeDocument } from '../../types';
import {
  getFallbackDesignStylePreset,
  resolveStyleNodeFilePath,
} from './designStylePackState';

type SketchLibraryTreeNode = {
  id: string;
  name: string;
  pageId: string;
  children: SketchLibraryTreeNode[];
};

export const DESIGN_STYLE_PALETTE_SIZE = 5;
export const DESIGN_BOARD_PADDING = 180;
const DESIGN_ZOOM_MIN = 0.35;
const DESIGN_ZOOM_MAX = 2.4;
export const DESIGN_ZOOM_STEP = 0.0015;
export const DESIGN_PAGE_CARD_WIDTH = 232;
export const DESIGN_PAGE_CARD_HEIGHT = 196;
export const DESIGN_FLOW_CARD_WIDTH = 220;
export const DESIGN_FLOW_CARD_HEIGHT = 132;
export const DESIGN_TEXT_CARD_WIDTH = 240;
export const DESIGN_TEXT_CARD_HEIGHT = 120;
export const DESIGN_STYLE_CARD_WIDTH = 320;
export const DESIGN_STYLE_CARD_HEIGHT = 228;
const DESIGN_NODE_GAP_X = 72;
const DESIGN_NODE_GAP_Y = 56;
const DESIGN_NODE_MAX_PER_ROW = 4;

const parseHexColor = (value: string): [number, number, number] | null => {
  const normalized = value.trim();
  const shortMatch = /^#([\da-f]{3})$/i.exec(normalized);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('').map((channel) => Number.parseInt(`${channel}${channel}`, 16));
    return [r, g, b];
  }

  const longMatch = /^#([\da-f]{6})$/i.exec(normalized);
  if (!longMatch) {
    return null;
  }

  return [
    Number.parseInt(longMatch[1].slice(0, 2), 16),
    Number.parseInt(longMatch[1].slice(2, 4), 16),
    Number.parseInt(longMatch[1].slice(4, 6), 16),
  ];
};

const withAlpha = (value: string, alpha: number, fallback: string) => {
  const channels = parseHexColor(value);
  if (!channels) {
    return fallback;
  }

  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
};

const normalizeHexColor = (value: string) => {
  const channels = parseHexColor(value);
  if (!channels) {
    return null;
  }

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const filterSketchLibraryTree = (nodes: SketchLibraryTreeNode[], query: string): SketchLibraryTreeNode[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = filterSketchLibraryTree(node.children, normalizedQuery);
    const matches = node.name.toLowerCase().includes(normalizedQuery);

    if (!matches && children.length === 0) {
      return [];
    }

    return [{ ...node, children }];
  });
};

const getDesignStyleVariant = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const getDesignStyleNodeTheme = (node: { palette: string[] }): CSSProperties => {
  const [surface = '#08111f', panel = '#123456', accent = '#7dd3fc', highlight = '#8b5cf6', text = '#f8fafc'] =
    node.palette;

  return {
    '--design-style-surface': surface,
    '--design-style-panel': panel,
    '--design-style-accent': accent,
    '--design-style-highlight': highlight,
    '--design-style-text': text,
    '--design-style-surface-soft': withAlpha(surface, 0.92, 'rgba(8, 17, 31, 0.92)'),
    '--design-style-panel-soft': withAlpha(panel, 0.84, 'rgba(18, 52, 86, 0.84)'),
    '--design-style-accent-soft': withAlpha(accent, 0.24, 'rgba(125, 211, 252, 0.24)'),
    '--design-style-highlight-soft': withAlpha(highlight, 0.2, 'rgba(139, 92, 246, 0.2)'),
    '--design-style-border': withAlpha(accent, 0.42, 'rgba(125, 211, 252, 0.42)'),
    '--design-style-glow': withAlpha(highlight, 0.24, 'rgba(139, 92, 246, 0.24)'),
    '--design-style-muted': withAlpha(text, 0.72, 'rgba(248, 250, 252, 0.72)'),
  } as CSSProperties;
};

const getSketchPreviewMetrics = (
  elements: Array<{ x: number; y: number; width: number; height: number }>,
  fallbackWidth: number,
  fallbackHeight: number
) => {
  const maxRight = elements.reduce(
    (current, element) => Math.max(current, element.x + Math.max(0, element.width)),
    fallbackWidth
  );
  const maxBottom = elements.reduce(
    (current, element) => Math.max(current, element.y + Math.max(0, element.height)),
    fallbackHeight
  );

  return {
    width: Math.max(fallbackWidth, maxRight + 24),
    height: Math.max(fallbackHeight, maxBottom + 24),
  };
};

const getSketchPreviewLabel = (element: { props: Record<string, unknown> }) =>
  String(element.props.name || element.props.title || element.props.text || '模块');

const getSketchPreviewContent = (element: { props: Record<string, unknown> }) =>
  String(element.props.content || element.props.placeholder || '').trim();

const getWireframeElementLabel = (element: { props: Record<string, unknown> }) =>
  String(element.props.name || element.props.title || element.props.text || '模块');

const escapeSketchPreviewSvgText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildSketchPreviewImage = (
  elements: Array<{ id: string; x: number; y: number; width: number; height: number; props: Record<string, unknown> }>,
  fallbackWidth: number,
  fallbackHeight: number
) => {
  if (elements.length === 0) {
    return null;
  }

  const previewMetrics = getSketchPreviewMetrics(elements, fallbackWidth, fallbackHeight);
  const textColor = '#0f172a';
  const mutedTextColor = 'rgba(15, 23, 42, 0.66)';
  const blocks = elements.slice(0, 12).map((element) => {
    const label = escapeSketchPreviewSvgText(getSketchPreviewLabel(element).slice(0, 28));
    const content = escapeSketchPreviewSvgText(getSketchPreviewContent(element).slice(0, 72));
    const isTextModule = getWireframeModuleVisualType(element.props.moduleType, element.props.content) === 'text';
    const width = Math.max(56, Math.round(element.width));
    const height = Math.max(40, Math.round(element.height));
    const headerHeight = Math.min(30, Math.max(18, Math.round(height * 0.32)));
    const labelY = Math.min(headerHeight - 6, 18);
    const contentY = headerHeight + 14;
    const textBaselineY = Math.max(18, Math.min(height - 8, 22));
    const textUnderlineWidth = Math.max(40, Math.min(width, label.length * 8 + 20));

    if (isTextModule) {
      return [
        `<g transform="translate(${Math.max(0, Math.round(element.x))} ${Math.max(0, Math.round(element.y))})">`,
        `<text x="0" y="${textBaselineY}" fill="${textColor}" font-size="12" font-weight="700" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${label}</text>`,
        `<rect y="${Math.max(textBaselineY + 4, 0)}" width="${textUnderlineWidth}" height="2" rx="1" fill="rgba(15, 23, 42, 0.24)" />`,
        '</g>',
      ].join('');
    }

    return [
      `<g transform="translate(${Math.max(0, Math.round(element.x))} ${Math.max(0, Math.round(element.y))})">`,
      `<rect width="${width}" height="${height}" rx="16" fill="#f8fbff" stroke="rgba(15, 23, 42, 0.08)" />`,
      `<rect width="${width}" height="${headerHeight}" rx="16" fill="#dde6f0" />`,
      `<rect y="${Math.max(0, headerHeight - 12)}" width="${width}" height="12" fill="#dde6f0" />`,
      `<text x="12" y="${labelY}" fill="${textColor}" font-size="12" font-weight="700" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${label}</text>`,
      content
        ? `<text x="12" y="${contentY}" fill="${mutedTextColor}" font-size="10" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${content}</text>`
        : '',
      '</g>',
    ].join('');
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${previewMetrics.width} ${previewMetrics.height}" width="${previewMetrics.width}" height="${previewMetrics.height}">`,
    '<defs>',
    '<linearGradient id="sketch-preview-bg" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#ffffff" />',
    '<stop offset="100%" stop-color="#f8fafc" />',
    '</linearGradient>',
    '</defs>',
    `<rect width="${previewMetrics.width}" height="${previewMetrics.height}" rx="28" fill="url(#sketch-preview-bg)" />`,
    blocks.join(''),
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const buildDesignPageModuleMarkdown = (
  page: PageStructureNode,
  wireframe: WireframeDocument | null | undefined
) => {
  const modules = (wireframe?.elements || []).map((element, index) => {
    const name = String(element.props.name || element.props.title || element.props.text || `模块 ${index + 1}`).trim();
    const content = String(element.props.content || element.props.placeholder || '').trim();
    const purpose = String(element.props.purpose || '').trim();
    const priority = String(element.props.priority || '').trim();
    const actions = Array.isArray(element.props.actions)
      ? element.props.actions
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];

    return {
      name: name || `模块 ${index + 1}`,
      type: getWireframeModuleTypeLabel(element.props.moduleType),
      x: Math.max(0, Math.round(element.x)),
      y: Math.max(0, Math.round(element.y)),
      width: Math.max(0, Math.round(element.width)),
      height: Math.max(0, Math.round(element.height)),
      purpose,
      priority,
      actions,
      content,
    };
  });

  return [
    `## ${page.name} 模块清单`,
    '',
    ...(modules.length > 0
      ? modules.flatMap((module) => [
          `- name: ${module.name}`,
          `  type: ${module.type}`,
          `  position: ${module.x}, ${module.y}`,
          `  size: ${module.width}, ${module.height}`,
          ...(module.purpose ? [`  purpose: ${module.purpose}`] : []),
          ...(module.actions.length > 0 ? [`  actions: ${module.actions.join(' / ')}`] : []),
          ...(module.priority ? [`  priority: ${module.priority}`] : []),
          `  content: ${module.content || '无'}`,
        ])
      : ['- 暂无模块']),
  ].join('\n');
};

export const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const getSketchPageFileName = (pageId: string) => {
  const normalized = pageId.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
};

export const buildSketchLibraryTree = (nodes: PageStructureNode[]): SketchLibraryTreeNode[] =>
  nodes.flatMap((node) => {
    const children = buildSketchLibraryTree(node.children);

    if (node.kind !== 'page') {
      return children;
    }

    return [
      {
        id: node.id,
        name: getSketchPageFileName(node.id),
        pageId: node.id,
        children,
      },
    ];
  });

export const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const buildFreeCanvasPosition = (index: number, width: number, height: number) => {
  const column = index % DESIGN_NODE_MAX_PER_ROW;
  const row = Math.floor(index / DESIGN_NODE_MAX_PER_ROW);

  return {
    x: 180 + column * (width + DESIGN_NODE_GAP_X),
    y: 160 + row * (height + DESIGN_NODE_GAP_Y),
  };
};

export const getDesignNodeTypeLabel = (type: 'page' | 'flow' | 'text' | 'ai' | 'style') => {
  if (type === 'page') {
    return 'Sketch';
  }

  if (type === 'flow') {
    return 'Flow';
  }

  if (type === 'text') {
    return 'Text';
  }

  if (type === 'ai') {
    return 'AI';
  }

  return 'Style';
};

export const summarizeDesignSelectionText = (value: string, maxLength = 88) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(1, maxLength - 3))}...` : normalized;
};

export const convertAINodesToTextNodes = (nodes: Array<{ title: string; prompt: string; x: number; y: number; width: number; height: number }>) =>
  nodes.map((node) => ({
    id: createId(),
    content: [node.title, node.prompt].filter(Boolean).join('\n\n'),
    x: node.x,
    y: node.y,
    width: Math.max(DESIGN_TEXT_CARD_WIDTH, Math.round(node.width)),
    height: Math.max(DESIGN_TEXT_CARD_HEIGHT + 28, Math.round(node.height)),
  }));

export const buildDesignDraftElements = (
  page: PageStructureNode,
  uiSpecSections: string[],
  prompt: string,
  appType?: AppType | null
) => {
  const isMobile = isMobileAppType(appType);
  const promptSummary = prompt.trim() || page.metadata.goal || page.description || 'AI 生成的页面目标摘要';
  const sectionA = uiSpecSections[0] || '核心信息区与导航结构';
  const sectionB = uiSpecSections[1] || '主体内容区与关键任务流';
  const sectionC = uiSpecSections[2] || '操作区与反馈信息';

  if (isMobile) {
    return [
      createWireframeModule({ name: `${page.name} 顶部栏`, x: 20, y: 28, width: 318, height: 92, content: promptSummary }, appType),
      createWireframeModule({ name: '主视觉区', x: 20, y: 138, width: 318, height: 148, content: sectionA }, appType),
      createWireframeModule({ name: '内容区块', x: 20, y: 306, width: 318, height: 214, content: sectionB }, appType),
      createWireframeModule({ name: '操作面板', x: 20, y: 540, width: 318, height: 158, content: sectionC }, appType),
      createWireframeModule({ name: '底部操作', x: 20, y: 718, width: 318, height: 88, content: '提交 / 下一步 / 状态反馈' }, appType),
    ];
  }

  return [
    createWireframeModule({ name: `${page.name} 顶部导航`, x: 36, y: 28, width: 1160, height: 84, content: promptSummary }, appType),
    createWireframeModule({ name: '侧边导航 / 筛选', x: 36, y: 136, width: 252, height: 536, content: sectionA }, appType),
    createWireframeModule({ name: '主内容区', x: 320, y: 136, width: 560, height: 536, content: sectionB }, appType),
    createWireframeModule({ name: '辅助信息区', x: 912, y: 136, width: 284, height: 536, content: sectionC }, appType),
  ];
};

export const collectSketchLibraryNodeIds = (nodes: SketchLibraryTreeNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...collectSketchLibraryNodeIds(node.children)]);

export const clampZoom = (zoom: number) => Math.min(DESIGN_ZOOM_MAX, Math.max(DESIGN_ZOOM_MIN, zoom));

export const normalizePatternOffset = (offset: number, size: number) => {
  if (!Number.isFinite(size) || size <= 0) {
    return 0;
  }

  const normalized = offset % size;
  return normalized < 0 ? normalized + size : normalized;
};

export const buildEdgePath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
  const curveOffset = Math.max(120, Math.abs(end.x - start.x) * 0.35);
  return `M ${start.x} ${start.y} C ${start.x + curveOffset} ${start.y}, ${end.x - curveOffset} ${end.y}, ${end.x} ${end.y}`;
};

type DesignWorkbenchViewProps = {
  builtinStylePackPaths: Set<string>;
  connectionDraftPath: string | null;
  defaultStylePresets: any[];
  designAINodes: any[];
  designBoardBounds: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  designBoardScrollRef: RefObject<HTMLDivElement | null>;
  designCamera: {
    x: number;
    y: number;
  };
  designCanvasContextMenu: any;
  designCanvasMode: 'pan' | 'select';
  designCanvasPreset: {
    width: number;
    height: number;
  };
  designCanvasSelection: any;
  designContextMenuRef: RefObject<HTMLDivElement | null>;
  designFlowNodes: any[];
  designFlowPaths: Array<{ id: string; d: string }>;
  designGridMetrics: {
    minorSize: number;
    majorSize: number;
    minorOffsetX: number;
    minorOffsetY: number;
    majorOffsetX: number;
    majorOffsetY: number;
  };
  designNodeLayers: Record<string, number>;
  designPageNodes: any[];
  designPages: any[];
  designSelectionIds: string[];
  designSelectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  designStyleNodes: any[];
  designTextNodes: any[];
  designZoom: number;
  expandedSketchLibraryNodeIds: Set<string>;
  handleAddDesignPage: () => void;
  handleAddFlowNode: () => void;
  handleAddPageReferenceNode: (pageId: string) => void;
  handleAddStyleNode: (...args: any[]) => void;
  handleAddTextNode: () => void;
  handleApplyStyleMarkdown: () => void;
  handleCanvasNodeClick: (...args: any[]) => void;
  handleConnectorPointerDown: (...args: any[]) => void;
  handleDeleteSelectedAINode: () => void;
  handleDeleteSelectedFlowNode: () => void;
  handleDeleteSelectedPageNode: () => void;
  handleDeleteSelectedStyleNode: () => void;
  handleDeleteSelectedTextNode: () => void;
  handleDesignBoardContextMenu: (...args: any[]) => void;
  handleDesignBoardPointerDown: (...args: any[]) => void;
  handleDesignBoardWheel: (...args: any[]) => void;
  handleDesignNodeContextMenu: (...args: any[]) => void;
  handleDesignNodePointerDown: (...args: any[]) => void;
  handleFlowNodeUpdate: (...args: any[]) => void;
  handleGenerateDelivery: () => void;
  handleGenerateDesignDraft: () => void;
  handleOpenPageModules: (pageId: string) => void;
  handlePageNodeUpdate: (...args: any[]) => void;
  handleResetStyleMarkdown: () => void;
  handleScrollableAreaWheel: (...args: any[]) => void;
  handleStyleNodeUpdate: (...args: any[]) => void;
  handleStylePaletteColorChange: (index: number, value: string) => void;
  handleTextNodeUpdate: (...args: any[]) => void;
  isCanvasPanning: boolean;
  isConnectorMode: boolean;
  isPageSelected: boolean;
  isSketchLibraryOpen: boolean;
  isSpacePressed: boolean;
  pendingConnectionStartId: string | null;
  renderDesignResizeHandles: (...args: any[]) => React.ReactNode;
  sketchLibraryTree: SketchLibraryTreeNode[];
  selectedDesignPage: any;
  selectedDesignPageId: string | null;
  selectedFlowNode: any;
  selectedStyleNode: any;
  selectedTextNode: any;
  selectedWireframe: any;
  setDesignAINodes: Dispatch<SetStateAction<any[]>>;
  setDesignCanvasContextMenu: Dispatch<SetStateAction<any>>;
  setDesignCanvasMode: Dispatch<SetStateAction<'pan' | 'select'>>;
  setDesignFlowNodes: Dispatch<SetStateAction<any[]>>;
  setDesignTextNodes: Dispatch<SetStateAction<any[]>>;
  setExpandedSketchLibraryNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setIsConnectorMode: Dispatch<SetStateAction<boolean>>;
  setIsSketchLibraryOpen: Dispatch<SetStateAction<boolean>>;
  setPendingConnectionStartId: Dispatch<SetStateAction<string | null>>;
  setSketchLibrarySearch: Dispatch<SetStateAction<string>>;
  setStyleInspectorMode: Dispatch<SetStateAction<'fields' | 'markdown'>>;
  setStyleMarkdownDraft: Dispatch<SetStateAction<string>>;
  sketchLibrarySearch: string;
  selectTextNode: (nodeId: string) => void;
  styleInspectorMode: 'fields' | 'markdown';
  styleMarkdownDraft: string;
  stylePresets: any[];
  uiSpecs: any[];
  wireframes: Record<string, any>;
};

type SketchLibraryTreeItemProps = {
  depth: number;
  expandedNodeIds: Set<string>;
  isSearching: boolean;
  node: SketchLibraryTreeNode;
  onSelect: (pageId: string) => void;
  onToggle: (id: string) => void;
  selectedPageId: string | null;
};

const PointerToolGlyph = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M5.75 3.25L17.92 13.18L12.61 13.86L15.56 20.06L12.98 21.25L10.02 15L5.75 19.24V3.25Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HandToolGlyph = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M8.8 12V6.7C8.8 5.76 9.56 5 10.5 5C11.44 5 12.2 5.76 12.2 6.7V10.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.2 10.5V5.55C12.2 4.69 12.89 4 13.75 4C14.61 4 15.3 4.69 15.3 5.55V10.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.3 10.5V6.85C15.3 5.94 16.04 5.2 16.95 5.2C17.86 5.2 18.6 5.94 18.6 6.85V13.35C18.6 17.18 15.73 20 12.1 20C8.75 20 6.45 17.88 5.92 14.86L5.2 10.82C5.04 9.95 5.61 9.12 6.48 8.96C7.31 8.81 8.11 9.28 8.39 10.08L8.8 12Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SketchLibraryTreeItem: React.FC<SketchLibraryTreeItemProps> = ({
  depth,
  expandedNodeIds,
  isSearching,
  node,
  onSelect,
  onToggle,
  selectedPageId,
}) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = isSearching || expandedNodeIds.has(node.id);

  return (
    <div className="design-sketch-tree-node">
      <div className="design-sketch-tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
        {hasChildren ? (
          <button
            className="design-sketch-tree-toggle"
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? `收起 ${node.name}` : `展开 ${node.name}`}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="design-sketch-tree-toggle-placeholder" />
        )}
        <button
          className={`design-sketch-tree-item ${selectedPageId === node.pageId ? 'active' : ''}`}
          type="button"
          onClick={() => onSelect(node.pageId)}
        >
          {node.name}
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className="design-sketch-tree-children">
          {node.children.map((child) => (
            <SketchLibraryTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              isSearching={isSearching}
              selectedPageId={selectedPageId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const DesignWorkbenchView: React.FC<DesignWorkbenchViewProps> = ({
  builtinStylePackPaths,
  connectionDraftPath,
  defaultStylePresets,
  designAINodes,
  designBoardBounds,
  designBoardScrollRef,
  designCamera,
  designCanvasContextMenu,
  designCanvasMode,
  designCanvasPreset,
  designCanvasSelection,
  designContextMenuRef,
  designFlowNodes,
  designFlowPaths,
  designGridMetrics,
  designNodeLayers,
  designPageNodes,
  designPages,
  designSelectionIds,
  designSelectionRect,
  designStyleNodes,
  designTextNodes,
  designZoom,
  expandedSketchLibraryNodeIds,
  handleAddDesignPage,
  handleAddFlowNode,
  handleAddPageReferenceNode,
  handleAddStyleNode,
  handleAddTextNode,
  handleApplyStyleMarkdown,
  handleCanvasNodeClick,
  handleConnectorPointerDown,
  handleDeleteSelectedAINode,
  handleDeleteSelectedFlowNode,
  handleDeleteSelectedPageNode,
  handleDeleteSelectedStyleNode,
  handleDeleteSelectedTextNode,
  handleDesignBoardContextMenu,
  handleDesignBoardPointerDown,
  handleDesignBoardWheel,
  handleDesignNodeContextMenu,
  handleDesignNodePointerDown,
  handleFlowNodeUpdate,
  handleGenerateDelivery,
  handleGenerateDesignDraft,
  handleOpenPageModules,
  handlePageNodeUpdate,
  handleResetStyleMarkdown,
  handleScrollableAreaWheel,
  handleStyleNodeUpdate,
  handleStylePaletteColorChange,
  handleTextNodeUpdate,
  isCanvasPanning,
  isConnectorMode,
  isPageSelected,
  isSketchLibraryOpen,
  isSpacePressed,
  pendingConnectionStartId,
  renderDesignResizeHandles,
  sketchLibraryTree,
  selectedDesignPage,
  selectedDesignPageId,
  selectedFlowNode,
  selectedStyleNode,
  selectedTextNode,
  selectedWireframe,
  setDesignAINodes,
  setDesignCanvasContextMenu,
  setDesignCanvasMode,
  setDesignFlowNodes,
  setDesignTextNodes,
  setExpandedSketchLibraryNodeIds,
  setIsConnectorMode,
  setIsSketchLibraryOpen,
  setPendingConnectionStartId,
  setSketchLibrarySearch,
  setStyleInspectorMode,
  setStyleMarkdownDraft,
  sketchLibrarySearch,
  selectTextNode,
  styleInspectorMode,
  styleMarkdownDraft,
  stylePresets,
  uiSpecs,
  wireframes,
}) => {
  const normalizedSketchLibrarySearch = sketchLibrarySearch.trim();
  const filteredSketchLibraryTree = useMemo(
    () => filterSketchLibraryTree(sketchLibraryTree, normalizedSketchLibrarySearch),
    [normalizedSketchLibrarySearch, sketchLibraryTree]
  );
  const isSearchingSketchLibrary = normalizedSketchLibrarySearch.length > 0;
  const selectedDesignPageModuleMarkdown = useMemo(
    () => (selectedDesignPage ? buildDesignPageModuleMarkdown(selectedDesignPage, selectedWireframe) : ''),
    [selectedDesignPage, selectedWireframe]
  );
  const selectedSketchFilePath = useMemo(
    () => (selectedDesignPage ? buildSketchReferencePath(selectedDesignPage) : ''),
    [selectedDesignPage]
  );
  const selectedStylePaletteEditor = useMemo(() => {
    if (!selectedStyleNode) {
      return [];
    }

    return Array.from({ length: Math.max(DESIGN_STYLE_PALETTE_SIZE, selectedStyleNode.palette.length) }, (_, index) => {
      const fallbackColor = getFallbackDesignStylePreset(stylePresets.length > 0 ? stylePresets : defaultStylePresets).palette[index] || '#ffffff';
      return (
        normalizeHexColor(selectedStyleNode.palette[index] || fallbackColor) ||
        normalizeHexColor(fallbackColor) ||
        '#ffffff'
      );
    });
  }, [defaultStylePresets, selectedStyleNode, stylePresets]);
  const selectedStylePackFilePath = useMemo(
    () =>
      selectedStyleNode
        ? buildDesignStyleReferencePath({
            id: selectedStyleNode.id,
            title: selectedStyleNode.title,
            filePath: resolveStyleNodeFilePath(selectedStyleNode, stylePresets),
          })
        : '',
    [selectedStyleNode, stylePresets]
  );
  const selectedStylePackFileSourceLabel = useMemo(() => {
    if (!selectedStylePackFilePath) {
      return '';
    }

    return builtinStylePackPaths.has(selectedStylePackFilePath) ? '内置样式包' : '项目样式包';
  }, [builtinStylePackPaths, selectedStylePackFilePath]);

  return (
    <div className="design-system-view">
    <div className="design-workbench-shell design-workbench-shell-full">
      <div className="design-workbench-canvas design-workbench-canvas-full design-free-canvas-shell">
        <div className="design-workbench-topbar design-workbench-topbar-floating">
          <div className="design-workbench-actions">
            <div className="design-workbench-action-group">
              <button
                className="doc-action-btn secondary"
                onClick={() => setIsSketchLibraryOpen((current) => !current)}
                type="button"
              >
                草图库
              </button>
              <button className="doc-action-btn secondary" onClick={handleAddDesignPage} type="button">
                新增草图页
              </button>
              <button className="doc-action-btn secondary" onClick={handleAddFlowNode} type="button">
                新增流程节点
              </button>
              <button
                className={`doc-action-btn secondary design-workbench-action-hidden ${isConnectorMode ? 'active' : ''}`}
                onClick={() => {
                  setIsConnectorMode((current) => !current);
                  setPendingConnectionStartId(null);
                }}
                type="button"
              >
                {isConnectorMode ? '退出连线' : '开始连线'}
              </button>
            </div>
            <div className="design-workbench-action-group design-workbench-action-group-primary">
              <button className="doc-action-btn secondary" onClick={handleGenerateDelivery} type="button">
                更新交付物
              </button>
              <button className="doc-action-btn" onClick={handleGenerateDesignDraft} type="button" disabled={!isPageSelected}>
                生成 UI 草图
              </button>
            </div>
          </div>
        </div>

        <div className="design-canvas-toolbar" aria-label="Canvas controls">
          <button
            className={`doc-action-btn secondary design-canvas-tool-btn ${designCanvasMode === 'select' ? 'active' : ''}`}
            onClick={() => setDesignCanvasMode('select')}
            type="button"
            aria-label="指针模式"
            title="指针模式"
          >
            <PointerToolGlyph />
          </button>
          <span className="design-canvas-toolbar-meta">{Math.round(designZoom * 100)}%</span>
          <button
            className={`doc-action-btn secondary design-canvas-tool-btn ${designCanvasMode === 'pan' ? 'active' : ''}`}
            onClick={() => setDesignCanvasMode('pan')}
            type="button"
            aria-label="抓手模式"
            title="抓手模式"
          >
            <HandToolGlyph />
          </button>
        </div>

        <section className="design-workbench-note design-workbench-note-floating design-status-card">
          <span className="design-workbench-note-dot"></span>
          <strong>{selectedWireframe?.elements?.length ? '当前页面已有草图' : '当前页面还没有草图'}</strong>
          <p>
            {isConnectorMode
              ? pendingConnectionStartId
                ? '继续点击目标节点，完成这条流程连线。'
                : '先点一个起点，再点一个终点，就会建立页面/流程关系。'
              : isPageSelected
                ? `${selectedDesignPage?.name} 已选中，可以继续编辑信息或生成 UI 草图。`
                : selectedFlowNode
                  ? '当前选中的是流程节点，可以编辑节点说明或继续布置流程。'
                  : selectedStyleNode
                    ? '当前选中的是样式节点，可以把这组视觉风格连接给页面节点，作为生成 UI 的风格约束。'
                    : `当前为${designCanvasMode === 'select' ? '框选' : '拖拽'}模式，可在顶部切换。`}
          </p>
        </section>

        <aside className="design-inspector-panel">
          <div className="design-inspector-card">
            <div className="design-inspector-head">
              <strong>
                {designCanvasSelection?.type === 'page'
                  ? '草图页信息'
                  : designCanvasSelection?.type === 'flow'
                    ? '流程节点信息'
                    : designCanvasSelection?.type === 'style'
                      ? '样式节点信息'
                      : '设计面板'}
              </strong>
              <span>
                {designCanvasSelection?.type === 'page'
                  ? 'Page'
                  : designCanvasSelection?.type === 'flow'
                    ? 'Flow'
                    : designCanvasSelection?.type === 'text'
                      ? 'Text'
                      : designCanvasSelection?.type === 'style'
                        ? 'Style'
                        : 'Canvas'}
              </span>
            </div>

            {designCanvasSelection?.type === 'page' && selectedDesignPage ? (
              <div className="design-inspector-form">
                <label className="pm-field-stack">
                  <span>页面名称</span>
                  <input
                    className="product-input pm-page-form-input"
                    value={selectedDesignPage.name}
                    onChange={(event) => handlePageNodeUpdate({ name: event.target.value })}
                  />
                </label>
                <label className="pm-field-stack">
                  <span>页面目标</span>
                  <textarea
                    className="product-textarea compact pm-page-description-input"
                    value={selectedDesignPage.description}
                    onChange={(event) => handlePageNodeUpdate({ description: event.target.value })}
                  />
                </label>
                <label className="pm-field-stack">
                  <span>路由</span>
                  <input
                    className="product-input pm-page-form-input"
                    value={selectedDesignPage.metadata.route}
                    onChange={(event) =>
                      handlePageNodeUpdate({
                        metadata: { route: event.target.value },
                      })
                    }
                  />
                </label>
                <div className="design-module-summary">
                  <div className="design-module-summary-head">
                    <strong>
                      {selectedWireframe?.elements?.length
                        ? `已生成 ${selectedWireframe.elements.length} 个模块`
                        : '当前还没有模块'}
                    </strong>
                    <button
                      className="doc-action-btn secondary"
                      type="button"
                      onClick={() => handleOpenPageModules(selectedDesignPage.id)}
                    >
                      打开模块画布
                    </button>
                  </div>
                  {selectedWireframe?.elements?.length ? (
                    <div className="design-module-list">
                      {selectedWireframe.elements.slice(0, 6).map((element: any, index: number) => (
                        <div className="design-module-list-item" key={element.id}>
                          <strong>{getWireframeElementLabel(element)}</strong>
                          <span>
                            {String(element.props.purpose || '').trim() ||
                              `${Math.round(element.width)} x ${Math.round(element.height)} · 模块 ${index + 1}`}
                          </span>
                        </div>
                      ))}
                      {selectedWireframe.elements.length > 6 ? (
                        <span className="design-module-list-more">
                          还有 {selectedWireframe.elements.length - 6} 个模块，进入画布后可继续编辑。
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="design-style-markdown-hint">
                      可以先让 AI 生成草图，或者直接进入模块画布手动添加模块。
                    </span>
                  )}
                </div>
                <label className="pm-field-stack">
                  <span>模块清单 Markdown</span>
                  <textarea
                    className="product-textarea pm-markdown-editor"
                    value={selectedDesignPageModuleMarkdown}
                    readOnly
                  />
                </label>
                <span className="design-style-markdown-hint">基于当前草图实时生成，可选中节点喂给AI</span>
                <div className="design-linked-file">
                  <span>当前草图文件</span>
                  <code>{selectedSketchFilePath}</code>
                </div>
              </div>
            ) : null}

            {designCanvasSelection?.type === 'flow' && selectedFlowNode ? (
              <div className="design-inspector-form">
                <label className="pm-field-stack">
                  <span>节点标题</span>
                  <input
                    className="product-input pm-page-form-input"
                    value={selectedFlowNode.title}
                    onChange={(event) => handleFlowNodeUpdate({ title: event.target.value })}
                  />
                </label>
                <label className="pm-field-stack">
                  <span>节点说明</span>
                  <textarea
                    className="product-textarea compact pm-page-description-input"
                    value={selectedFlowNode.description}
                    onChange={(event) => handleFlowNodeUpdate({ description: event.target.value })}
                  />
                </label>
                <button className="doc-action-btn secondary danger" onClick={handleDeleteSelectedFlowNode} type="button">
                  删除流程节点
                </button>
              </div>
            ) : null}

            {designCanvasSelection?.type === 'text' && selectedTextNode ? (
              <div className="design-inspector-form">
                <label className="pm-field-stack">
                  <span>文本内容</span>
                  <textarea
                    className="product-textarea compact pm-page-description-input"
                    value={selectedTextNode.content}
                    onChange={(event) => handleTextNodeUpdate({ content: event.target.value })}
                  />
                </label>
                <button className="doc-action-btn secondary danger" onClick={handleDeleteSelectedTextNode} type="button">
                  删除文本节点
                </button>
              </div>
            ) : null}

            {designCanvasSelection?.type === 'style' && selectedStyleNode ? (
              <div className="design-inspector-form">
                <div className="design-linked-file">
                  <span>当前样式包文件</span>
                  <code>{selectedStylePackFilePath}</code>
                </div>
                {selectedStylePackFileSourceLabel ? (
                  <span className="design-style-markdown-hint">{selectedStylePackFileSourceLabel}</span>
                ) : null}
                <div className="design-style-editor-switch">
                  <button
                    className={`doc-action-btn secondary ${styleInspectorMode === 'fields' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setStyleInspectorMode('fields')}
                  >
                    字段
                  </button>
                  <button
                    className={`doc-action-btn secondary ${styleInspectorMode === 'markdown' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setStyleInspectorMode('markdown')}
                  >
                    Markdown
                  </button>
                </div>
                {styleInspectorMode === 'fields' ? (
                  <>
                    <label className="pm-field-stack">
                      <span>样式标题</span>
                      <input
                        className="product-input pm-page-form-input"
                        value={selectedStyleNode.title}
                        onChange={(event) => handleStyleNodeUpdate({ title: event.target.value })}
                      />
                    </label>
                    <label className="pm-field-stack">
                      <span>样式摘要</span>
                      <textarea
                        className="product-textarea compact pm-page-description-input"
                        value={selectedStyleNode.summary}
                        onChange={(event) => handleStyleNodeUpdate({ summary: event.target.value })}
                      />
                    </label>
                    <label className="pm-field-stack">
                      <span>关键词</span>
                      <input
                        className="product-input pm-page-form-input"
                        value={selectedStyleNode.keywords.join(', ')}
                        onChange={(event) =>
                          handleStyleNodeUpdate({
                            keywords: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                    <label className="pm-field-stack">
                      <span>配色</span>
                      <input
                        className="product-input pm-page-form-input"
                        value={selectedStyleNode.palette.join(', ')}
                        onChange={(event) =>
                          handleStyleNodeUpdate({
                            palette: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                    <div className="design-style-palette-editor">
                      {selectedStylePaletteEditor.map((color: string, index: number) => (
                        <label key={`${selectedStyleNode.id}-palette-${index}`} className="design-style-palette-swatch">
                          <span>颜色 {index + 1}</span>
                          <input
                            type="color"
                            value={color}
                            onChange={(event) => handleStylePaletteColorChange(index, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="pm-field-stack">
                      <span>AI 样式提示</span>
                      <textarea
                        className="product-textarea compact pm-page-description-input"
                        value={selectedStyleNode.prompt}
                        onChange={(event) => handleStyleNodeUpdate({ prompt: event.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="pm-field-stack">
                      <span>Markdown 内容</span>
                      <textarea
                        className="product-textarea pm-markdown-editor"
                        value={styleMarkdownDraft}
                        onChange={(event) => setStyleMarkdownDraft(event.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <span className="design-style-markdown-hint">
                      支持直接编辑 Style Pack v1 Markdown；会优先解析固定 frontmatter 和标准章节，并同步回节点字段。
                    </span>
                    <div className="design-style-markdown-actions">
                      <button className="doc-action-btn" type="button" onClick={handleApplyStyleMarkdown}>
                        应用 Markdown
                      </button>
                      <button className="doc-action-btn secondary" type="button" onClick={handleResetStyleMarkdown}>
                        重置内容
                      </button>
                    </div>
                  </>
                )}
                <button className="doc-action-btn secondary danger" onClick={handleDeleteSelectedStyleNode} type="button">
                  删除样式节点
                </button>
              </div>
            ) : null}

            {!designCanvasSelection ? (
              <div className="design-inspector-empty">
                <p>这里会显示当前选中节点的可编辑信息。</p>
              </div>
            ) : null}
          </div>
        </aside>

        {isSketchLibraryOpen ? (
          <aside className="design-sketch-library">
            <div className="design-sketch-library-head">
              <strong>草图库</strong>
              <button className="doc-action-btn secondary" type="button" onClick={() => setIsSketchLibraryOpen(false)}>
                收起
              </button>
            </div>
            <label className="design-sketch-library-search">
              <span>搜索页面</span>
              <input
                type="text"
                value={sketchLibrarySearch}
                onChange={(event) => setSketchLibrarySearch(event.target.value)}
                placeholder="输入页面名称"
              />
            </label>
            <div className="design-sketch-library-list">
              {filteredSketchLibraryTree.length > 0 ? (
                filteredSketchLibraryTree.map((node) => (
                  <SketchLibraryTreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    expandedNodeIds={expandedSketchLibraryNodeIds}
                    isSearching={isSearchingSketchLibrary}
                    selectedPageId={selectedDesignPageId}
                    onToggle={(id) =>
                      setExpandedSketchLibraryNodeIds((current) => {
                        const next = new Set(current);
                        if (next.has(id)) {
                          next.delete(id);
                        } else {
                          next.add(id);
                        }
                        return next;
                      })
                    }
                    onSelect={handleAddPageReferenceNode}
                  />
                ))
              ) : (
                <div className="design-sketch-library-empty">没有找到匹配的页面。</div>
              )}
            </div>
          </aside>
        ) : null}

        {!isSketchLibraryOpen ? (
          <button className="design-sketch-library-toggle" type="button" onClick={() => setIsSketchLibraryOpen(true)}>
            展开草图库
          </button>
        ) : null}

        <div
          className={`design-board-scroll ${isSpacePressed ? 'is-space-panning' : ''} ${isCanvasPanning ? 'is-panning' : ''} ${designCanvasMode === 'select' ? 'is-select-mode' : ''}`}
          ref={designBoardScrollRef}
          onPointerDown={handleDesignBoardPointerDown}
          onWheel={handleDesignBoardWheel}
          onContextMenu={handleDesignBoardContextMenu}
          style={
            {
              '--design-board-grid-size': `${designGridMetrics.minorSize}px`,
              '--design-board-grid-major-size': `${designGridMetrics.majorSize}px`,
              '--design-board-grid-offset-x': `${designGridMetrics.minorOffsetX}px`,
              '--design-board-grid-offset-y': `${designGridMetrics.minorOffsetY}px`,
              '--design-board-grid-major-offset-x': `${designGridMetrics.majorOffsetX}px`,
              '--design-board-grid-major-offset-y': `${designGridMetrics.majorOffsetY}px`,
            } as CSSProperties
          }
        >
          <div
            className="design-board-surface"
            style={
              {
                '--design-board-camera-x': `${designCamera.x}px`,
                '--design-board-camera-y': `${designCamera.y}px`,
                '--design-board-scale': designZoom,
              } as CSSProperties
            }
          >
            <svg
              className="design-board-links"
              style={{
                left: `${designBoardBounds.minX}px`,
                top: `${designBoardBounds.minY}px`,
                width: `${designBoardBounds.width}px`,
                height: `${designBoardBounds.height}px`,
              }}
              viewBox={`${designBoardBounds.minX} ${designBoardBounds.minY} ${designBoardBounds.width} ${designBoardBounds.height}`}
              preserveAspectRatio="none"
            >
              {designFlowPaths.map((path) => (
                <path key={path.id} d={path.d} />
              ))}
              {connectionDraftPath ? <path d={connectionDraftPath} className="design-board-link-draft" /> : null}
            </svg>

            {designPageNodes.map((node: any) => {
              const page = designPages.find((item: any) => item.id === node.pageId);
              if (!page) {
                return null;
              }

              const pageSpec = uiSpecs.find((spec: any) => spec.pageId === page.id) || null;
              const pageWireframe = wireframes[page.id] || null;
              const pageWireframeElements = pageWireframe?.elements || [];
              const pagePreviewImage = buildSketchPreviewImage(
                pageWireframeElements,
                designCanvasPreset.width,
                designCanvasPreset.height
              );
              const active = designCanvasSelection?.type === 'page' && designCanvasSelection.id === node.id;
              const selected = designSelectionIds.includes(node.id);
              const layer = designNodeLayers[node.id] || 1;

              return (
                <div
                  key={node.id}
                  className={`design-node-card design-page-card ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    minHeight: `${node.height}px`,
                    zIndex: layer,
                  }}
                  data-design-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => handleDesignNodePointerDown(node.id, 'page', event)}
                  onContextMenu={(event) => handleDesignNodeContextMenu(node.id, 'page', event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCanvasNodeClick(node.id, 'page');
                    }
                  }}
                >
                  <div className="design-node-card-top">
                    <span className="design-node-chip design-node-control">Ref</span>
                    <span className="design-node-type">Sketch Page</span>
                  </div>

                  <div className="design-flow-card-title">
                    <strong>{page.name}</strong>
                    <span>{page.metadata.template}</span>
                  </div>

                  <div className="design-flow-card-frame">
                    <div className="design-flow-card-browser">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>

                    <div className="design-flow-card-preview">
                      {pagePreviewImage ? (
                        <img
                          className="design-flow-card-preview-image"
                          src={pagePreviewImage}
                          alt={`${page.name} 草图缩略图`}
                          draggable={false}
                        />
                      ) : (
                        <>
                          <div className="design-flow-card-block placeholder top" />
                          <div className="design-flow-card-block placeholder left" />
                          <div className="design-flow-card-block placeholder main" />
                        </>
                      )}
                    </div>
                  </div>

                  <div className="design-flow-card-meta">
                    <span>{pageSpec?.route || page.metadata.route}</span>
                    <span>{pageWireframeElements.length || 0} 个模块</span>
                  </div>
                  <div className="design-flow-card-actions">
                    <button
                      className="doc-action-btn secondary design-flow-card-action-btn"
                      type="button"
                      tabIndex={-1}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenPageModules(page.id);
                      }}
                    >
                      编辑模块
                    </button>
                  </div>
                  <button className="design-node-handle design-node-handle-left" type="button" tabIndex={-1} aria-label="输入端点" />
                  <button
                    className="design-node-handle design-node-handle-right"
                    type="button"
                    tabIndex={-1}
                    aria-label="输出端点"
                    onPointerDown={(event) => handleConnectorPointerDown(node.id, event)}
                  />
                  {renderDesignResizeHandles(node.id, 'page', node.x, node.y, node.width, node.height)}
                </div>
              );
            })}

            {designFlowNodes.map((node: any) => {
              const active = designCanvasSelection?.type === 'flow' && designCanvasSelection.id === node.id;
              const selected = designSelectionIds.includes(node.id);
              const layer = designNodeLayers[node.id] || 1;

              return (
                <div
                  key={node.id}
                  className={`design-node-card design-flow-node ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    minHeight: `${node.height}px`,
                    zIndex: layer,
                  }}
                  data-design-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => handleDesignNodePointerDown(node.id, 'flow', event)}
                  onContextMenu={(event) => handleDesignNodeContextMenu(node.id, 'flow', event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCanvasNodeClick(node.id, 'flow');
                    }
                  }}
                >
                  <div className="design-node-card-top">
                    <span className="design-node-chip design-node-control">Flow</span>
                    <span className="design-node-type">Flow Node</span>
                  </div>
                  <div className="design-flow-node-body">
                    <input
                      className="design-node-inline-input"
                      value={node.title}
                      onChange={(event) =>
                        setDesignFlowNodes((current) =>
                          current.map((item) => (item.id === node.id ? { ...item, title: event.target.value } : item))
                        )
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                    <textarea
                      className="design-node-inline-textarea"
                      value={node.description}
                      onChange={(event) =>
                        setDesignFlowNodes((current) =>
                          current.map((item) => (item.id === node.id ? { ...item, description: event.target.value } : item))
                        )
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <button className="design-node-handle design-node-handle-left" type="button" tabIndex={-1} aria-label="输入端点" />
                  <button
                    className="design-node-handle design-node-handle-right"
                    type="button"
                    tabIndex={-1}
                    aria-label="输出端点"
                    onPointerDown={(event) => handleConnectorPointerDown(node.id, event)}
                  />
                  {renderDesignResizeHandles(node.id, 'flow', node.x, node.y, node.width, node.height)}
                </div>
              );
            })}

            {designTextNodes.map((node: any) => {
              const active = designCanvasSelection?.type === 'text' && designCanvasSelection.id === node.id;
              const selected = designSelectionIds.includes(node.id);
              const layer = designNodeLayers[node.id] || 1;

              return (
                <div
                  key={node.id}
                  className={`design-node-card design-text-node ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    minHeight: `${node.height}px`,
                    zIndex: layer,
                  }}
                  data-design-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => handleDesignNodePointerDown(node.id, 'text', event)}
                  onContextMenu={(event) => handleDesignNodeContextMenu(node.id, 'text', event)}
                  onDoubleClick={() => selectTextNode(node.id)}
                >
                  <div className="design-node-card-top">
                    <span className="design-node-chip design-node-control">Text</span>
                    <span className="design-node-type">Text</span>
                  </div>
                  <textarea
                    className="design-node-inline-textarea design-text-inline-editor"
                    value={node.content}
                    onChange={(event) =>
                      setDesignTextNodes((current) =>
                        current.map((item) => (item.id === node.id ? { ...item, content: event.target.value } : item))
                      )
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                  {renderDesignResizeHandles(node.id, 'text', node.x, node.y, node.width, node.height)}
                </div>
              );
            })}

            {designAINodes.map((node: any) => {
              const active = designCanvasSelection?.type === 'ai' && designCanvasSelection.id === node.id;
              const selected = designSelectionIds.includes(node.id);
              const layer = designNodeLayers[node.id] || 1;

              return (
                <div
                  key={node.id}
                  className={`design-node-card design-flow-node design-ai-node ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    minHeight: `${node.height}px`,
                    zIndex: layer,
                  }}
                  data-design-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => handleDesignNodePointerDown(node.id, 'ai', event)}
                  onContextMenu={(event) => handleDesignNodeContextMenu(node.id, 'ai', event)}
                >
                  <div className="design-node-card-top">
                    <span className="design-node-chip design-node-control">AI</span>
                    <span className="design-node-type">Generator</span>
                  </div>
                  <div className="design-flow-node-body">
                    <input
                      className="design-node-inline-input"
                      value={node.title}
                      onChange={(event) =>
                        setDesignAINodes((current) =>
                          current.map((item) => (item.id === node.id ? { ...item, title: event.target.value } : item))
                        )
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                    <textarea
                      className="design-node-inline-textarea"
                      value={node.prompt}
                      onChange={(event) =>
                        setDesignAINodes((current) =>
                          current.map((item) => (item.id === node.id ? { ...item, prompt: event.target.value } : item))
                        )
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <button className="design-node-handle design-node-handle-left" type="button" tabIndex={-1} aria-label="input" />
                  <button
                    className="design-node-handle design-node-handle-right"
                    type="button"
                    tabIndex={-1}
                    aria-label="output"
                    onPointerDown={(event) => handleConnectorPointerDown(node.id, event)}
                  />
                  {renderDesignResizeHandles(node.id, 'ai', node.x, node.y, node.width, node.height)}
                </div>
              );
            })}

            {designStyleNodes.map((node: any) => {
              const active = designCanvasSelection?.type === 'style' && designCanvasSelection.id === node.id;
              const selected = designSelectionIds.includes(node.id);
              const layer = designNodeLayers[node.id] || 1;

              return (
                <div
                  key={node.id}
                  className={`design-node-card design-style-node ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                    zIndex: layer,
                    ...getDesignStyleNodeTheme(node),
                  }}
                  data-design-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => handleDesignNodePointerDown(node.id, 'style', event)}
                  onContextMenu={(event) => handleDesignNodeContextMenu(node.id, 'style', event)}
                >
                  <div className="design-node-card-top">
                    <span className="design-node-chip design-node-control">Style</span>
                    <span className="design-node-type">Visual Direction</span>
                  </div>
                  <div
                    className="design-style-node-scroll-area"
                    data-style-variant={getDesignStyleVariant(node.title)}
                    onWheel={handleScrollableAreaWheel}
                  >
                    <div className="design-style-node-head">
                      <strong>{node.title}</strong>
                      <p>{node.summary}</p>
                    </div>
                    <div className="design-style-node-preview" aria-hidden="true">
                      <div className="design-style-node-preview-glow" />
                      <div className="design-style-node-preview-frame">
                        <div className="design-style-node-preview-bar">
                          <span />
                          <span />
                          <span />
                        </div>
                        <div className="design-style-node-preview-surface">
                          <div className="design-style-node-preview-hero" />
                          <div className="design-style-node-preview-grid">
                            <span className="design-style-node-preview-card large" />
                            <span className="design-style-node-preview-card" />
                            <span className="design-style-node-preview-card" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="design-style-node-palette">
                      {node.palette.slice(0, 5).map((color: string) => (
                        <span
                          key={color}
                          className="design-style-node-swatch"
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <div className="design-style-node-tags">
                      {node.keywords.slice(0, 5).map((keyword: string) => (
                        <span key={keyword}>{keyword}</span>
                      ))}
                    </div>
                    <div className="design-style-node-prompt">{node.prompt}</div>
                  </div>
                  <button className="design-node-handle design-node-handle-left" type="button" tabIndex={-1} aria-label="输入端点" />
                  <button
                    className="design-node-handle design-node-handle-right"
                    type="button"
                    tabIndex={-1}
                    aria-label="输出端点"
                    onPointerDown={(event) => handleConnectorPointerDown(node.id, event)}
                  />
                  {renderDesignResizeHandles(node.id, 'style', node.x, node.y, node.width, node.height)}
                </div>
              );
            })}
          </div>

          {designSelectionRect ? (
            <div
              className="design-selection-marquee"
              style={{
                left: `${designSelectionRect.x}px`,
                top: `${designSelectionRect.y}px`,
                width: `${designSelectionRect.width}px`,
                height: `${designSelectionRect.height}px`,
              }}
            />
          ) : null}

          {designCanvasContextMenu ? (
            <div
              ref={designContextMenuRef}
              className="design-context-menu"
              style={{
                left: `${designCanvasContextMenu.viewportX}px`,
                top: `${designCanvasContextMenu.viewportY}px`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {designCanvasContextMenu.type === 'canvas' ? (
                <>
                  <div className="design-context-menu-header">
                    <strong>
                      {designCanvasContextMenu.submenu === 'style' ? '添加样式节点' : '添加内容'}
                    </strong>
                    <span>
                      {designCanvasContextMenu.submenu === 'style'
                        ? '选择一组视觉风格，方便后续 AI 和协作识别'
                        : '可添加文本或样式节点'}
                    </span>
                  </div>
                  {designCanvasContextMenu.submenu === 'style' ? (
                    <div className="design-context-menu-list" onWheel={handleScrollableAreaWheel}>
                      {stylePresets.map((preset: any) => (
                        <button
                          key={preset.title}
                          className="design-context-menu-item"
                          type="button"
                          onClick={() => handleAddStyleNode(preset)}
                        >
                          <strong>{preset.title}</strong>
                          <span>{preset.summary}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="design-context-menu-list" onWheel={handleScrollableAreaWheel}>
                      <button className="design-context-menu-item" type="button" onClick={handleAddTextNode}>
                        <strong>添加文本</strong>
                        <span>在画布上放一段说明文字</span>
                      </button>
                      <button
                        className="design-context-menu-item"
                        type="button"
                        onClick={() =>
                          setDesignCanvasContextMenu((current: any) =>
                            current ? { ...current, submenu: 'style' } : current
                          )
                        }
                      >
                        <strong>添加样式节点</strong>
                        <span>内置一批好看的 UI 风格，方便给页面做风格约束</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="design-context-menu-header">
                    <strong>节点操作</strong>
                    <span>对当前节点执行删除</span>
                  </div>
                  <div className="design-context-menu-list" onWheel={handleScrollableAreaWheel}>
                    <button
                      className="design-context-menu-item danger"
                      type="button"
                      onClick={() => {
                        if (designCanvasContextMenu.nodeType === 'page') {
                          handleDeleteSelectedPageNode();
                        } else if (designCanvasContextMenu.nodeType === 'flow') {
                          handleDeleteSelectedFlowNode();
                        } else if (designCanvasContextMenu.nodeType === 'text') {
                          handleDeleteSelectedTextNode();
                        } else if (designCanvasContextMenu.nodeType === 'ai') {
                          handleDeleteSelectedAINode();
                        } else if (designCanvasContextMenu.nodeType === 'style') {
                          handleDeleteSelectedStyleNode();
                        }
                        setDesignCanvasContextMenu(null);
                      }}
                    >
                      <strong>删除节点</strong>
                      <span>移除当前选中的草图页、流程、文本或样式节点</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </div>
  );
};
