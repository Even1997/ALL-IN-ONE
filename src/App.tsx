import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { AIWorkspace } from './components/ai/AIWorkspace';
import { Workspace } from './components/workspace';
import { ProjectSetup } from './components/project/ProjectSetup';
import { ProductWorkbench } from './components/product/ProductWorkbench';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { aiService } from './modules/ai/core/AIService';
import {
  buildDesignStyleMarkdown,
  getBuiltInStylePackFiles,
  parseDesignStyleMarkdown,
  toStylePackPath,
} from './modules/design/stylePack';
import { buildDesignStyleReferencePath, buildSketchReferencePath } from './modules/knowledge/referenceFiles';
import { useAIWorkflowStore } from './modules/ai/store/workflowStore';
import { useProjectStore } from './store/projectStore';
import { APP_STYLE_STORAGE_KEY, getInitialAppStyle, type AppStyle } from './appTheme';
import { VISIBLE_ROLE_TABS, type RoleView } from './appNavigation';
import type { ProjectWorkspaceSnapshot } from './store/projectStore';
import type { AppType, FeatureNode, GeneratedFile, PageStructureNode, ProjectConfig, WireframeDocument } from './types';
import { Allotment } from 'allotment';
import { LAYOUT_PREFERENCE_KEYS, readLayoutSize, writeLayoutSize } from './utils/layoutPreferences';
import { createWireframeModule, getCanvasPreset, isMobileAppType } from './utils/wireframe';
import {
  getProjectDir,
  ensureProjectFilesystemStructure,
  getProjectStorageSettings,
  isTauriRuntimeAvailable,
  loadDesignBoardStateFromDisk,
  loadProjectIndexFromDisk,
  loadSketchPageArtifactsFromProjectDir,
  loadProjectSnapshotFromDisk,
  loadProjectStylePackPresets,
  loadWorkflowStateFromDisk,
  removeProjectDirectoryFromDisk,
  resetProjectStorageRoot,
  saveDesignBoardStateToDisk,
  saveProjectIndexToDisk,
  saveProjectSnapshotToDisk,
  saveProjectStylePackFile,
  saveWorkflowStateToDisk,
  setProjectStorageRoot,
  syncGeneratedFilesToProjectDir,
  syncSketchFilesToProjectDir,
  writeSketchPageFile,
  type ProjectStorageSettings,
} from './utils/projectPersistence';
import 'allotment/dist/style.css';
import './App.css';

type ThemeMode = 'dark' | 'light';
type ProjectStorageState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
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
  styleFilePath?: string;
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
type PersistedProjectSnapshot = {
  workspace: ProjectWorkspaceSnapshot;
  featureTree: ReturnType<typeof useFeatureTreeStore.getState>['tree'];
};

const readProjectIndex = (): ProjectConfig[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_INDEX_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ProjectConfig => Boolean(item) && typeof item === 'object') as ProjectConfig[]
      : [];
  } catch {
    return [];
  }
};

const writeProjectIndex = (projects: ProjectConfig[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PROJECT_INDEX_STORAGE_KEY, JSON.stringify(projects));
};

const getProjectSnapshotStorageKey = (projectId: string) => `${PROJECT_SNAPSHOT_STORAGE_PREFIX}:${projectId}`;

const readProjectSnapshot = (projectId: string): PersistedProjectSnapshot | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getProjectSnapshotStorageKey(projectId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedProjectSnapshot;
  } catch {
    return null;
  }
};

const writeProjectSnapshot = (projectId: string, snapshot: PersistedProjectSnapshot) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getProjectSnapshotStorageKey(projectId), JSON.stringify(snapshot));
};

const removeProjectSnapshot = (projectId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getProjectSnapshotStorageKey(projectId));
};

