import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AIPanel } from './components/ai/AIPanel';
import { Workspace } from './components/workspace';
import { ProjectSetup } from './components/project/ProjectSetup';
import {
  ProductWorkbench,
  WorkbenchLayoutDensity,
  WorkbenchLayoutFocus,
} from './components/product/ProductWorkbench';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { useGlobalAIStore } from './modules/ai/store/globalAIStore';
import { useProjectStore } from './store/projectStore';
import type { AppType, FeatureNode, GeneratedFile, PageStructureNode, WireframeDocument } from './types';
import { createWireframeModule, getCanvasPreset, isMobileAppType } from './utils/wireframe';
import './App.css';

type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations';
type ThemeMode = 'dark' | 'light';
type DesignNodePosition = {
  x: number;
  y: number;
};
type DesignCanvasCamera = {
  x: number;
  y: number;
};
type DesignCanvasMode = 'pan' | 'select';
type DesignCanvasNodeType = 'page' | 'flow' | 'text' | 'ai' | 'style';
type DesignCanvasNodeBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type DesignPageReferenceNode = DesignCanvasNodeBase & {
  pageId: string;
};
type DesignFlowNode = DesignCanvasNodeBase & {
  title: string;
  description: string;
};
type DesignTextNode = {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type DesignAINode = DesignCanvasNodeBase & {
  title: string;
  prompt: string;
};
type DesignStyleNode = DesignCanvasNodeBase & {
  title: string;
  summary: string;
  keywords: string[];
  palette: string[];
  prompt: string;
};
type DesignFlowEdge = {
  id: string;
  from: string;
  to: string;
};
type DesignNodeLayerMap = Record<string, number>;
type DesignConnectionDraft = {
  fromId: string;
  pointerId: number;
  x: number;
  y: number;
};
type DesignMarqueeSelection = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type DesignSelectionContextItem = {
  id: string;
  type: DesignCanvasNodeType;
  title: string;
  summary: string;
};
type DesignCanvasSelection =
  | {
      type: DesignCanvasNodeType;
      id: string;
    }
  | null;
type DesignCanvasContextMenuState = {
  type: 'canvas' | 'node';
  clientX: number;
  clientY: number;
  viewportX: number;
  viewportY: number;
  boardX: number;
  boardY: number;
  nodeId?: string;
  nodeType?: DesignCanvasNodeType;
  submenu?: 'style' | null;
} | null;
type PersistedDesignBoardState = {
  pageNodes: DesignPageReferenceNode[];
  flowNodes: DesignFlowNode[];
  textNodes: DesignTextNode[];
  aiNodes: DesignAINode[];
  styleNodes: DesignStyleNode[];
  edges: DesignFlowEdge[];
};
type SketchLibraryTreeNode = {
  id: string;
  name: string;
  pageId: string;
  children: SketchLibraryTreeNode[];
};

const THEME_STORAGE_KEY = 'devflow-theme-mode';
const LAYOUT_FOCUS_STORAGE_KEY = 'devflow-layout-focus';
const LAYOUT_DENSITY_STORAGE_KEY = 'devflow-layout-density';
const DESIGN_BOARD_STORAGE_PREFIX = 'devflow-design-board';
const DESIGN_PAGE_CARD_WIDTH = 232;
const DESIGN_PAGE_CARD_HEIGHT = 196;
const DESIGN_FLOW_CARD_WIDTH = 220;
const DESIGN_FLOW_CARD_HEIGHT = 132;
const DESIGN_TEXT_CARD_WIDTH = 240;
const DESIGN_TEXT_CARD_HEIGHT = 120;
const DESIGN_STYLE_CARD_WIDTH = 320;
const DESIGN_STYLE_CARD_HEIGHT = 228;
const DESIGN_NODE_GAP_X = 72;
const DESIGN_NODE_GAP_Y = 56;
const DESIGN_NODE_MAX_PER_ROW = 4;
const DESIGN_BOARD_PADDING = 180;
const DESIGN_ZOOM_MIN = 0.35;
const DESIGN_ZOOM_MAX = 2.4;
const DESIGN_ZOOM_STEP = 0.0015;
const DESIGN_STYLE_PALETTE_SIZE = 5;
const DESIGN_STYLE_PRESETS: Omit<DesignStyleNode, 'id' | 'x' | 'y' | 'width' | 'height'>[] = [
  {
    title: 'Aurora Glass',
    summary: '高级感玻璃拟态，适合数据面板、AI 工作台、控制中心。',
    keywords: ['glassmorphism', 'aurora gradient', 'soft glow', 'floating panel', 'premium dashboard'],
    palette: ['#08111f', '#123456', '#7dd3fc', '#8b5cf6', '#f8fafc'],
    prompt: '使用通透玻璃卡片、极暗背景、蓝青到紫色极光高光、柔和发光描边、悬浮面板层级和精细数据组件。',
  },
  {
    title: 'Bento Spotlight',
    summary: 'Bento Grid 信息编排，适合首页、概览页、产品能力总览。',
    keywords: ['bento grid', 'editorial cards', 'modular layout', 'feature spotlight', 'clean metrics'],
    palette: ['#0f172a', '#1e293b', '#38bdf8', '#f59e0b', '#f8fafc'],
    prompt: '采用 bento grid 模块化布局，大卡片突出核心数据与 CTA，小卡片承载状态、能力点和摘要，整体克制但信息密度高。',
  },
  {
    title: 'Neo Brutal Pop',
    summary: '粗边框高对比风格，适合营销页、创意工具、年轻化产品。',
    keywords: ['neo brutalism', 'bold outline', 'high contrast', 'playful blocks', 'statement UI'],
    palette: ['#111111', '#fef08a', '#fb7185', '#60a5fa', '#ffffff'],
    prompt: '使用粗黑边框、强对比撞色、硬阴影、块状按钮和夸张标题，强调辨识度与年轻感，但保持层级清晰。',
  },
  {
    title: 'Editorial Minimal',
    summary: '杂志感极简界面，适合内容产品、品牌官网、作品集。',
    keywords: ['editorial minimal', 'luxury whitespace', 'serif headline', 'clean composition', 'art direction'],
    palette: ['#f6f1e8', '#d6c3a5', '#33261d', '#8c6a43', '#ffffff'],
    prompt: '大量留白、强排版、衬线标题与无衬线正文组合，弱化边框，用版式、节奏和材质感取胜。',
  },
  {
    title: 'Warm Commerce',
    summary: '温暖电商体验，适合商品推荐、生活方式、内容导购。',
    keywords: ['warm commerce', 'lifestyle card', 'soft gradient', 'friendly CTA', 'trustful retail'],
    palette: ['#fff7ed', '#fed7aa', '#fb923c', '#7c2d12', '#1f2937'],
    prompt: '暖米色背景搭配橙棕色点缀，卡片圆角偏大，营造可信、柔和、带生活方式质感的购买氛围。',
  },
  {
    title: 'Midnight Terminal',
    summary: '深色科技控制台，适合开发者平台、运维面板、Agent 系统。',
    keywords: ['dark console', 'developer platform', 'cyan accent', 'command center', 'system status'],
    palette: ['#020617', '#0f172a', '#22d3ee', '#10b981', '#e2e8f0'],
    prompt: '深色主界面，青绿色强调色，卡片像终端模块一样严谨排列，突出状态、日志、执行流与技术感。',
  },
];

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const buildSketchLibraryTree = (nodes: PageStructureNode[]): SketchLibraryTreeNode[] =>
  nodes.flatMap((node) => {
    const children = buildSketchLibraryTree(node.children);

    if (node.kind !== 'page') {
      return children;
    }

    return [
      {
        id: node.id,
        name: node.name,
        pageId: node.id,
        children,
      },
    ];
  });

const filterSketchLibraryTree = (
  nodes: SketchLibraryTreeNode[],
  query: string
): SketchLibraryTreeNode[] => {
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

    return [
      {
        ...node,
        children,
      },
    ];
  });
};

const collectSketchLibraryNodeIds = (nodes: SketchLibraryTreeNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...collectSketchLibraryNodeIds(node.children)]);

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

const getDesignStyleVariant = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const getDesignStyleNodeTheme = (node: DesignStyleNode): CSSProperties => {
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

const buildDesignStyleMarkdown = (node: Pick<DesignStyleNode, 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>) =>
  [
    `# ${node.title || 'Untitled Style'}`,
    '',
    '## Summary',
    node.summary || '',
    '',
    '## Keywords',
    ...(node.keywords.length ? node.keywords.map((keyword) => `- ${keyword}`) : ['- ']),
    '',
    '## Palette',
    ...(node.palette.length ? node.palette.map((color) => `- ${color}`) : ['- #ffffff']),
    '',
    '## Prompt',
    node.prompt || '',
  ].join('\n');

const parseDesignStyleMarkdown = (
  markdown: string,
  fallback: Pick<DesignStyleNode, 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>
) => {
  const sections = new Map<string, string[]>();
  let currentSection: string | null = null;
  let title = fallback.title;

  markdown.replace(/\r/g, '').split('\n').forEach((line) => {
    const trimmed = line.trim();
    const sectionMatch = /^##\s+(.+)$/.exec(trimmed);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      return;
    }

    const titleMatch = /^#\s+(.+)$/.exec(trimmed);
    if (titleMatch) {
      title = titleMatch[1].trim() || fallback.title;
      currentSection = null;
      return;
    }

    if (!currentSection) {
      return;
    }

    const bucket = sections.get(currentSection) || [];
    bucket.push(line);
    sections.set(currentSection, bucket);
  });

  const readTextSection = (name: string, currentValue: string) => {
    const nextValue = (sections.get(name.toLowerCase()) || []).join('\n').trim();
    return nextValue || currentValue;
  };

  const readListSection = (name: string, currentValue: string[]) => {
    const nextValue = (sections.get(name.toLowerCase()) || [])
      .flatMap((line) => line.replace(/^[-*+]\s*/, '').split(','))
      .map((item) => item.trim())
      .filter(Boolean);

    return nextValue.length ? nextValue : currentValue;
  };

  return {
    title,
    summary: readTextSection('summary', fallback.summary),
    keywords: readListSection('keywords', fallback.keywords),
    palette: readListSection('palette', fallback.palette),
    prompt: readTextSection('prompt', fallback.prompt),
  };
};

const convertAINodesToTextNodes = (nodes: DesignAINode[]): DesignTextNode[] =>
  nodes.map((node) => ({
    id: createId(),
    content: [node.title, node.prompt].filter(Boolean).join('\n\n'),
    x: node.x,
    y: node.y,
    width: Math.max(DESIGN_TEXT_CARD_WIDTH, Math.round(node.width)),
    height: Math.max(DESIGN_TEXT_CARD_HEIGHT + 28, Math.round(node.height)),
  }));

const getDesignBoardStorageKey = (projectId: string) => `${DESIGN_BOARD_STORAGE_PREFIX}:${projectId}`;

const buildFreeCanvasPosition = (index: number, width: number, height: number): DesignNodePosition => {
  const column = index % DESIGN_NODE_MAX_PER_ROW;
  const row = Math.floor(index / DESIGN_NODE_MAX_PER_ROW);

  return {
    x: 180 + column * (width + DESIGN_NODE_GAP_X),
    y: 160 + row * (height + DESIGN_NODE_GAP_Y),
  };
};