const THEME_STORAGE_KEY = 'goodnight-theme-mode';
const DESKTOP_AI_PANE_WIDTH_BOUNDS = { min: 320, max: 640 };
const DESKTOP_WORKBENCH_MIN_WIDTH = 1100;
const DESIGN_BOARD_STORAGE_PREFIX = 'goodnight-design-board';
const PROJECT_INDEX_STORAGE_KEY = 'goodnight-project-index';
const PROJECT_SNAPSHOT_STORAGE_PREFIX = 'goodnight-project-snapshot';
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
const BUILTIN_STYLE_PACK_FILES = getBuiltInStylePackFiles();
const DEFAULT_DESIGN_STYLE_PRESETS: Omit<DesignStyleNode, 'id' | 'x' | 'y' | 'width' | 'height'>[] = BUILTIN_STYLE_PACK_FILES.map(
  (file) => ({
    title: file.seed.title,
    summary: file.seed.summary,
    keywords: file.seed.keywords,
    palette: file.seed.palette,
    prompt: file.seed.prompt,
    styleFilePath: file.path,
  })
);
const BUILTIN_STYLE_PACK_PATHS = new Set(BUILTIN_STYLE_PACK_FILES.map((file) => file.path));

const resolveStyleNodeFilePath = (
  node: Pick<DesignStyleNode, 'id' | 'title' | 'styleFilePath'>,
  presets: Array<Pick<DesignStyleNode, 'title' | 'styleFilePath'>>
) => {
  if (node.styleFilePath) {
    return node.styleFilePath;
  }

  const matchingPreset = presets.find((preset) => preset.title === node.title && preset.styleFilePath);
  if (matchingPreset?.styleFilePath) {
    return matchingPreset.styleFilePath;
  }

  return toStylePackPath(node.title || node.id);
};

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const getSketchPageFileName = (pageId: string) => {
  const normalized = pageId.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
};

const buildSketchLibraryTree = (nodes: PageStructureNode[]): SketchLibraryTreeNode[] =>
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
  const [desktopAiPaneWidth, setDesktopAiPaneWidth] = useState(() =>
    readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      420,
      DESKTOP_AI_PANE_WIDTH_BOUNDS
    )
  );
  const [canUseDesktopWorkbenchLayout, setCanUseDesktopWorkbenchLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_WORKBENCH_MIN_WIDTH : true
  );
  const [projects, setProjects] = useState<ProjectConfig[]>(() => readProjectIndex());
  const [currentProjectDir, setCurrentProjectDir] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState<Omit<DesignStyleNode, 'id' | 'x' | 'y' | 'width' | 'height'>[]>(
    () => DEFAULT_DESIGN_STYLE_PRESETS
  );
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [projectStorageSettings, setProjectStorageSettings] = useState<ProjectStorageSettings | null>(null);
  const [projectStorageDraftOverride, setProjectStorageDraftOverride] = useState<string | null>(null);
  const [projectStorageState, setProjectStorageState] = useState<ProjectStorageState>('idle');
  const [projectStorageMessage, setProjectStorageMessage] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [appStyle] = useState<AppStyle>(() => {
    if (typeof window === 'undefined') {
      return 'workbench';
    }

    return getInitialAppStyle(() => window.localStorage.getItem(APP_STYLE_STORAGE_KEY));
  });
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const [selectedDesignPageId, setSelectedDesignPageId] = useState<string | null>(null);
  const [designCanvasSelection, setDesignCanvasSelection] = useState<DesignCanvasSelection>(null);
  const [designSelectionIds, setDesignSelectionIds] = useState<string[]>([]);
  const [designMarqueeSelection, setDesignMarqueeSelection] = useState<DesignMarqueeSelection | null>(null);
  const [designPrompt] = useState('');
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
  const lastPersistedSketchSnapshotRef = useRef('');
  const lastSelectedStyleNodeIdRef = useRef<string | null>(null);
  const lastSyncedStyleMarkdownRef = useRef('');
  const lastSavedStyleFileSnapshotsRef = useRef<Record<string, string>>({});
  const [designBoardViewport, setDesignBoardViewport] = useState({ width: 0, height: 0 });
  const isConnectorMode = false;
  const pendingConnectionStartId = connectionDraft?.fromId ?? null;
  const setIsConnectorMode = (_value?: boolean | ((current: boolean) => boolean)) => {};
  const setPendingConnectionStartId = (_value?: string | null | ((current: string | null) => string | null)) => {};

  const { clearCanvas } = usePreviewStore();
  const { setTree, tree: featureTree, clearTree } = useFeatureTreeStore();
  const workflowProjects = useAIWorkflowStore((state) => state.projects);
  const replaceWorkflowProjectState = useAIWorkflowStore((state) => state.replaceProjectState);
  const clearWorkflowProjectState = useAIWorkflowStore((state) => state.clearProjectState);
  const {
    currentProjectId,
    currentProject,
    graph,
    memory,
    rawRequirementInput,
    featuresMarkdown,
    wireframesMarkdown,
    requirementDocs,
    activeKnowledgeFileId,
    selectedKnowledgeContextIds,
    prd,
    pageStructure,
    wireframes,
    designSystem,
    uiSpecs,
    devTasks,
    generatedFiles,
    testPlan,
    deployPlan,
    createProject,
    loadProjectWorkspace,
    switchProject,
    deleteProject,
    clearProject,
    addRootPage,
    replacePageStructure,
    replaceWireframes,
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
  const selectedSketchFilePath = useMemo(
    () => (selectedDesignPage ? buildSketchReferencePath(selectedDesignPage) : ''),
    [selectedDesignPage]
  );
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
      const fallbackColor = (stylePresets[0] || DEFAULT_DESIGN_STYLE_PRESETS[0]).palette[index] || '#ffffff';
      return (
        normalizeHexColor(selectedStyleNode.palette[index] || fallbackColor) ||
        normalizeHexColor(fallbackColor) ||
        '#ffffff'
      );
    });
  }, [selectedStyleNode, stylePresets]);
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

    return BUILTIN_STYLE_PACK_PATHS.has(selectedStylePackFilePath) ? '内置样式包' : '项目样式包';
  }, [selectedStylePackFilePath]);
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
  const canUseProjectFilesystem = isTauriRuntimeAvailable();
  const isDesktopWorkbenchMode = Boolean(
    currentProject && currentRole !== 'design' && !isProjectManagerOpen && canUseDesktopWorkbenchLayout
  );

  useEffect(() => {
    const handleResize = () => {
      setCanUseDesktopWorkbenchLayout(window.innerWidth >= DESKTOP_WORKBENCH_MIN_WIDTH);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleDesktopWorkbenchLayoutChange = useCallback((sizes: number[]) => {
    const nextAiPaneWidth = sizes[1];
    if (!Number.isFinite(nextAiPaneWidth)) {
      return;
    }

    setDesktopAiPaneWidth(
      writeLayoutSize(
        LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
        nextAiPaneWidth,
        DESKTOP_AI_PANE_WIDTH_BOUNDS
      )
    );
  }, []);

  useEffect(() => {
    document.body.classList.toggle('desktop-workbench-mode', isDesktopWorkbenchMode);

    return () => {
      document.body.classList.remove('desktop-workbench-mode');
    };
  }, [isDesktopWorkbenchMode]);

  useEffect(() => {
    writeLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      desktopAiPaneWidth,
      DESKTOP_AI_PANE_WIDTH_BOUNDS
    );
  }, [desktopAiPaneWidth]);

  const refreshSketchArtifactsFromDisk = useCallback(async () => {
    if (!canUseProjectFilesystem || !currentProject) {
      return null;
    }

    const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
    replacePageStructure(sketchArtifacts.pageStructure, featureTree);
    replaceWireframes(sketchArtifacts.wireframes, featureTree);
    return sketchArtifacts;
  }, [canUseProjectFilesystem, currentProject, featureTree, replacePageStructure, replaceWireframes]);
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
    let isMounted = true;

    void loadProjectIndexFromDisk()
      .then((diskProjects) => {
        if (!isMounted || diskProjects.length === 0) {
          return;
        }

        setProjects((current) => {
          const byId = new Map(current.map((project) => [project.id, project]));
          diskProjects.forEach((project) => byId.set(project.id, project));
          const nextProjects = Array.from(byId.values()).sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );
          writeProjectIndex(nextProjects);
          return nextProjects;
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    let isMounted = true;
    setProjectStorageState('loading');
    setProjectStorageMessage(null);

    void getProjectStorageSettings()
      .then((settings) => {
        if (!isMounted) {
          return;
        }

        setProjectStorageSettings(settings);
        setProjectStorageState('idle');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setProjectStorageState('error');
        setProjectStorageMessage('项目存储路径读取失败。');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.style = appStyle;
    window.localStorage.setItem(APP_STYLE_STORAGE_KEY, appStyle);
  }, [appStyle]);

  const persistActiveProjectSnapshot = useCallback(
    (projectOverride?: ProjectConfig | null, featureTreeOverride = featureTree) => {
      const activeProject = projectOverride || currentProject;
      if (!activeProject) {
        return;
      }

      const workspace: ProjectWorkspaceSnapshot = {
        currentProject: activeProject,
        graph,
        memory,
        rawRequirementInput,
        featuresMarkdown,
        wireframesMarkdown,
        requirementDocs,
        activeKnowledgeFileId,
        selectedKnowledgeContextIds,
        prd,
        pageStructure,
        wireframes,
        designSystem,
        uiSpecs,
        devTasks,
        generatedFiles,
        testPlan,
        deployPlan,
      };

      writeProjectSnapshot(activeProject.id, {
        workspace,
        featureTree: featureTreeOverride,
      });

      const workflowProjectState = workflowProjects[activeProject.id];

      void saveProjectSnapshotToDisk(activeProject, {
        workspace,
        featureTree: featureTreeOverride,
      })
        .then(() =>
          Promise.all([
            syncGeneratedFilesToProjectDir(activeProject.id, generatedFiles),
            syncSketchFilesToProjectDir(activeProject.id, designPages, wireframes),
          ])
        )
        .catch(() => undefined);

      if (workflowProjectState) {
        void saveWorkflowStateToDisk(activeProject.id, workflowProjectState).catch(() => undefined);
      }

      setProjects((current) => {
        const nextProjects = [...current.filter((item) => item.id !== activeProject.id), activeProject].sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
        writeProjectIndex(nextProjects);
        void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
        return nextProjects;
      });
    },
    [
      currentProject,
      deployPlan,
      designSystem,
      devTasks,
      designPages,
      featureTree,
      featuresMarkdown,
      generatedFiles,
      graph,
      memory,
      pageStructure,
      prd,
      rawRequirementInput,
      requirementDocs,
      activeKnowledgeFileId,
      selectedKnowledgeContextIds,
      testPlan,
      uiSpecs,
      wireframes,
      wireframesMarkdown,
      workflowProjects,
    ]
  );

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    persistActiveProjectSnapshot();
  }, [currentProject, persistActiveProjectSnapshot]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setProjects((current) => {
      if (current.some((item) => item.id === currentProject.id)) {
        return current;
      }

      const nextProjects = [...current, currentProject].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
      writeProjectIndex(nextProjects);
      void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
      return nextProjects;
    });
  }, [currentProject]);

  useEffect(() => {
    if (!currentProject) {
      setCurrentProjectDir(null);
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

    let isMounted = true;

    const applyPersistedDesignBoard = (persisted: PersistedDesignBoardState) => {
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
    };

    applyPersistedDesignBoard(readPersistedDesignBoardState(currentProject.id));

    void loadDesignBoardStateFromDisk(currentProject.id)
      .then((persisted) => {
        if (!isMounted || !persisted) {
          return;
        }

        applyPersistedDesignBoard({
          pageNodes: Array.isArray(persisted.pageNodes) ? persisted.pageNodes as DesignPageReferenceNode[] : [],
          flowNodes: Array.isArray(persisted.flowNodes) ? persisted.flowNodes as DesignFlowNode[] : [],
          textNodes: Array.isArray(persisted.textNodes) ? persisted.textNodes as DesignTextNode[] : [],
          aiNodes: Array.isArray(persisted.aiNodes) ? persisted.aiNodes as DesignAINode[] : [],
          styleNodes: Array.isArray(persisted.styleNodes) ? persisted.styleNodes as DesignStyleNode[] : [],
          edges: Array.isArray(persisted.edges) ? persisted.edges as DesignFlowEdge[] : [],
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [currentProject]);

  useEffect(() => {
    if (!currentProject) {
      setStylePresets(DEFAULT_DESIGN_STYLE_PRESETS);
      return;
    }

    if (!canUseProjectFilesystem) {
      setCurrentProjectDir(null);
      setStylePresets(DEFAULT_DESIGN_STYLE_PRESETS);
      return;
    }

    let isMounted = true;

    void getProjectDir(currentProject.id)
      .then((projectDir) => {
        if (isMounted) {
          setCurrentProjectDir(projectDir);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCurrentProjectDir(null);
        }
      });

    void loadProjectStylePackPresets(currentProject.id)
      .then((presets) => {
        if (!isMounted) {
          return;
        }

        setStylePresets(
          presets.length > 0
            ? presets.map((preset) => ({
                title: preset.title,
                summary: preset.summary,
                keywords: preset.keywords,
                palette: preset.palette,
                prompt: preset.prompt,
                styleFilePath: preset.filePath,
              }))
            : DEFAULT_DESIGN_STYLE_PRESETS
        );
      })
      .catch(() => {
        if (isMounted) {
          setStylePresets(DEFAULT_DESIGN_STYLE_PRESETS);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canUseProjectFilesystem, currentProject]);

  useEffect(() => {
    if (!currentProjectDir) {
      return;
    }

    aiService.setConfig({ projectRoot: currentProjectDir });
  }, [currentProjectDir]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setDesignStyleNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const resolvedFilePath = resolveStyleNodeFilePath(node, stylePresets);
        if (node.styleFilePath === resolvedFilePath) {
          return node;
        }

        changed = true;
        return {
          ...node,
          styleFilePath: resolvedFilePath,
        };
      });

      return changed ? next : current;
    });
  }, [currentProject, stylePresets]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProject) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    let isMounted = true;

    void refreshSketchArtifactsFromDisk()
      .then((sketchArtifacts) => {
        if (!isMounted || !sketchArtifacts) {
          return;
        }

        setSelectedDesignPageId((current) =>
          current && sketchArtifacts.pageStructure.some((page) => page.id === current)
            ? current
            : sketchArtifacts.pageStructure[0]?.id || null
        );
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [canUseProjectFilesystem, currentProject, refreshSketchArtifactsFromDisk]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    let isMounted = true;

    void loadWorkflowStateFromDisk(currentProject.id)
      .then((workflowState) => {
        if (isMounted && workflowState) {
          replaceWorkflowProjectState(currentProject.id, workflowState);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [currentProject, replaceWorkflowProjectState]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    const workflowProjectState = workflowProjects[currentProject.id];
    if (!workflowProjectState) {
      return;
    }

    void saveWorkflowStateToDisk(currentProject.id, workflowProjectState).catch(() => undefined);
  }, [currentProject, workflowProjects]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProject || !selectedDesignPage) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    const snapshot = JSON.stringify({
      id: selectedDesignPage.id,
      name: selectedDesignPage.name,
      description: selectedDesignPage.description,
      route: selectedDesignPage.metadata.route,
      goal: selectedDesignPage.metadata.goal,
      frame: selectedWireframe?.frame,
      elements: selectedWireframe?.elements || [],
    });

    if (snapshot === lastPersistedSketchSnapshotRef.current) {
      return;
    }

    lastPersistedSketchSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      void writeSketchPageFile(currentProject.id, selectedDesignPage, selectedWireframe, currentProject.appType).catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [canUseProjectFilesystem, currentProject, selectedDesignPage, selectedWireframe]);

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

    const persistedState = {
      pageNodes: designPageNodes,
      flowNodes: designFlowNodes,
      textNodes: designTextNodes,
      aiNodes: designAINodes,
      styleNodes: designStyleNodes,
      edges: designFlowEdges,
    } satisfies PersistedDesignBoardState;

    window.localStorage.setItem(
      getDesignBoardStorageKey(currentProject.id),
      JSON.stringify(persistedState)
    );
    void saveDesignBoardStateToDisk(currentProject.id, persistedState).catch(() => undefined);
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
    if (!currentProject || !currentProjectDir || !selectedStyleNode) {
      return;
    }

    const resolvedFilePath = resolveStyleNodeFilePath(selectedStyleNode, stylePresets);
    const sourceType = BUILTIN_STYLE_PACK_PATHS.has(resolvedFilePath) ? 'builtin' : 'user-text';
    const markdown = buildDesignStyleMarkdown(selectedStyleNode, {
      sourceType,
      confidence: sourceType === 'builtin' ? 1 : 0.82,
    });

    if (lastSavedStyleFileSnapshotsRef.current[resolvedFilePath] === markdown) {
      return;
    }

    const persistTimer = window.setTimeout(() => {
      void saveProjectStylePackFile(currentProject.id, resolvedFilePath, markdown)
        .then(() => {
          lastSavedStyleFileSnapshotsRef.current[resolvedFilePath] = markdown;
          setDesignStyleNodes((current) =>
            current.map((node) =>
              node.id === selectedStyleNode.id && node.styleFilePath !== resolvedFilePath
                ? { ...node, styleFilePath: resolvedFilePath }
                : node
            )
          );
          setStylePresets((current) => {
            const nextPreset = {
              title: selectedStyleNode.title,
              summary: selectedStyleNode.summary,
              keywords: selectedStyleNode.keywords,
              palette: selectedStyleNode.palette,
              prompt: selectedStyleNode.prompt,
              styleFilePath: resolvedFilePath,
            };
            const existingIndex = current.findIndex((preset) => preset.styleFilePath === resolvedFilePath);
            if (existingIndex < 0) {
              return [...current, nextPreset];
            }

            return current.map((preset, index) => (index === existingIndex ? nextPreset : preset));
          });
        })
        .catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [currentProject, currentProjectDir, selectedStyleNode, stylePresets]);

  const handleSaveProjectStoragePath = useCallback(async (rootPath: string) => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    setProjectStorageState('saving');
    setProjectStorageMessage(null);

    try {
      const nextSettings = await setProjectStorageRoot(rootPath);
      setProjectStorageSettings(nextSettings);
      setProjectStorageDraftOverride(null);
      setProjectStorageState('saved');
      setProjectStorageMessage('项目存储路径已更新。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '项目存储路径保存失败。');
    }
  }, []);

  const handlePickProjectStoragePath = useCallback(async () => {
    if (!isTauriRuntimeAvailable() || !projectStorageSettings) {
      return;
    }

    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath: projectStorageSettings?.rootPath || projectStorageSettings?.defaultPath,
      });

      if (typeof selectedPath !== 'string') {
        return;
      }

      setProjectStorageDraftOverride(selectedPath);
      setProjectStorageState('idle');
      setProjectStorageMessage('已选择目录，点击“保存路径”后生效。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '目录选择失败。');
    }
  }, [projectStorageSettings]);

  const handleResetProjectStoragePath = useCallback(async () => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    setProjectStorageState('saving');
    setProjectStorageMessage(null);

    try {
      const nextSettings = await resetProjectStorageRoot();
      setProjectStorageSettings(nextSettings);
      setProjectStorageDraftOverride(null);
      setProjectStorageState('saved');
      setProjectStorageMessage('已恢复默认项目路径。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '恢复默认项目路径失败。');
    }
  }, []);

  const handleCreateProject = (input: Parameters<typeof createProject>[0]) => {
    const { project, featureTree: starterFeatureTree } = createProject(input);
    setTree(starterFeatureTree);
    clearCanvas();
    setSelectedFeature(starterFeatureTree.children[0] || null);
    setCurrentRole('product');
    setIsProjectManagerOpen(false);
    void ensureProjectFilesystemStructure(project.id).catch(() => undefined);
  };

  const handleOpenProject = useCallback(async (projectId: string) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    if (currentProject?.id && currentProject.id !== projectId) {
      persistActiveProjectSnapshot();
    }

    switchProject(targetProject);
    const snapshot = (await loadProjectSnapshotFromDisk(projectId)) || readProjectSnapshot(projectId);
    if (snapshot?.workspace) {
      loadProjectWorkspace(snapshot.workspace);
    }

    if (snapshot?.featureTree) {
      setTree(snapshot.featureTree);
      setSelectedFeature(snapshot.featureTree.children[0] || null);
    } else {
      clearTree();
      setSelectedFeature(null);
    }

    const workflowState = await loadWorkflowStateFromDisk(projectId);
    if (workflowState) {
      replaceWorkflowProjectState(projectId, workflowState);
    }

    clearCanvas();
    setCurrentRole('product');
    setIsProjectManagerOpen(false);
  }, [clearCanvas, clearTree, currentProject?.id, loadProjectWorkspace, persistActiveProjectSnapshot, projects, replaceWorkflowProjectState, setTree, switchProject]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    if (!window.confirm(`确定删除项目“${targetProject.name}”吗？`)) {
      return;
    }

    deleteProject(projectId);
    removeProjectSnapshot(projectId);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getDesignBoardStorageKey(projectId));
    }
    clearWorkflowProjectState(projectId);

    await removeProjectDirectoryFromDisk(projectId).catch(() => undefined);

    setProjects((current) => {
      const nextProjects = current.filter((item) => item.id !== projectId);
      writeProjectIndex(nextProjects);
      void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
      return nextProjects;
    });

    if (currentProject?.id === projectId) {
      const fallbackProject = projects.find((item) => item.id !== projectId) || null;
      if (fallbackProject) {
        void handleOpenProject(fallbackProject.id);
      } else {
        clearProject();
        clearTree();
        clearCanvas();
        setSelectedFeature(null);
        setIsProjectManagerOpen(true);
      }
    }
  }, [clearCanvas, clearProject, clearTree, clearWorkflowProjectState, currentProject?.id, deleteProject, handleOpenProject, projects]);

  const handleResetProject = () => {
    if (currentProject && typeof window !== 'undefined') {
      window.localStorage.removeItem(getDesignBoardStorageKey(currentProject.id));
    }

    clearProject();
    clearTree();
    clearCanvas();
    setSelectedFeature(null);
    setCurrentRole('product');
    setIsProjectManagerOpen(true);
  };

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

  const handleAddDesignPage = useCallback(async () => {
    if (!currentProject) {
      return;
    }

    if (!canUseProjectFilesystem) {
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
      return;
    }

    const nextIndex = designPages.length + 1;
    const nextName = `新页面 ${nextIndex}`;
    const nextPage: PageStructureNode = {
      id: `page-${Date.now()}`,
      name: nextName,
      kind: 'page',
      description: `在 design workspace 中创建的 ${nextName}`,
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

    const nextPageId = await writeSketchPageFile(currentProject.id, nextPage, null, currentProject.appType);
    const sketchArtifacts = await refreshSketchArtifactsFromDisk();
    const resolvedPageId = sketchArtifacts?.pageStructure.find((page) => page.id === nextPageId)?.id || nextPageId;
    const position = buildFreeCanvasPosition(designPageNodes.length, DESIGN_PAGE_CARD_WIDTH, DESIGN_PAGE_CARD_HEIGHT);
    const nextNode: DesignPageReferenceNode = {
      id: createId(),
      pageId: resolvedPageId,
      x: position.x,
      y: position.y,
      width: DESIGN_PAGE_CARD_WIDTH,
      height: DESIGN_PAGE_CARD_HEIGHT,
    };
    setDesignPageNodes((current) => [...current, nextNode]);
    setSelectedDesignPageId(resolvedPageId);
    setDesignCanvasSelection({ type: 'page', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [addRootPage, canUseProjectFilesystem, currentProject, designPageNodes.length, designPages.length, refreshSketchArtifactsFromDisk]);

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
    const activePreset = preset || stylePresets[0] || DEFAULT_DESIGN_STYLE_PRESETS[0];
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
      styleFilePath: resolveStyleNodeFilePath(
        { id: activePreset.title, title: activePreset.title, styleFilePath: activePreset.styleFilePath },
        stylePresets
      ),
      x: position.x,
      y: position.y,
      width: DESIGN_STYLE_CARD_WIDTH,
      height: DESIGN_STYLE_CARD_HEIGHT,
    };

    setDesignStyleNodes((current) => [...current, nextNode]);
    setDesignCanvasContextMenu(null);
    setDesignCanvasSelection({ type: 'style', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designAINodes.length, designCanvasContextMenu, designFlowNodes.length, designPageNodes.length, designStyleNodes.length, designTextNodes.length, stylePresets]);

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
        nextPalette.push((stylePresets[0] || DEFAULT_DESIGN_STYLE_PRESETS[0]).palette[nextPalette.length] || '#ffffff');
      }
      nextPalette[index] = value;
      handleStyleNodeUpdate({ palette: nextPalette });
    },
    [handleStyleNodeUpdate, selectedStyleNode, stylePresets]
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
      onFeatureSelect={(node) => setSelectedFeature(node)}
      layoutFocus="balanced"
      layoutDensity="comfortable"
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
              <div className="design-workbench-action-group">
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
                          {stylePresets.map((preset) => (
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

        <Workspace
          files={generatedFiles}
          tasks={devTasks}
          recommendedCommands={recommendedCommands}
          projectRoot={currentProjectDir || undefined}
        />
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
    return (
      <ProjectSetup
        projects={projects}
        activeProjectId={currentProjectId}
        projectStorageSettings={projectStorageSettings}
        projectStorageDraftOverride={projectStorageDraftOverride}
        projectStorageState={projectStorageState}
        projectStorageMessage={projectStorageMessage}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
        onDeleteProject={handleDeleteProject}
        onSaveProjectStoragePath={handleSaveProjectStoragePath}
        onPickProjectStoragePath={handlePickProjectStoragePath}
        onResetProjectStoragePath={handleResetProjectStoragePath}
      />
    );
  }

  const roleContent =
    currentRole === 'product'
      ? renderProductView()
      : currentRole === 'design'
        ? renderDesignView()
        : currentRole === 'develop'
          ? renderDevelopView()
          : currentRole === 'test'
            ? renderTestView()
            : renderOperationsView();

  const appMainContent = isProjectManagerOpen ? (
    <ProjectSetup
      projects={projects}
      activeProjectId={currentProjectId}
      currentProjectName={currentProject?.name ?? null}
      projectStorageSettings={projectStorageSettings}
      projectStorageDraftOverride={projectStorageDraftOverride}
      projectStorageState={projectStorageState}
      projectStorageMessage={projectStorageMessage}
      onCreateProject={handleCreateProject}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onSaveProjectStoragePath={handleSaveProjectStoragePath}
      onPickProjectStoragePath={handlePickProjectStoragePath}
      onResetProjectStoragePath={handleResetProjectStoragePath}
      onClose={() => setIsProjectManagerOpen(false)}
    />
  ) : roleContent;
  const appDesktopContent = appMainContent;
  return (
    <div className={`app app-shell-desktop ${isDesktopWorkbenchMode ? 'desktop-active' : ''}`}>
      <header className="app-header">
        <div className="header-left">
          <div className="app-brand">
            <img className="app-brand-logo" src="/branding/goodnight-logo-horizontal.svg" alt="GoodNight" />
          </div>
          <div className="header-project">
            <h1 className="app-title">{currentProject.name}</h1>
            <span className="app-subtitle">
              {currentProject.description || `${currentProject.appType} · ${currentProject.frontendFramework} · ${currentProject.backendFramework}`}
            </span>
          </div>
        </div>

        <nav className="role-tabs">
          {VISIBLE_ROLE_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`role-tab ${currentRole === tab.id ? 'active' : ''}`}
              onClick={() => setCurrentRole(tab.id)}
              type="button"
            >
              <span className="role-name">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-right">
          <label className="project-switcher">
            <span>项目</span>
            <select value={currentProject.id} onChange={(event) => handleOpenProject(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <button className="reset-project-btn" onClick={() => setIsProjectManagerOpen(true)} type="button">
            查看项目列表
          </button>

          <label className="header-search">
            <span className="header-search-icon">⌕</span>
            <input placeholder="搜索项目..." type="text" />
          </label>

          <button
            className="theme-mode-btn"
            type="button"
            onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {themeMode === 'dark' ? '浅色' : '深色'}
          </button>

          {selectedFeature ? <span className="current-feature">当前功能：{selectedFeature.name}</span> : null}

          <button className="reset-project-btn" onClick={handleResetProject} type="button">
            新建项目
          </button>
        </div>
      </header>

      <div className="app-workbench-row">
        {isDesktopWorkbenchMode ? (
          <Allotment className="app-workbench-allotment" onChange={handleDesktopWorkbenchLayoutChange}>
            <Allotment.Pane minSize={640}>
              <div className="app-workbench-pane">
                <main className="app-main app-main-desktop">{appDesktopContent}</main>
              </div>
            </Allotment.Pane>
            <Allotment.Pane
              minSize={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
              maxSize={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
              preferredSize={desktopAiPaneWidth}
            >
              <div className="app-workbench-pane">
                <aside className="app-ai-activity-pane">
                  <AIWorkspace />
                </aside>
              </div>
            </Allotment.Pane>
          </Allotment>
        ) : (
          <>
            <main className="app-main app-main-desktop">{appMainContent}</main>
            {currentRole !== 'design' ? <AIWorkspace /> : null}
          </>
        )}
      </div>
    </div>
  );
};

export default App;