const clampZoom = (zoom: number) => Math.min(DESIGN_ZOOM_MAX, Math.max(DESIGN_ZOOM_MIN, zoom));

const normalizePatternOffset = (offset: number, size: number) => {
  if (!Number.isFinite(size) || size <= 0) {
    return 0;
  }

  const normalized = offset % size;
  return normalized < 0 ? normalized + size : normalized;
};

const getDesignNodeTypeLabel = (type: DesignCanvasNodeType) => {
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

const summarizeDesignSelectionText = (value: string, maxLength = 88) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(1, maxLength - 3))}...` : normalized;
};

const readPersistedDesignBoardState = (projectId: string): PersistedDesignBoardState => {
  if (typeof window === 'undefined') {
    return { pageNodes: [], flowNodes: [], textNodes: [], aiNodes: [], styleNodes: [], edges: [] };
  }

  try {
    const raw = window.localStorage.getItem(getDesignBoardStorageKey(projectId));
    if (!raw) {
      return { pageNodes: [], flowNodes: [], textNodes: [], aiNodes: [], styleNodes: [], edges: [] };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDesignBoardState>;

    return {
      pageNodes: Array.isArray(parsed.pageNodes) ? parsed.pageNodes : [],
      flowNodes: Array.isArray(parsed.flowNodes) ? parsed.flowNodes : [],
      textNodes: Array.isArray(parsed.textNodes) ? parsed.textNodes : [],
      aiNodes: Array.isArray(parsed.aiNodes) ? parsed.aiNodes : [],
      styleNodes: Array.isArray(parsed.styleNodes) ? parsed.styleNodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    return { pageNodes: [], flowNodes: [], textNodes: [], aiNodes: [], styleNodes: [], edges: [] };
  }
};

const buildEdgePath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
  const curveOffset = Math.max(120, Math.abs(end.x - start.x) * 0.35);
  return `M ${start.x} ${start.y} C ${start.x + curveOffset} ${start.y}, ${end.x - curveOffset} ${end.y}, ${end.x} ${end.y}`;
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;


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
    const width = Math.max(56, Math.round(element.width));
    const height = Math.max(40, Math.round(element.height));
    const headerHeight = Math.min(30, Math.max(18, Math.round(height * 0.32)));
    const labelY = Math.min(headerHeight - 6, 18);
    const contentY = headerHeight + 14;

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

    return {
      name: name || `模块 ${index + 1}`,
      x: Math.max(0, Math.round(element.x)),
      y: Math.max(0, Math.round(element.y)),
      width: Math.max(0, Math.round(element.width)),
      height: Math.max(0, Math.round(element.height)),
      content,
    };
  });

  return [
    `## ${page.name} 模块清单`,
    '',
    ...(modules.length > 0
      ? modules.flatMap((module) => [
          `- name: ${module.name}`,
          `  position: ${module.x}, ${module.y}`,
          `  size: ${module.width}, ${module.height}`,
          `  content: ${module.content || '无'}`,
        ])
      : ['- 暂无模块']),
  ].join('\n');
};

const buildDesignDraftElements = (
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

const renderGeneratedFileLabel = (file: GeneratedFile) => file.path.split('/').pop() || file.path;

const SettingsGlyph = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path
      d="M10.325 4.317a1 1 0 0 1 .95-.69h1.45a1 1 0 0 1 .95.69l.38 1.17a1 1 0 0 0 .63.64l1.12.42a1 1 0 0 0 .89-.08l1.02-.62a1 1 0 0 1 1.16.14l1.02 1.03a1 1 0 0 1 .14 1.16l-.62 1.01a1 1 0 0 0-.08.9l.42 1.11a1 1 0 0 0 .64.64l1.16.38a1 1 0 0 1 .69.95v1.46a1 1 0 0 1-.69.95l-1.16.38a1 1 0 0 0-.64.63l-.42 1.12a1 1 0 0 0 .08.89l.62 1.02a1 1 0 0 1-.14 1.16l-1.02 1.02a1 1 0 0 1-1.16.14l-1.02-.62a1 1 0 0 0-.89-.08l-1.12.42a1 1 0 0 0-.63.64l-.38 1.16a1 1 0 0 1-.95.69h-1.45a1 1 0 0 1-.95-.69l-.38-1.16a1 1 0 0 0-.64-.64l-1.11-.42a1 1 0 0 0-.9.08l-1.01.62a1 1 0 0 1-1.16-.14l-1.03-1.02a1 1 0 0 1-.14-1.16l.62-1.02a1 1 0 0 0 .08-.89l-.42-1.12a1 1 0 0 0-.64-.63l-1.17-.38A1 1 0 0 1 2 13.725v-1.46a1 1 0 0 1 .69-.95l1.17-.38a1 1 0 0 0 .64-.64l.42-1.11a1 1 0 0 0-.08-.9l-.62-1.01a1 1 0 0 1 .14-1.16L5.4 5.187a1 1 0 0 1 1.16-.14l1.01.62a1 1 0 0 0 .9.08l1.11-.42a1 1 0 0 0 .64-.64l.38-1.17Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

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

interface SketchLibraryTreeItemProps {
  node: SketchLibraryTreeNode;
  depth: number;
  expandedNodeIds: Set<string>;
  isSearching: boolean;
  selectedPageId: string | null;
  onToggle: (id: string) => void;
  onSelect: (pageId: string) => void;
}

const SketchLibraryTreeItem: React.FC<SketchLibraryTreeItemProps> = ({
  node,
  depth,
  expandedNodeIds,
  isSearching,
  selectedPageId,
  onToggle,
  onSelect,
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

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<RoleView>('product');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  });
  const [layoutFocus, setLayoutFocus] = useState<WorkbenchLayoutFocus>(() => {
    if (typeof window === 'undefined') {
      return 'canvas';
    }

    const stored = window.localStorage.getItem(LAYOUT_FOCUS_STORAGE_KEY);
    return stored === 'balanced' || stored === 'sidebar' ? stored : 'canvas';
  });
  const [layoutDensity, setLayoutDensity] = useState<WorkbenchLayoutDensity>(() => {
    if (typeof window === 'undefined') {
      return 'compact';
    }

    return window.localStorage.getItem(LAYOUT_DENSITY_STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const [selectedDesignPageId, setSelectedDesignPageId] = useState<string | null>(null);
  const [designCanvasSelection, setDesignCanvasSelection] = useState<DesignCanvasSelection>(null);
  const [designSelectionIds, setDesignSelectionIds] = useState<string[]>([]);
  const [designMarqueeSelection, setDesignMarqueeSelection] = useState<DesignMarqueeSelection | null>(null);
  const [designPrompt, setDesignPrompt] = useState('');
  const [designPageNodes, setDesignPageNodes] = useState<DesignPageReferenceNode[]>([]);
  const [designFlowNodes, setDesignFlowNodes] = useState<DesignFlowNode[]>([]);
  const [designTextNodes, setDesignTextNodes] = useState<DesignTextNode[]>([]);
  const [designAINodes, setDesignAINodes] = useState<DesignAINode[]>([]);
  const [designStyleNodes, setDesignStyleNodes] = useState<DesignStyleNode[]>([]);
  const [designFlowEdges, setDesignFlowEdges] = useState<DesignFlowEdge[]>([]);
  const [designNodeLayers, setDesignNodeLayers] = useState<DesignNodeLayerMap>({});
  const [connectionDraft, setConnectionDraft] = useState<DesignConnectionDraft | null>(null);
  const [designZoom, setDesignZoom] = useState(1);
  const [designCamera, setDesignCamera] = useState<DesignCanvasCamera>({
    x: DESIGN_BOARD_PADDING,
    y: DESIGN_BOARD_PADDING,
  });
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [designCanvasMode, setDesignCanvasMode] = useState<DesignCanvasMode>('pan');
  const [designCanvasContextMenu, setDesignCanvasContextMenu] = useState<DesignCanvasContextMenuState>(null);
  const [isSketchLibraryOpen, setIsSketchLibraryOpen] = useState(true);
  const [sketchLibrarySearch, setSketchLibrarySearch] = useState('');
  const [styleInspectorMode, setStyleInspectorMode] = useState<'fields' | 'markdown'>('fields');
  const [styleMarkdownDraft, setStyleMarkdownDraft] = useState('');
  const [expandedSketchLibraryNodeIds, setExpandedSketchLibraryNodeIds] = useState<Set<string>>(() => new Set());
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const designBoardScrollRef = useRef<HTMLDivElement | null>(null);
  const designContextMenuRef = useRef<HTMLDivElement | null>(null);
  const designMarqueeRef = useRef<DesignMarqueeSelection | null>(null);
  const designDragRef = useRef<{
    nodeId: string;
    nodeType: DesignCanvasNodeType;
    pointerId: number;
    moved: boolean;
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const designPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCameraX: number;
    startCameraY: number;
    moved: boolean;
    clearSelectionOnRelease: boolean;
  } | null>(null);
  const designLayerCounterRef = useRef(1);
  const designConnectionRef = useRef<DesignConnectionDraft | null>(null);
  const hasAutoFramedDesignBoardRef = useRef(false);
  const lastSelectedStyleNodeIdRef = useRef<string | null>(null);
  const lastSyncedStyleMarkdownRef = useRef('');
  const [designBoardViewport, setDesignBoardViewport] = useState({ width: 0, height: 0 });
  const isConnectorMode = false;
  const pendingConnectionStartId = connectionDraft?.fromId ?? null;
  const setIsConnectorMode = (_value?: boolean | ((current: boolean) => boolean)) => {};
  const setPendingConnectionStartId = (_value?: string | null | ((current: string | null) => string | null)) => {};

  const { clearCanvas } = usePreviewStore();
  const { setTree, tree: featureTree, clearTree } = useFeatureTreeStore();
  const { togglePanel, isStreaming } = useGlobalAIStore();
  const {
    currentProject,
    graph,
    memory,
    requirementDocs,
    pageStructure,
    wireframes,
    uiSpecs,
    devTasks,
    generatedFiles,
    testPlan,
    deployPlan,
    createProject,
    clearProject,
    addRootPage,
    updatePageStructureNode,
    upsertWireframe,
    generateDeliveryArtifacts,
  } = useProjectStore();

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const sketchLibraryTree = useMemo(() => buildSketchLibraryTree(pageStructure), [pageStructure]);
  const sketchLibraryNodeIds = useMemo(() => collectSketchLibraryNodeIds(sketchLibraryTree), [sketchLibraryTree]);
  const normalizedSketchLibrarySearch = sketchLibrarySearch.trim();
  const filteredSketchLibraryTree = useMemo(
    () => filterSketchLibraryTree(sketchLibraryTree, normalizedSketchLibrarySearch),
    [normalizedSketchLibrarySearch, sketchLibraryTree]
  );
  const isSearchingSketchLibrary = normalizedSketchLibrarySearch.length > 0;
  const selectedDesignPage = designPages.find((page) => page.id === selectedDesignPageId) || null;
  const selectedUISpec = uiSpecs.find((spec) => spec.pageId === selectedDesignPage?.id) || null;
  const selectedWireframe = selectedDesignPage ? wireframes[selectedDesignPage.id] || null : null;
  const selectedDesignPageModuleMarkdown = useMemo(
    () => (selectedDesignPage ? buildDesignPageModuleMarkdown(selectedDesignPage, selectedWireframe) : ''),
    [selectedDesignPage, selectedWireframe]
  );
  const selectedPageNode = designCanvasSelection?.type === 'page'
    ? designPageNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedFlowNode = designCanvasSelection?.type === 'flow'
    ? designFlowNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedTextNode = designCanvasSelection?.type === 'text'
    ? designTextNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedAINode = designCanvasSelection?.type === 'ai'
    ? designAINodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedStyleNode = designCanvasSelection?.type === 'style'
    ? designStyleNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedStylePaletteEditor = useMemo(() => {
    if (!selectedStyleNode) {
      return [];
    }

    return Array.from({ length: Math.max(DESIGN_STYLE_PALETTE_SIZE, selectedStyleNode.palette.length) }, (_, index) => {
      const fallbackColor = DESIGN_STYLE_PRESETS[0].palette[index] || '#ffffff';
      return (
        normalizeHexColor(selectedStyleNode.palette[index] || fallbackColor) ||
        normalizeHexColor(fallbackColor) ||
        '#ffffff'
      );
    });
  }, [selectedStyleNode]);
  const selectedDesignContextItems = useMemo<DesignSelectionContextItem[]>(() => {
    const pageNodeMap = new Map(designPageNodes.map((node) => [node.id, node]));
    const flowNodeMap = new Map(designFlowNodes.map((node) => [node.id, node]));
    const textNodeMap = new Map(designTextNodes.map((node) => [node.id, node]));
    const aiNodeMap = new Map(designAINodes.map((node) => [node.id, node]));
    const styleNodeMap = new Map(designStyleNodes.map((node) => [node.id, node]));
    const pageMap = new Map(designPages.map((page) => [page.id, page]));

    return designSelectionIds.reduce<DesignSelectionContextItem[]>((items, id) => {
      const pageNode = pageNodeMap.get(id);
      if (pageNode) {
        const page = pageMap.get(pageNode.pageId);
        if (!page) {
          return items;
        }

        const pageWireframe = wireframes[page.id];
        items.push({
          id,
          type: 'page',
          title: page.name,
          summary: summarizeDesignSelectionText(
            [
              page.description,
              page.metadata.route ? `Route: ${page.metadata.route}` : '',
              typeof pageWireframe?.elements?.length === 'number' ? `${pageWireframe.elements.length} modules` : '',
            ].filter(Boolean).join(' | ')
          ),
        });
        return items;
      }

      const flowNode = flowNodeMap.get(id);
      if (flowNode) {
        items.push({
          id,
          type: 'flow',
          title: flowNode.title,
          summary: summarizeDesignSelectionText(flowNode.description),
        });
        return items;
      }

      const textNode = textNodeMap.get(id);
      if (textNode) {
        items.push({
          id,
          type: 'text',
          title: 'Text Note',
          summary: summarizeDesignSelectionText(textNode.content),
        });
        return items;
      }

      const aiNode = aiNodeMap.get(id);
      if (aiNode) {
        items.push({
          id,
          type: 'ai',
          title: aiNode.title,
          summary: summarizeDesignSelectionText(aiNode.prompt),
        });
        return items;
      }

      const styleNode = styleNodeMap.get(id);
      if (styleNode) {
        items.push({
          id,
          type: 'style',
          title: styleNode.title,
          summary: summarizeDesignSelectionText(
            [styleNode.summary, styleNode.keywords.slice(0, 4).join(', ')].filter(Boolean).join(' | ')
          ),
        });
        return items;
      }

      return items;
    }, []);
  }, [designAINodes, designFlowNodes, designPageNodes, designPages, designSelectionIds, designStyleNodes, designTextNodes, wireframes]);
  const linkedStyleNodesForSelectedPage = useMemo(
    () => designStyleNodes.filter((node) => designSelectionIds.includes(node.id)),
    [designSelectionIds, designStyleNodes]
  );
  const isPageSelected = designCanvasSelection?.type === 'page' && !!selectedDesignPage && !!selectedPageNode;
  const testCases = testPlan?.cases ?? [];
  const deploySteps = deployPlan?.steps ?? [];
  const recommendedCommands = deployPlan?.commands ?? ['npm run build', 'npm run preview'];
  const designCanvasPreset = useMemo(() => getCanvasPreset(currentProject?.appType), [currentProject?.appType]);
  const designContentBounds = useMemo(() => {
    const pageBounds = designPageNodes.map((page) => {
      return {
        left: page.x,
        top: page.y,
        right: page.x + page.width,
        bottom: page.y + page.height,
      };
    });
    const flowBounds = designFlowNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const textBounds = designTextNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const aiBounds = designAINodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const styleBounds = designStyleNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const allBounds = [...pageBounds, ...flowBounds, ...textBounds, ...aiBounds, ...styleBounds];
    if (allBounds.length === 0) {
      return {
        x: -DESIGN_BOARD_PADDING,
        y: -DESIGN_BOARD_PADDING,
        width: DESIGN_BOARD_PADDING * 2,
        height: DESIGN_BOARD_PADDING * 2,
      };
    }

    const minLeft = Math.min(...allBounds.map((item) => item.left)) - DESIGN_BOARD_PADDING;
    const minTop = Math.min(...allBounds.map((item) => item.top)) - DESIGN_BOARD_PADDING;
    const maxRight = Math.max(...allBounds.map((item) => item.right)) + DESIGN_BOARD_PADDING;
    const maxBottom = Math.max(...allBounds.map((item) => item.bottom)) + DESIGN_BOARD_PADDING;

    return {
      x: minLeft,
      y: minTop,
      width: Math.max(1, maxRight - minLeft),
      height: Math.max(1, maxBottom - minTop),
    };
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const designBoardBounds = useMemo(() => {
    const viewportWidth = designBoardViewport.width > 0 ? designBoardViewport.width / designZoom : designContentBounds.width;
    const viewportHeight = designBoardViewport.height > 0 ? designBoardViewport.height / designZoom : designContentBounds.height;
    const visibleMinX = -designCamera.x / designZoom;
    const visibleMinY = -designCamera.y / designZoom;
    const visibleMaxX = visibleMinX + viewportWidth;
    const visibleMaxY = visibleMinY + viewportHeight;
    const draftLeft = connectionDraft ? connectionDraft.x - DESIGN_BOARD_PADDING : visibleMinX - DESIGN_BOARD_PADDING;
    const draftTop = connectionDraft ? connectionDraft.y - DESIGN_BOARD_PADDING : visibleMinY - DESIGN_BOARD_PADDING;
    const draftRight = connectionDraft ? connectionDraft.x + DESIGN_BOARD_PADDING : visibleMaxX + DESIGN_BOARD_PADDING;
    const draftBottom = connectionDraft ? connectionDraft.y + DESIGN_BOARD_PADDING : visibleMaxY + DESIGN_BOARD_PADDING;
    const minX = Math.min(designContentBounds.x, visibleMinX - DESIGN_BOARD_PADDING, draftLeft);
    const minY = Math.min(designContentBounds.y, visibleMinY - DESIGN_BOARD_PADDING, draftTop);
    const maxX = Math.max(
      designContentBounds.x + designContentBounds.width,
      visibleMaxX + DESIGN_BOARD_PADDING,
      draftRight
    );
    const maxY = Math.max(
      designContentBounds.y + designContentBounds.height,
      visibleMaxY + DESIGN_BOARD_PADDING,
      draftBottom
    );

    return {
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }, [
    connectionDraft,
    designBoardViewport.height,
    designBoardViewport.width,
    designCamera.x,
    designCamera.y,
    designContentBounds.height,
    designContentBounds.width,
    designContentBounds.x,
    designContentBounds.y,
    designZoom,
  ]);

  const designGridMetrics = useMemo(() => {
    const minorSize = 40 * designZoom;
    const majorSize = minorSize * 5;

    return {
      minorSize,
      majorSize,
      minorOffsetX: normalizePatternOffset(designCamera.x, minorSize),
      minorOffsetY: normalizePatternOffset(designCamera.y, minorSize),
      majorOffsetX: normalizePatternOffset(designCamera.x, majorSize),
      majorOffsetY: normalizePatternOffset(designCamera.y, majorSize),
    };
  }, [designCamera.x, designCamera.y, designZoom]);

  const getNodeFrame = useCallback(
    (nodeId: string) => {
      const pageNode = designPageNodes.find((item) => item.id === nodeId);
      if (pageNode) {
        return {
          x: pageNode.x,
          y: pageNode.y,
          width: pageNode.width,
          height: pageNode.height,
        };
      }

      const flowNode = designFlowNodes.find((item) => item.id === nodeId);
      if (flowNode) {
        return {
          x: flowNode.x,
          y: flowNode.y,
          width: flowNode.width,
          height: flowNode.height,
        };
      }

      const textNode = designTextNodes.find((item) => item.id === nodeId);
      if (textNode) {
        return {
          x: textNode.x,
          y: textNode.y,
          width: textNode.width,
          height: textNode.height,
        };
      }

      const aiNode = designAINodes.find((item) => item.id === nodeId);
      if (aiNode) {
        return {
          x: aiNode.x,
          y: aiNode.y,
          width: aiNode.width,
          height: aiNode.height,
        };
      }

      const styleNode = designStyleNodes.find((item) => item.id === nodeId);
      if (styleNode) {
        return {
          x: styleNode.x,
          y: styleNode.y,
          width: styleNode.width,
          height: styleNode.height,
        };
      }

      return null;
    },
    [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]
  );

  const designFlowPaths = useMemo(
    () =>
      designFlowEdges
        .map((edge) => {
          const fromFrame = getNodeFrame(edge.from);
          const toFrame = getNodeFrame(edge.to);

          if (!fromFrame || !toFrame) {
            return null;
          }

          return {
            id: edge.id,
            d: buildEdgePath(
              {
                x: fromFrame.x + fromFrame.width,
                y: fromFrame.y + fromFrame.height / 2,
              },
              {
                x: toFrame.x,
                y: toFrame.y + toFrame.height / 2,
              }
            ),
          };
        })
        .filter((path): path is { id: string; d: string } => Boolean(path)),
    [designFlowEdges, getNodeFrame]
  );

  useEffect(() => {
    setExpandedSketchLibraryNodeIds((current) => {
      const next = new Set([...current].filter((id) => sketchLibraryNodeIds.includes(id)));
      sketchLibraryNodeIds.forEach((id) => {
        if (!current.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [sketchLibraryNodeIds]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_FOCUS_STORAGE_KEY, layoutFocus);
  }, [layoutFocus]);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, layoutDensity);
  }, [layoutDensity]);

  useEffect(() => {
    if (!currentProject) {
      setDesignPageNodes([]);
      setDesignFlowNodes([]);
      setDesignTextNodes([]);
      setDesignAINodes([]);
      setDesignStyleNodes([]);
      setDesignFlowEdges([]);
      setDesignNodeLayers({});
      setDesignCanvasSelection(null);
      setDesignSelectionIds([]);
      setDesignMarqueeSelection(null);
      setConnectionDraft(null);
      hasAutoFramedDesignBoardRef.current = false;
      designLayerCounterRef.current = 1;
      designConnectionRef.current = null;
      designMarqueeRef.current = null;
      return;
    }

    const persisted = readPersistedDesignBoardState(currentProject.id);
    setDesignPageNodes(persisted.pageNodes);
    setDesignFlowNodes(persisted.flowNodes);
    setDesignTextNodes(persisted.textNodes || []);
    setDesignAINodes(persisted.aiNodes || []);
    setDesignStyleNodes(persisted.styleNodes || []);
    setDesignFlowEdges(persisted.edges);
    setDesignNodeLayers({});
    setDesignSelectionIds([]);
    setDesignMarqueeSelection(null);
    hasAutoFramedDesignBoardRef.current = false;
    designLayerCounterRef.current = 1;
    setConnectionDraft(null);
    designConnectionRef.current = null;
    designMarqueeRef.current = null;
    setSketchLibrarySearch('');
  }, [currentProject]);

  useEffect(() => {
    if (designAINodes.length === 0) {
      return;
    }

    const aiNodeIds = new Set(designAINodes.map((node) => node.id));
    const migratedTextNodes = convertAINodesToTextNodes(designAINodes);

    setDesignTextNodes((current) => [...current, ...migratedTextNodes]);
    setDesignAINodes([]);
    setDesignFlowEdges((current) =>
      current.filter((edge) => !aiNodeIds.has(edge.from) && !aiNodeIds.has(edge.to))
    );
    setDesignSelectionIds((current) => current.filter((id) => !aiNodeIds.has(id)));
    setDesignCanvasSelection((current) => (current?.type === 'ai' ? null : current));
  }, [designAINodes]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setDesignFlowEdges((current) =>
      current.filter((edge) => {
        const hasFrom =
          designPageNodes.some((page) => page.id === edge.from) ||
          designFlowNodes.some((node) => node.id === edge.from) ||
          designTextNodes.some((node) => node.id === edge.from) ||
          designAINodes.some((node) => node.id === edge.from) ||
          designStyleNodes.some((node) => node.id === edge.from);
        const hasTo =
          designPageNodes.some((page) => page.id === edge.to) ||
          designFlowNodes.some((node) => node.id === edge.to) ||
          designTextNodes.some((node) => node.id === edge.to) ||
          designAINodes.some((node) => node.id === edge.to) ||
          designStyleNodes.some((node) => node.id === edge.to);

        return hasFrom && hasTo;
      })
    );

    setDesignPageNodes((current) => {
      const next = current.filter((node) => designPages.some((page) => page.id === node.pageId));
      return next.length === current.length ? current : next;
    });
    setSelectedDesignPageId((current) =>
      current && designPages.some((page) => page.id === current) ? current : current
    );
  }, [currentProject, designAINodes, designFlowNodes, designPageNodes, designPages, designStyleNodes, designTextNodes]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    window.localStorage.setItem(
      getDesignBoardStorageKey(currentProject.id),
      JSON.stringify({
        pageNodes: designPageNodes,
        flowNodes: designFlowNodes,
        textNodes: designTextNodes,
        aiNodes: designAINodes,
        styleNodes: designStyleNodes,
        edges: designFlowEdges,
      } satisfies PersistedDesignBoardState)
    );
  }, [currentProject, designAINodes, designFlowEdges, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  useEffect(() => {
    if (!designCanvasSelection) {
      return;
    }

    if (designCanvasSelection.type === 'page' && !designPageNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }

    if (designCanvasSelection.type === 'flow' && !designFlowNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }
    if (designCanvasSelection.type === 'text' && !designTextNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }
    if (designCanvasSelection.type === 'ai' && !designAINodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }
    if (designCanvasSelection.type === 'style' && !designStyleNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }
  }, [designAINodes, designCanvasSelection, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  useEffect(() => {
    const validIds = new Set([
      ...designPageNodes.map((node) => node.id),
      ...designFlowNodes.map((node) => node.id),
      ...designTextNodes.map((node) => node.id),
      ...designAINodes.map((node) => node.id),
      ...designStyleNodes.map((node) => node.id),
    ]);

    setDesignSelectionIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  useEffect(() => {
    if (!selectedStyleNode) {
      lastSelectedStyleNodeIdRef.current = null;
      lastSyncedStyleMarkdownRef.current = '';
      setStyleMarkdownDraft('');
      setStyleInspectorMode('fields');
      return;
    }

    const nextMarkdown = buildDesignStyleMarkdown(selectedStyleNode);
    if (lastSelectedStyleNodeIdRef.current !== selectedStyleNode.id) {
      lastSelectedStyleNodeIdRef.current = selectedStyleNode.id;
      lastSyncedStyleMarkdownRef.current = nextMarkdown;
      setStyleMarkdownDraft(nextMarkdown);
      setStyleInspectorMode('fields');
      return;
    }

    if (
      styleInspectorMode !== 'markdown' ||
      styleMarkdownDraft === lastSyncedStyleMarkdownRef.current ||
      nextMarkdown === styleMarkdownDraft
    ) {
      lastSyncedStyleMarkdownRef.current = nextMarkdown;
      setStyleMarkdownDraft(nextMarkdown);
    }
  }, [selectedStyleNode, styleInspectorMode, styleMarkdownDraft]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (settingsRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsSettingsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  const handleCreateProject = (input: Parameters<typeof createProject>[0]) => {
    const { featureTree: starterFeatureTree } = createProject(input);
    setTree(starterFeatureTree);
    clearCanvas();
    setSelectedFeature(starterFeatureTree.children[0] || null);
    setCurrentRole('product');
  };

  const handleResetProject = () => {
    if (currentProject && typeof window !== 'undefined') {
      window.localStorage.removeItem(getDesignBoardStorageKey(currentProject.id));
    }

    clearProject();
    clearTree();
    clearCanvas();
    setSelectedFeature(null);
    setCurrentRole('product');
  };

  const handleFeatureSelect = useCallback((node: FeatureNode) => {
    setSelectedFeature(node);
  }, []);

  const handleGenerateDelivery = () => {
    generateDeliveryArtifacts(featureTree);
  };

  const handleGenerateDesignDraft = useCallback(() => {
    if (!selectedDesignPage || designCanvasSelection?.type !== 'page') {
      return;
    }

    const selectedContextPrompt = selectedDesignContextItems
      .filter((item) => item.id !== designCanvasSelection.id)
      .map((item, index) => `${index + 1}. [${getDesignNodeTypeLabel(item.type)}] ${item.title}${item.summary ? ` - ${item.summary}` : ''}`)
      .join('\n');

    const nextElements = buildDesignDraftElements(
      selectedDesignPage,
      [
        ...(selectedUISpec?.sections || []).slice(0, 2),
        [...(selectedUISpec?.interactionNotes || []), (selectedUISpec?.sections || [])[2]].filter(Boolean).join(' / '),
      ],
      [
        designPrompt.trim(),
        ...linkedStyleNodesForSelectedPage.map(
          (node) => `${node.title}: ${node.prompt}。关键词：${node.keywords.join(', ')}。配色：${node.palette.join(', ')}`
        ),
        selectedContextPrompt ? `当前选中节点可作为 AI 参考：
${selectedContextPrompt}` : '',
      ].filter(Boolean).join('\n\n'),
      currentProject?.appType
    );

    upsertWireframe(
      {
        id: selectedDesignPage.id,
        name: selectedDesignPage.name,
      },
      nextElements
    );

    generateDeliveryArtifacts(featureTree);
  }, [
    currentProject?.appType,
    designCanvasSelection,
    designPrompt,
    featureTree,
    generateDeliveryArtifacts,
    linkedStyleNodesForSelectedPage,
    selectedDesignContextItems,
    selectedDesignPage,
    selectedUISpec?.interactionNotes,
    selectedUISpec?.sections,
    upsertWireframe,
  ]);

  const selectPageNode = useCallback(
    (nodeId: string) => {
      const pageNode = designPageNodes.find((item) => item.id === nodeId);
      if (!pageNode) {
        return;
      }

      setSelectedDesignPageId(pageNode.pageId);
      setDesignCanvasSelection({ type: 'page', id: nodeId });
    },
    [designPageNodes]
  );

  const selectFlowNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'flow', id: nodeId });
  }, []);

  const selectTextNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'text', id: nodeId });
  }, []);

  const selectAINode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'ai', id: nodeId });
  }, []);

  const selectStyleNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'style', id: nodeId });
  }, []);

  const getDesignNodeTypeById = useCallback((nodeId: string): DesignCanvasNodeType | null => {
    if (designPageNodes.some((node) => node.id === nodeId)) {
      return 'page';
    }

    if (designTextNodes.some((node) => node.id === nodeId)) {
      return 'text';
    }

    if (designAINodes.some((node) => node.id === nodeId)) {
      return 'ai';
    }

    if (designStyleNodes.some((node) => node.id === nodeId)) {
      return 'style';
    }

    if (designFlowNodes.some((node) => node.id === nodeId)) {
      return 'flow';
    }

    return null;
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const appendEdge = useCallback((from: string, to: string) => {
    if (from === to) {
      return;
    }

    setDesignFlowEdges((current) =>
      current.some((edge) => edge.from === from && edge.to === to)
        ? current
        : [...current, { id: createId(), from, to }]
    );
  }, []);

  const handleCanvasNodeClick = useCallback((nodeId: string, type: DesignCanvasNodeType) => {
    setDesignCanvasContextMenu(null);
    setDesignSelectionIds([nodeId]);
    if (type === 'page') {
      selectPageNode(nodeId);
    } else if (type === 'text') {
      selectTextNode(nodeId);
    } else if (type === 'ai') {
      selectAINode(nodeId);
    } else if (type === 'style') {
      selectStyleNode(nodeId);
    } else {
      selectFlowNode(nodeId);
    }
  }, [selectAINode, selectFlowNode, selectPageNode, selectStyleNode, selectTextNode]);

  const updateCanvasNodePosition = useCallback((nodeId: string, type: DesignCanvasNodeType, x: number, y: number) => {
    const nextX = x;
    const nextY = y;

    if (type === 'page') {
      setDesignPageNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x: nextX, y: nextY } : node))
      );
      return;
    }

    if (type === 'text') {
      setDesignTextNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x: nextX, y: nextY } : node))
      );
      return;
    }

    if (type === 'ai') {
      setDesignAINodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x: nextX, y: nextY } : node))
      );
      return;
    }

    if (type === 'style') {
      setDesignStyleNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x: nextX, y: nextY } : node))
      );
      return;
    }

    setDesignFlowNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, x: nextX, y: nextY } : node))
    );
  }, []);

  const bringDesignNodeToFront = useCallback((nodeId: string) => {
    designLayerCounterRef.current += 1;
    const nextLayer = designLayerCounterRef.current;

    setDesignNodeLayers((current) => {
      if (current[nodeId] === nextLayer) {
        return current;
      }

      return {
        ...current,
        [nodeId]: nextLayer,
      };
    });
  }, []);

  const getNodeConnectorPoint = useCallback(
    (nodeId: string, side: 'left' | 'right') => {
      const frame = getNodeFrame(nodeId);
      if (!frame) {
        return null;
      }

      return {
        x: frame.x + (side === 'right' ? frame.width : 0),
        y: frame.y + frame.height / 2,
      };
    },
    [getNodeFrame]
  );

  const connectionDraftPath = useMemo(() => {
    if (!connectionDraft) {
      return null;
    }

    const start = getNodeConnectorPoint(connectionDraft.fromId, 'right');
    if (!start) {
      return null;
    }

    return buildEdgePath(start, { x: connectionDraft.x, y: connectionDraft.y });
  }, [connectionDraft, getNodeConnectorPoint]);

  const getDesignWorldPoint = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = designBoardScrollRef.current;
      if (!viewport) {
        return null;
      }

      const rect = viewport.getBoundingClientRect();
      const viewportX = clientX - rect.left;
      const viewportY = clientY - rect.top;

      return {
        viewportX,
        viewportY,
        x: (viewportX - designCamera.x) / designZoom,
        y: (viewportY - designCamera.y) / designZoom,
      };
    },
    [designCamera.x, designCamera.y, designZoom]
  );

  const worldToDesignViewportPoint = useCallback(
    (x: number, y: number) => ({
      x: x * designZoom + designCamera.x,
      y: y * designZoom + designCamera.y,
    }),
    [designCamera.x, designCamera.y, designZoom]
  );

  const handleConnectorPointerMove = useCallback((event: PointerEvent) => {
    const draft = designConnectionRef.current;
    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!draft || !point) {
      return;
    }

    const nextDraft = {
      ...draft,
      x: point.x,
      y: point.y,
    };

    designConnectionRef.current = nextDraft;
    setConnectionDraft(nextDraft);
  }, [getDesignWorldPoint]);

  const handleConnectorPointerUp = useCallback(
    (event: PointerEvent) => {
      const draft = designConnectionRef.current;
      if (!draft || draft.pointerId !== event.pointerId) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const targetNodeId = target?.closest('[data-design-node-id]')?.getAttribute('data-design-node-id');
      if (targetNodeId) {
        appendEdge(draft.fromId, targetNodeId);
        handleCanvasNodeClick(
          targetNodeId,
          designPageNodes.some((page) => page.id === targetNodeId)
            ? 'page'
            : designTextNodes.some((node) => node.id === targetNodeId)
              ? 'text'
              : designAINodes.some((node) => node.id === targetNodeId)
                ? 'ai'
              : designStyleNodes.some((node) => node.id === targetNodeId)
                ? 'style'
              : 'flow'
        );
      }

      designConnectionRef.current = null;
      setConnectionDraft(null);
      window.removeEventListener('pointermove', handleConnectorPointerMove);
      window.removeEventListener('pointerup', handleConnectorPointerUp);
      window.removeEventListener('pointercancel', handleConnectorPointerUp);
    },
    [appendEdge, designAINodes, designPageNodes, designStyleNodes, designTextNodes, handleCanvasNodeClick, handleConnectorPointerMove]
  );

  const handleConnectorPointerDown = useCallback(
    (nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const start = getNodeConnectorPoint(nodeId, 'right');
      if (!start) {
        return;
      }

      const draft = {
        fromId: nodeId,
        pointerId: event.pointerId,
        x: start.x,
        y: start.y,
      };

      bringDesignNodeToFront(nodeId);
      designConnectionRef.current = draft;
      setConnectionDraft(draft);
      event.currentTarget.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handleConnectorPointerMove);
      window.addEventListener('pointerup', handleConnectorPointerUp);
      window.addEventListener('pointercancel', handleConnectorPointerUp);
    },
    [bringDesignNodeToFront, getNodeConnectorPoint, handleConnectorPointerMove, handleConnectorPointerUp]
  );

  const handleDesignNodePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = designDragRef.current;
      const point = getDesignWorldPoint(event.clientX, event.clientY);
      if (!dragState || !point) {
        return;
      }

      if (
        !dragState.moved &&
        Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) > 4
      ) {
        dragState.moved = true;
      }

      updateCanvasNodePosition(
        dragState.nodeId,
        dragState.nodeType,
        point.x - dragState.offsetX,
        point.y - dragState.offsetY
      );
    },
    [getDesignWorldPoint, updateCanvasNodePosition]
  );

  const handleDesignNodePointerUp = useCallback(
    (event: PointerEvent) => {
      const dragState = designDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      designDragRef.current = null;
      window.removeEventListener('pointermove', handleDesignNodePointerMove);
      window.removeEventListener('pointerup', handleDesignNodePointerUp);
      window.removeEventListener('pointercancel', handleDesignNodePointerUp);
    },
    [handleDesignNodePointerMove]
  );

  const handleDesignNodePointerDown = useCallback(
    (nodeId: string, nodeType: DesignCanvasNodeType, event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || isSpacePressed || target.closest('.design-node-control')) {
        return;
      }

      if (target.closest('.design-node-scroll-area')) {
        handleCanvasNodeClick(nodeId, nodeType);
        bringDesignNodeToFront(nodeId);
        return;
      }

      const card = event.currentTarget;
      handleCanvasNodeClick(nodeId, nodeType);
      const cardRect = card.getBoundingClientRect();
      bringDesignNodeToFront(nodeId);

      designDragRef.current = {
        nodeId,
        nodeType,
        pointerId: event.pointerId,
        moved: false,
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: (event.clientX - cardRect.left) / designZoom,
        offsetY: (event.clientY - cardRect.top) / designZoom,
      };

      card.setPointerCapture(event.pointerId);

      window.addEventListener('pointermove', handleDesignNodePointerMove);
      window.addEventListener('pointerup', handleDesignNodePointerUp);
      window.addEventListener('pointercancel', handleDesignNodePointerUp);
    },
    [
      designZoom,
      handleCanvasNodeClick,
      handleDesignNodePointerMove,
      handleDesignNodePointerUp,
      bringDesignNodeToFront,
      isSpacePressed,
    ]
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleDesignNodePointerMove);
      window.removeEventListener('pointerup', handleDesignNodePointerUp);
      window.removeEventListener('pointercancel', handleDesignNodePointerUp);
    },
    [handleDesignNodePointerMove, handleDesignNodePointerUp]
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleConnectorPointerMove);
      window.removeEventListener('pointerup', handleConnectorPointerUp);
      window.removeEventListener('pointercancel', handleConnectorPointerUp);
    },
    [handleConnectorPointerMove, handleConnectorPointerUp]
  );

  useEffect(() => {
    const viewport = designBoardScrollRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') {
      return;
    }

    const syncViewport = () => {
      setDesignBoardViewport({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    syncViewport();

    const observer = new ResizeObserver(syncViewport);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const preventBrowserZoomWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();
    };
    const preventBrowserZoomKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const blockedKeys = ['=', '+', '-', '_', '0'];
      const blockedCodes = ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'];
      if (!blockedKeys.includes(event.key) && !blockedCodes.includes(event.code)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('wheel', preventBrowserZoomWheel, { passive: false, capture: true });
    window.addEventListener('keydown', preventBrowserZoomKey, { capture: true });

    return () => {
      window.removeEventListener('wheel', preventBrowserZoomWheel, { capture: true });
      window.removeEventListener('keydown', preventBrowserZoomKey, { capture: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleAddDesignPage = useCallback(() => {
    const nextPage = addRootPage();
    if (!nextPage) {
      return;
    }

    const position = buildFreeCanvasPosition(designPageNodes.length, DESIGN_PAGE_CARD_WIDTH, DESIGN_PAGE_CARD_HEIGHT);
    const nextNode: DesignPageReferenceNode = {
      id: createId(),
      pageId: nextPage.id,
      x: position.x,
      y: position.y,
      width: DESIGN_PAGE_CARD_WIDTH,
      height: DESIGN_PAGE_CARD_HEIGHT,
    };
    setDesignPageNodes((current) => [...current, nextNode]);
    setSelectedDesignPageId(nextPage.id);
    setDesignCanvasSelection({ type: 'page', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [addRootPage, designPageNodes.length]);

  const handleAddPageReferenceNode = useCallback((pageId: string) => {
    const position = designCanvasContextMenu
      ? {
          x: designCanvasContextMenu.boardX,
          y: designCanvasContextMenu.boardY,
        }
      : buildFreeCanvasPosition(
          designPageNodes.length + designFlowNodes.length + designTextNodes.length + designAINodes.length,
          DESIGN_PAGE_CARD_WIDTH,
          DESIGN_PAGE_CARD_HEIGHT
        );

    const nextNode: DesignPageReferenceNode = {
      id: createId(),
      pageId,
      x: position.x,
      y: position.y,
      width: DESIGN_PAGE_CARD_WIDTH,
      height: DESIGN_PAGE_CARD_HEIGHT,
    };

    setDesignPageNodes((current) => [...current, nextNode]);
    setSelectedDesignPageId(pageId);
    setDesignCanvasSelection({ type: 'page', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
    setDesignCanvasContextMenu(null);
  }, [designAINodes.length, designCanvasContextMenu, designFlowNodes.length, designPageNodes.length, designTextNodes.length]);

  const handleAddFlowNode = useCallback(() => {
    const index = designFlowNodes.length + designPageNodes.length + designAINodes.length;
    const position = buildFreeCanvasPosition(index, DESIGN_FLOW_CARD_WIDTH, DESIGN_FLOW_CARD_HEIGHT);
    const nextNode: DesignFlowNode = {
      id: createId(),
      title: `流程节点 ${designFlowNodes.length + 1}`,
      description: '描述这个节点要承接的操作、决策或页面跳转。',
      x: position.x + 48,
      y: position.y + 60,
      width: DESIGN_FLOW_CARD_WIDTH,
      height: DESIGN_FLOW_CARD_HEIGHT,
    };

    setDesignFlowNodes((current) => [...current, nextNode]);
    setDesignCanvasSelection({ type: 'flow', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designAINodes.length, designFlowNodes.length, designPageNodes.length]);

  const handleAddTextNode = useCallback(() => {
    const nextNode: DesignTextNode = {
      id: createId(),
      content: '',
      x: designCanvasContextMenu?.boardX ?? 240,
      y: designCanvasContextMenu?.boardY ?? 220,
      width: DESIGN_TEXT_CARD_WIDTH,
      height: DESIGN_TEXT_CARD_HEIGHT,
    };

    setDesignTextNodes((current) => [...current, nextNode]);
    setDesignCanvasContextMenu(null);
    setDesignCanvasSelection({ type: 'text', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designCanvasContextMenu]);

  const handleAddStyleNode = useCallback((preset?: Omit<DesignStyleNode, 'id' | 'x' | 'y' | 'width' | 'height'>) => {
    const activePreset = preset || DESIGN_STYLE_PRESETS[0];
    const position = designCanvasContextMenu
      ? {
          x: designCanvasContextMenu.boardX,
          y: designCanvasContextMenu.boardY,
        }
      : buildFreeCanvasPosition(
          designPageNodes.length + designFlowNodes.length + designTextNodes.length + designAINodes.length + designStyleNodes.length,
          DESIGN_STYLE_CARD_WIDTH,
          DESIGN_STYLE_CARD_HEIGHT
        );

    const nextNode: DesignStyleNode = {
      id: createId(),
      title: activePreset.title,
      summary: activePreset.summary,
      keywords: activePreset.keywords,
      palette: activePreset.palette,
      prompt: activePreset.prompt,
      x: position.x,
      y: position.y,
      width: DESIGN_STYLE_CARD_WIDTH,
      height: DESIGN_STYLE_CARD_HEIGHT,
    };

    setDesignStyleNodes((current) => [...current, nextNode]);
    setDesignCanvasContextMenu(null);
    setDesignCanvasSelection({ type: 'style', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designAINodes.length, designCanvasContextMenu, designFlowNodes.length, designPageNodes.length, designStyleNodes.length, designTextNodes.length]);

  const handleDeleteSelectedFlowNode = useCallback(() => {
    if (!selectedFlowNode) {
      return;
    }

    setDesignFlowNodes((current) => current.filter((node) => node.id !== selectedFlowNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedFlowNode.id && edge.to !== selectedFlowNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedFlowNode.id));
    setDesignCanvasSelection(null);
  }, [selectedFlowNode]);

  const handleDeleteSelectedPageNode = useCallback(() => {
    if (!selectedPageNode) {
      return;
    }

    setDesignPageNodes((current) => current.filter((node) => node.id !== selectedPageNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedPageNode.id && edge.to !== selectedPageNode.id)
    );
    setSelectedDesignPageId((current) => (current === selectedPageNode.pageId ? null : current));
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedPageNode.id));
    setDesignCanvasSelection(null);
  }, [selectedPageNode]);

  const handleDeleteSelectedTextNode = useCallback(() => {
    if (!selectedTextNode) {
      return;
    }

    setDesignTextNodes((current) => current.filter((node) => node.id !== selectedTextNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedTextNode.id && edge.to !== selectedTextNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedTextNode.id));
    setDesignCanvasSelection(null);
  }, [selectedTextNode]);

  const handleDeleteSelectedAINode = useCallback(() => {
    if (!selectedAINode) {
      return;
    }

    setDesignAINodes((current) => current.filter((node) => node.id !== selectedAINode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedAINode.id && edge.to !== selectedAINode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedAINode.id));
    setDesignCanvasSelection(null);
  }, [selectedAINode]);

  const handleDeleteSelectedStyleNode = useCallback(() => {
    if (!selectedStyleNode) {
      return;
    }

    setDesignStyleNodes((current) => current.filter((node) => node.id !== selectedStyleNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedStyleNode.id && edge.to !== selectedStyleNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedStyleNode.id));
    setDesignCanvasSelection(null);
  }, [selectedStyleNode]);

  const handleFlowNodeUpdate = useCallback(
    (updates: Partial<Pick<DesignFlowNode, 'title' | 'description'>>) => {
      if (!selectedFlowNode) {
        return;
      }

      setDesignFlowNodes((current) =>
        current.map((node) => (node.id === selectedFlowNode.id ? { ...node, ...updates } : node))
      );
    },
    [selectedFlowNode]
  );

  const handleTextNodeUpdate = useCallback(
    (updates: Partial<Pick<DesignTextNode, 'content' | 'width' | 'height'>>) => {
      if (!selectedTextNode) {
        return;
      }

      setDesignTextNodes((current) =>
        current.map((node) => (node.id === selectedTextNode.id ? { ...node, ...updates } : node))
      );
    },
    [selectedTextNode]
  );

  const handleStyleNodeUpdate = useCallback(
    (updates: Partial<Pick<DesignStyleNode, 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>>) => {
      if (!selectedStyleNode) {
        return;
      }

      setDesignStyleNodes((current) =>
        current.map((node) => (node.id === selectedStyleNode.id ? { ...node, ...updates } : node))
      );
    },
    [selectedStyleNode]
  );

  const handleStylePaletteColorChange = useCallback(
    (index: number, value: string) => {
      if (!selectedStyleNode) {
        return;
      }

      const nextPalette = [...selectedStyleNode.palette];
      while (nextPalette.length < Math.max(DESIGN_STYLE_PALETTE_SIZE, index + 1)) {
        nextPalette.push(DESIGN_STYLE_PRESETS[0].palette[nextPalette.length] || '#ffffff');
      }
      nextPalette[index] = value;
      handleStyleNodeUpdate({ palette: nextPalette });
    },
    [handleStyleNodeUpdate, selectedStyleNode]
  );

  const handleApplyStyleMarkdown = useCallback(() => {
    if (!selectedStyleNode) {
      return;
    }

    const updates = parseDesignStyleMarkdown(styleMarkdownDraft, selectedStyleNode);
    const nextNode = { ...selectedStyleNode, ...updates };
    const nextMarkdown = buildDesignStyleMarkdown(nextNode);

    lastSyncedStyleMarkdownRef.current = nextMarkdown;
    setStyleMarkdownDraft(nextMarkdown);
    handleStyleNodeUpdate(updates);
  }, [handleStyleNodeUpdate, selectedStyleNode, styleMarkdownDraft]);

  const handleResetStyleMarkdown = useCallback(() => {
    if (!selectedStyleNode) {
      return;
    }

    const nextMarkdown = buildDesignStyleMarkdown(selectedStyleNode);
    lastSyncedStyleMarkdownRef.current = nextMarkdown;
    setStyleMarkdownDraft(nextMarkdown);
  }, [selectedStyleNode]);

  const handlePageNodeUpdate = useCallback(
    (
      updates: Partial<Pick<PageStructureNode, 'name' | 'description'>> & {
        metadata?: Partial<PageStructureNode['metadata']>;
      }
    ) => {
      if (!selectedDesignPage) {
        return;
      }

      updatePageStructureNode(selectedDesignPage.id, updates);
    },
    [selectedDesignPage, updatePageStructureNode]
  );

  const renderDesignResizeHandles = useCallback((..._args: unknown[]) => null, []);

  const zoomDesignBoardAtPoint = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = designBoardScrollRef.current;
    if (!viewport) {
      return;
    }

    const clampedZoom = clampZoom(nextZoom);
    const rect = viewport.getBoundingClientRect();
    const pointerX = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const pointerY = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    const contentX = (pointerX - designCamera.x) / designZoom;
    const contentY = (pointerY - designCamera.y) / designZoom;
    setDesignZoom(clampedZoom);
    setDesignCamera({
      x: pointerX - contentX * clampedZoom,
      y: pointerY - contentY * clampedZoom,
    });
  }, [designCamera.x, designCamera.y, designZoom]);

  const frameDesignBoard = useCallback(
    (target?: { x: number; y: number; width: number; height: number }, zoomCap = 1) => {
      if (designBoardViewport.width <= 0 || designBoardViewport.height <= 0) {
        return;
      }

      const frame = target || designContentBounds;
      const padding = target ? 72 : 120;
      const availableWidth = Math.max(1, designBoardViewport.width - padding * 2);
      const availableHeight = Math.max(1, designBoardViewport.height - padding * 2);
      const zoomByWidth = availableWidth / Math.max(1, frame.width);
      const zoomByHeight = availableHeight / Math.max(1, frame.height);
      const nextZoom = clampZoom(Math.min(zoomCap, zoomByWidth, zoomByHeight));

      setDesignZoom(nextZoom);
      setDesignCamera({
        x: designBoardViewport.width / 2 - (frame.x + frame.width / 2) * nextZoom,
        y: designBoardViewport.height / 2 - (frame.y + frame.height / 2) * nextZoom,
      });
    },
    [designBoardViewport.height, designBoardViewport.width, designContentBounds]
  );

  const designSelectionRect = useMemo(() => {
    if (!designMarqueeSelection) {
      return null;
    }

    return {
      x: worldToDesignViewportPoint(
        Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX),
        Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)
      ).x,
      y: worldToDesignViewportPoint(
        Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX),
        Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)
      ).y,
      width:
        (Math.max(designMarqueeSelection.startX, designMarqueeSelection.currentX) -
          Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX)) *
        designZoom,
      height:
        (Math.max(designMarqueeSelection.startY, designMarqueeSelection.currentY) -
          Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)) *
        designZoom,
    };
  }, [designMarqueeSelection, designZoom, worldToDesignViewportPoint]);

  const handleSendSelectionToAI = useCallback(() => {
    const prompt = designPrompt.trim();
    if (!prompt || selectedDesignContextItems.length === 0) {
      return;
    }

    const featureName = selectedDesignContextItems
      .filter((item) => item.type === 'page')
      .map((item) => item.title)
      .join(' / ');
    const formattedSelection = selectedDesignContextItems
      .map((item, index) => `${index + 1}. [${getDesignNodeTypeLabel(item.type)}] ${item.title}${item.summary ? ` - ${item.summary}` : ''}`)
      .join('\n');

    useGlobalAIStore.getState().generateForModule(
      'canvas',
      'generate',
      {
        target: {
          type: 'component',
          id: selectedDesignContextItems[0]?.id || 'design-canvas-selection',
          filePath: 'src/App.tsx',
        },
        change: {
          type: 'modify',
          after: prompt,
        },
        related: {
          files: ['src/App.tsx', 'src/App.css'],
          elements: selectedDesignContextItems.map((item) => item.id),
        },
      },
      `你现在在 DevFlow 的自由画布协作模式。用户已经通过点击/框选选中了一组节点，这些都应该作为 AI 的本次上下文。

用户指令：
${prompt}

已选中节点：
${formattedSelection}

请围绕这些节点给出具体的 UI/UX 方向、结构建议或后续生成步骤。`,
      {
        featureName: featureName || undefined,
        previewData: selectedDesignContextItems,
      }
    );
  }, [designPrompt, selectedDesignContextItems]);

  useEffect(() => {
    if (hasAutoFramedDesignBoardRef.current) {
      return;
    }

    const hasContent =
      designPages.length > 0 ||
      designFlowNodes.length > 0 ||
      designTextNodes.length > 0 ||
      designAINodes.length > 0 ||
      designStyleNodes.length > 0;
    if (!hasContent || designBoardViewport.width <= 0 || designBoardViewport.height <= 0) {
      return;
    }

    hasAutoFramedDesignBoardRef.current = true;
    frameDesignBoard();
  }, [
    designAINodes.length,
    designBoardViewport.height,
    designBoardViewport.width,
    designFlowNodes.length,
    designPages.length,
    designStyleNodes.length,
    designTextNodes.length,
    frameDesignBoard,
  ]);

  const handleDesignBoardWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isEditingField = Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();

      if (isEditingField) {
        return;
      }

      const nextZoom = clampZoom(designZoom * Math.exp(-event.deltaY * DESIGN_ZOOM_STEP));
      if (Math.abs(nextZoom - designZoom) < 0.001) {
        return;
      }

      zoomDesignBoardAtPoint(nextZoom, event.clientX, event.clientY);
      return;
    }

    if (isEditingField) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = Math.abs(event.deltaX) > 0.5 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const deltaY = event.shiftKey && Math.abs(event.deltaX) < 0.5 ? 0 : event.deltaY;
    setDesignCamera((current) => ({
      x: current.x - deltaX,
      y: current.y - deltaY,
    }));
  }, [designZoom, zoomDesignBoardAtPoint]);

  const handleScrollableAreaWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const canScrollY = element.scrollHeight > element.clientHeight + 1;
    const canScrollX = element.scrollWidth > element.clientWidth + 1;

    event.stopPropagation();

    if (!canScrollX && !canScrollY) {
      return;
    }

    event.preventDefault();
    element.scrollBy({
      left: canScrollX ? event.deltaX : 0,
      top: canScrollY ? event.deltaY : 0,
      behavior: 'auto',
    });
  }, []);

  const handleDesignBoardContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-design-node-id], .design-inspector-panel, .design-workbench-topbar, .design-bottom-bar')) {
      return;
    }

    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.preventDefault();
    setDesignCanvasSelection(null);
    setDesignSelectionIds([]);
    setDesignCanvasContextMenu({
      type: 'canvas',
      clientX: event.clientX,
      clientY: event.clientY,
      viewportX: point.viewportX,
      viewportY: point.viewportY,
      boardX: point.x,
      boardY: point.y,
      submenu: null,
    });
  }, [getDesignWorldPoint]);

  const handleDesignMarqueePointerMove = useCallback((event: PointerEvent) => {
    const draft = designMarqueeRef.current;
    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!draft || !point) {
      return;
    }

    const nextDraft = {
      ...draft,
      currentX: point.x,
      currentY: point.y,
    };

    designMarqueeRef.current = nextDraft;
    setDesignMarqueeSelection(nextDraft);
  }, [getDesignWorldPoint]);

  const handleDesignMarqueePointerUp = useCallback((event: PointerEvent) => {
    const draft = designMarqueeRef.current;
    if (!draft || draft.pointerId !== event.pointerId) {
      return;
    }

    const nextRect = {
      left: Math.min(draft.startX, draft.currentX),
      right: Math.max(draft.startX, draft.currentX),
      top: Math.min(draft.startY, draft.currentY),
      bottom: Math.max(draft.startY, draft.currentY),
    };

    const nextSelectedIds = [
      ...designPageNodes.map((node) => ({ id: node.id, frame: node })),
      ...designFlowNodes.map((node) => ({ id: node.id, frame: node })),
      ...designTextNodes.map((node) => ({ id: node.id, frame: node })),
      ...designAINodes.map((node) => ({ id: node.id, frame: node })),
      ...designStyleNodes.map((node) => ({ id: node.id, frame: node })),
    ]
      .filter(({ frame }) => {
        const left = frame.x;
        const right = left + frame.width;
        const top = frame.y;
        const bottom = top + frame.height;

        return !(right < nextRect.left || left > nextRect.right || bottom < nextRect.top || top > nextRect.bottom);
      })
      .map(({ id }) => id);

    if (nextRect.right - nextRect.left < 6 && nextRect.bottom - nextRect.top < 6) {
      setDesignSelectionIds([]);
      setDesignCanvasSelection(null);
    } else {
      setDesignSelectionIds(nextSelectedIds);
      if (nextSelectedIds.length === 1) {
        const nodeType = getDesignNodeTypeById(nextSelectedIds[0]);
        if (nodeType) {
          handleCanvasNodeClick(nextSelectedIds[0], nodeType);
        }
      } else {
        setDesignCanvasSelection(null);
      }
    }

    designMarqueeRef.current = null;
    setDesignMarqueeSelection(null);
    window.removeEventListener('pointermove', handleDesignMarqueePointerMove);
    window.removeEventListener('pointerup', handleDesignMarqueePointerUp);
    window.removeEventListener('pointercancel', handleDesignMarqueePointerUp);
  }, [
    designAINodes,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
    getDesignNodeTypeById,
    handleCanvasNodeClick,
    handleDesignMarqueePointerMove,
  ]);

  const handleDesignNodeContextMenu = useCallback(
    (nodeId: string, nodeType: DesignCanvasNodeType, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const point = getDesignWorldPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      handleCanvasNodeClick(nodeId, nodeType);
      setDesignCanvasContextMenu({
        type: 'node',
        clientX: event.clientX,
        clientY: event.clientY,
        viewportX: point.viewportX,
        viewportY: point.viewportY,
        boardX: point.x,
        boardY: point.y,
        nodeId,
        nodeType,
      });
    },
    [getDesignWorldPoint, handleCanvasNodeClick]
  );

  const handleDesignBoardPointerMove = useCallback((event: PointerEvent) => {
    const panState = designPanRef.current;
    if (!panState) {
      return;
    }

    if (!panState.moved && Math.hypot(event.clientX - panState.startX, event.clientY - panState.startY) > 4) {
      panState.moved = true;
    }

    setDesignCamera({
      x: panState.startCameraX + (event.clientX - panState.startX),
      y: panState.startCameraY + (event.clientY - panState.startY),
    });
  }, []);

  const handleDesignBoardPointerUp = useCallback((event: PointerEvent) => {
    const panState = designPanRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    if (panState.clearSelectionOnRelease && !panState.moved) {
      setDesignSelectionIds([]);
      setDesignCanvasSelection(null);
      setDesignCanvasContextMenu(null);
    }

    designPanRef.current = null;
    setIsCanvasPanning(false);
    window.removeEventListener('pointermove', handleDesignBoardPointerMove);
    window.removeEventListener('pointerup', handleDesignBoardPointerUp);
    window.removeEventListener('pointercancel', handleDesignBoardPointerUp);
  }, [handleDesignBoardPointerMove]);

  const handleDesignBoardPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = designBoardScrollRef.current;
    const target = event.target as HTMLElement;
    const hitProtectedLayer = target.closest(
      '.design-inspector-panel, .design-workbench-topbar, .design-workbench-note, .design-bottom-bar, .design-sketch-library, .design-context-menu, .design-sketch-library-toggle'
    );
    const hitNodeLayer = target.closest('[data-design-node-id], .design-node-control, .design-node-inline-input, .design-node-inline-textarea');
    const shouldStartMarquee =
      event.button === 0 && !isSpacePressed && !hitNodeLayer && (designCanvasMode === 'select' || event.shiftKey);
    const shouldStartPan =
      isSpacePressed ||
      event.button === 1 ||
      (event.button === 0 && !shouldStartMarquee && !hitNodeLayer);

    if (hitProtectedLayer) {
      return;
    }

    if (shouldStartPan) {
      if (!viewport) {
        return;
      }

      designPanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCameraX: designCamera.x,
        startCameraY: designCamera.y,
        moved: false,
        clearSelectionOnRelease: event.button === 0 && !isSpacePressed,
      };

      setIsCanvasPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handleDesignBoardPointerMove);
      window.addEventListener('pointerup', handleDesignBoardPointerUp);
      window.addEventListener('pointercancel', handleDesignBoardPointerUp);
      event.preventDefault();
      return;
    }

    if (
      event.button !== 0 ||
      isSpacePressed ||
      (!event.shiftKey && designCanvasMode !== 'select') ||
      hitNodeLayer
    ) {
      return;
    }

    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const draft = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };

    setDesignCanvasContextMenu(null);
    designMarqueeRef.current = draft;
    setDesignMarqueeSelection(draft);
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handleDesignMarqueePointerMove);
    window.addEventListener('pointerup', handleDesignMarqueePointerUp);
    window.addEventListener('pointercancel', handleDesignMarqueePointerUp);
    event.preventDefault();
  }, [
    designCamera.x,
    designCamera.y,
    designZoom,
    handleDesignBoardPointerMove,
    handleDesignBoardPointerUp,
    getDesignWorldPoint,
    handleDesignMarqueePointerMove,
    handleDesignMarqueePointerUp,
    designCanvasMode,
    isSpacePressed,
  ]);

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleDesignBoardPointerMove);
      window.removeEventListener('pointerup', handleDesignBoardPointerUp);
      window.removeEventListener('pointercancel', handleDesignBoardPointerUp);
    },
    [handleDesignBoardPointerMove, handleDesignBoardPointerUp]
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleDesignMarqueePointerMove);
      window.removeEventListener('pointerup', handleDesignMarqueePointerUp);
      window.removeEventListener('pointercancel', handleDesignMarqueePointerUp);
    },
    [handleDesignMarqueePointerMove, handleDesignMarqueePointerUp]
  );

  useEffect(() => {
    if (!designCanvasContextMenu) {
      return;
    }

    const closeMenu = () => {
      setDesignCanvasContextMenu(null);
    };

    const handleWindowScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && designContextMenuRef.current?.contains(target)) {
        return;
      }

      setDesignCanvasContextMenu(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', handleWindowScroll, true);

    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', handleWindowScroll, true);
    };
  }, [designCanvasContextMenu]);

  const renderProductView = () => (
    <ProductWorkbench
      onFeatureSelect={handleFeatureSelect}
      layoutFocus={layoutFocus}
      layoutDensity={layoutDensity}
    />
  );

  const renderDesignView = () => (
    <div className="design-system-view">
        <div className="design-workbench-shell design-workbench-shell-full">
          <div
            className="design-workbench-canvas design-workbench-canvas-full design-free-canvas-shell"
          >
          <div className="design-workbench-topbar design-workbench-topbar-floating">
            <div className="design-workbench-actions">
              <button className="doc-action-btn secondary" onClick={() => setIsSketchLibraryOpen((current) => !current)} type="button">
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
              <button className="doc-action-btn secondary" onClick={handleGenerateDelivery} type="button">
                更新交付物
              </button>
              <button className="doc-action-btn" onClick={handleGenerateDesignDraft} type="button" disabled={!isPageSelected}>
                生成 UI 草图
              </button>
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
                  <label className="pm-field-stack">
                    <span>模块清单 Markdown</span>
                    <textarea
                      className="product-textarea pm-markdown-editor"
                      value={selectedDesignPageModuleMarkdown}
                      readOnly
                    />
                  </label>
                  <span className="design-style-markdown-hint">基于当前草图实时生成，可选中节点喂给AI</span>
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
                              keywords: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
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
                              palette: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <div className="design-style-palette-editor">
                        {selectedStylePaletteEditor.map((color, index) => (
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
                        支持直接编辑标题、摘要、关键词、配色和提示词，点击“应用 Markdown”后会同步回节点字段。
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
            <button
              className="design-sketch-library-toggle"
              type="button"
              onClick={() => setIsSketchLibraryOpen(true)}
            >
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

              {designPageNodes.map((node) => {
                const page = designPages.find((item) => item.id === node.pageId);
                if (!page) {
                  return null;
                }

                const pageSpec = uiSpecs.find((spec) => spec.pageId === page.id) || null;
                const pageWireframe = wireframes[page.id] || null;
                const pageWireframeElements = pageWireframe?.elements || [];
                const pagePreviewImage = buildSketchPreviewImage(pageWireframeElements, designCanvasPreset.width, designCanvasPreset.height);
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

              {designFlowNodes.map((node) => {
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

              {designTextNodes.map((node) => {
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

              {designAINodes.map((node) => {
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

              {designStyleNodes.map((node) => {
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
                        {node.palette.slice(0, 5).map((color) => (
                          <span
                            key={color}
                            className="design-style-node-swatch"
                            style={{ background: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className="design-style-node-tags">
                        {node.keywords.slice(0, 5).map((keyword) => (
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
                          {DESIGN_STYLE_PRESETS.map((preset) => (
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
                              setDesignCanvasContextMenu((current) =>
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

          <div className="design-stitch-bar">
            <div className="design-bottom-bar-head">
              <div>
                <strong>AI Context</strong>
                <span>
                  {designSelectionIds.length > 0
                    ? `已选中 ${designSelectionIds.length} 个节点，框选后可以直接给 AI`
                    : designCanvasMode === 'select'
                      ? '当前是框选模式，在空白处拖出选择框即可选择 AI 上下文'
                      : '当前是拖拽模式，可平移画布；按住 Shift 也能临时拉框选择'}
                </span>
              </div>
              <div className="design-bottom-bar-actions">
                <button className="doc-action-btn secondary" onClick={() => setDesignSelectionIds([])} type="button" disabled={designSelectionIds.length === 0}>
                                    清除选择
                </button>
                <button className="doc-action-btn" onClick={handleGenerateDesignDraft} type="button" disabled={!isPageSelected}>
                  生成当前页 UI 草图
                </button>
              </div>
            </div>

            {selectedDesignContextItems.length > 0 ? (
              <div className="design-selection-chip-list">
                {selectedDesignContextItems.map((item) => (
                  <span key={item.id} className="design-selection-chip">
                    <strong>{getDesignNodeTypeLabel(item.type)}</strong>
                    <span>{item.title}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="design-stitch-input-shell">
              <textarea
                className="design-workbench-prompt-input"
                value={designPrompt}
                onChange={(event) => setDesignPrompt(event.target.value)}
                placeholder="直接说出你想要的内容、风络、信息层级或交互..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendSelectionToAI();
                  }
                }}
              />
              <div className="design-workbench-prompt-bar">
                <span>
                  {selectedDesignContextItems.length > 0
                    ? selectedDesignContextItems.slice(0, 2).map((item) => item.title).join(' / ')
                    : '先选择几个节点，再把任务交给 AI'}
                </span>
                <button
                  className="doc-action-btn"
                  onClick={handleSendSelectionToAI}
                  type="button"
                  disabled={!designPrompt.trim() || selectedDesignContextItems.length === 0}
                >
                  发送给 AI
                </button>
              </div>
            </div>
          </div>

          <div className="design-workbench-prompt design-workbench-prompt-floating design-bottom-bar">
            <div className="design-workbench-prompt-bar">
              <span>
                {isPageSelected
                  ? `当前生成目标：${selectedDesignPage?.name}`
                  : selectedFlowNode
                    ? `当前选中流程节点：${selectedFlowNode.title}`
                    : selectedStyleNode
                      ? `当前选中样式节点：${selectedStyleNode.title}`
                    : '请选择一个草图页或流程节点'}
              </span>
                生成当前页 UI 草图
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDevelopView = () => (
    <div className="develop-view">
      <div className="workspace-shell">
        <div className="delivery-summary-bar">
          <div className="graph-metric">
            <span>Files</span>
            <strong>{generatedFiles.length}</strong>
          </div>
          <div className="graph-metric">
            <span>Frontend Tasks</span>
            <strong>{devTasks.filter((task) => task.owner === 'frontend').length}</strong>
          </div>
          <div className="graph-metric">
            <span>Backend Tasks</span>
            <strong>{devTasks.filter((task) => task.owner === 'backend').length}</strong>
          </div>
          <button className="doc-action-btn" onClick={handleGenerateDelivery} type="button">
            更新交付物
          </button>
        </div>

        <div className="delivery-card-grid">
          {devTasks.map((task) => (
            <div key={task.id} className="delivery-card">
              <strong>{task.title}</strong>
              <p>{task.summary}</p>
              <span>
                {task.owner} · {task.relatedFilePaths.length} files
              </span>
            </div>
          ))}
        </div>

        <Workspace files={generatedFiles} tasks={devTasks} recommendedCommands={recommendedCommands} />
      </div>
    </div>
  );

  const renderTestView = () => (
    <div className="test-view">
      <div className="test-sidebar">
        <div className="test-nav">
          <button className="test-nav-item active" type="button">
            <span>测试计划</span>
          </button>
          <button className="test-nav-item" type="button">
            <span>Bug 跟踪</span>
          </button>
          <button className="test-nav-item" type="button">
            <span>测试报告</span>
          </button>
        </div>
      </div>

      <div className="test-content">
        <div className="test-header">
          <div className="test-stats">
            <div className="stat-card">
              <span className="stat-num">{graph.nodes.filter((node) => node.type === 'feature').length}</span>
              <span className="stat-label">功能数</span>
            </div>
            <div className="stat-card success">
              <span className="stat-num">{requirementDocs.length}</span>
              <span className="stat-label">需求文档</span>
            </div>
            <div className="stat-card warning">
              <span className="stat-num">{featureTree?.children.length || 0}</span>
              <span className="stat-label">功能节点</span>
            </div>
            <div className="stat-card info">
              <span className="stat-num">{testPlan?.coverage.caseCount || 0}</span>
              <span className="stat-label">测试用例</span>
            </div>
          </div>

          <div className="test-actions">
            <button className="test-btn primary" onClick={handleGenerateDelivery} type="button">
              生成测试计划
            </button>
            <button className="test-btn" type="button">
              建立 QA 流程
            </button>
          </div>
        </div>

        <div className="test-cases">
          {testCases.map((testCase) => (
            <div key={testCase.id} className="case-item">
              <div className={`case-status ${testCase.priority === 'high' ? 'pending' : 'passed'}`}></div>
              <div className="case-info">
                <span className="case-name">{testCase.title}</span>
                <span className="case-module">
                  {testCase.module} · {testCase.type}
                </span>
              </div>
              <span className="case-time">{testCase.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOperationsView = () => (
    <div className="operations-view">
      <div className="ops-sidebar">
        <div className="ops-nav">
          <button className="ops-nav-item active" type="button">
            <span>部署</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>构建</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>监控</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>配置</span>
          </button>
        </div>
      </div>

      <div className="ops-content">
        <div className="ops-header">
          <h2>部署中心</h2>
          <div className="ops-actions">
            <button className="ops-btn primary" onClick={handleGenerateDelivery} type="button">
              生成部署脚本
            </button>
            <button className="ops-btn success" type="button">
              规划发布流程
            </button>
          </div>
        </div>

        <div className="deploy-targets">
          <div className="target-card">
            <div className="target-info">
              <span className="target-name">{currentProject?.deployment}</span>
              <span className="target-desc">当前项目部署目标</span>
            </div>
            <span className="target-status connected">在线</span>
          </div>
          <div className="target-card">
            <div className="target-info">
              <span className="target-name">Project Memory</span>
              <span className="target-desc">{Object.keys(memory?.techStack || {}).length} 项技术上下文</span>
            </div>
            <span className="target-status connected">在线</span>
          </div>
        </div>

        <div className="deploy-history">
          <h3>阶段进度</h3>
          <div className="history-list">
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 1</span>
              <span className="history-time">当前项目基线已建立</span>
              <span className="history-target">{currentProject?.name}</span>
            </div>
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 2-6</span>
              <span className="history-time">需求 / 设计 / 开发 / 测试 / 部署</span>
              <span className="history-target">{deployPlan?.target || 'Workspace'}</span>
            </div>
          </div>
        </div>

        {deployPlan ? (
          <div className="deploy-history">
            <h3>部署步骤</h3>
            <div className="history-list">
              {deploySteps.map((step, index) => (
                <div key={step} className="history-item">
                  <span className="history-status success">{index + 1}</span>
                  <span className="history-version">Step</span>
                  <span className="history-time">{step}</span>
                  <span className="history-target">{deployPlan.target}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {generatedFiles.length > 0 ? (
          <div className="deploy-history">
            <h3>交付清单</h3>
            <div className="history-list">
              {generatedFiles.slice(0, 8).map((file) => (
                <div key={file.path} className="history-item">
                  <span className="history-status success">{file.category}</span>
                  <span className="history-version">{renderGeneratedFileLabel(file)}</span>
                  <span className="history-time">{file.summary}</span>
                  <span className="history-target">{file.language}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!currentProject) {
    return <ProjectSetup onCreateProject={handleCreateProject} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="app-brand">DevFlow</div>
          <div className="header-project">
            <h1 className="app-title">{currentProject.name}</h1>
            <span className="app-subtitle">
              {currentProject.appType} · {currentProject.frontendFramework} · {currentProject.backendFramework}
            </span>
          </div>
        </div>

        <nav className="role-tabs">
          <button className={`role-tab ${currentRole === 'product' ? 'active' : ''}`} onClick={() => setCurrentRole('product')} type="button">
            <span className="role-name">产品</span>
          </button>
          <button className={`role-tab ${currentRole === 'design' ? 'active' : ''}`} onClick={() => setCurrentRole('design')} type="button">
            <span className="role-name">设计</span>
          </button>
          <button className={`role-tab ${currentRole === 'develop' ? 'active' : ''}`} onClick={() => setCurrentRole('develop')} type="button">
            <span className="role-name">开发</span>
          </button>
        </nav>

        <div className="header-right">
          <label className="header-search">
            <span className="header-search-icon">⌕</span>
            <input placeholder="搜索项目..." type="text" />
          </label>

          <div className="header-settings" ref={settingsRef}>
            <button
              className={`theme-mode-btn header-settings-btn ${isSettingsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setIsSettingsOpen((current) => !current)}
              aria-expanded={isSettingsOpen}
              aria-label="打开布局设置"
            >
              <SettingsGlyph />
              <span>设置</span>
            </button>

            {isSettingsOpen ? (
              <div className="header-settings-popover">
                <div className="header-settings-section">
                  <span>布局设置</span>
                  <div className="pm-segmented-control">
                    <button className={layoutFocus === 'canvas' ? 'active' : ''} onClick={() => setLayoutFocus('canvas')} type="button">
                      画布优先
                    </button>
                    <button className={layoutFocus === 'balanced' ? 'active' : ''} onClick={() => setLayoutFocus('balanced')} type="button">
                      均衡
                    </button>
                    <button className={layoutFocus === 'sidebar' ? 'active' : ''} onClick={() => setLayoutFocus('sidebar')} type="button">
                      侧栏优先
                    </button>
                  </div>
                  <small>调整主工作区与侧栏的空间分配。</small>
                </div>

                <div className="header-settings-section">
                  <span>紧凑程度</span>
                  <div className="pm-segmented-control">
                    <button className={layoutDensity === 'compact' ? 'active' : ''} onClick={() => setLayoutDensity('compact')} type="button">
                      紧凑
                    </button>
                    <button className={layoutDensity === 'comfortable' ? 'active' : ''} onClick={() => setLayoutDensity('comfortable')} type="button">
                      舒适
                    </button>
                  </div>
                  <small>控制信息密度与组件之间的留白。</small>
                </div>
              </div>
            ) : null}
          </div>

          <button
            className="theme-mode-btn"
            type="button"
            onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {themeMode === 'dark' ? '浅色' : '夜间'}
          </button>

          <button className={`ai-header-btn ${isStreaming ? 'streaming' : ''}`} onClick={togglePanel} type="button">
            AI 助手
          </button>

          {selectedFeature ? <span className="current-feature">当前功能：{selectedFeature.name}</span> : null}

          <button className="reset-project-btn" onClick={handleResetProject} type="button">
            重新创建
          </button>
        </div>
      </header>

      <main className="app-main">
        {currentRole === 'product' ? renderProductView() : null}
        {currentRole === 'design' ? renderDesignView() : null}
        {currentRole === 'develop' ? renderDevelopView() : null}
        {currentRole === 'test' ? renderTestView() : null}
        {currentRole === 'operations' ? renderOperationsView() : null}
      </main>

      <AIPanel />
    </div>
  );
};

export default App;
