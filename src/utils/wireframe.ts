import type { AppType, CanvasElement, FeatureTree, PageStructureNode, WireframeDocument } from '../types/index.ts';

export interface CanvasPreset {
  width: number;
  height: number;
  frameType: 'mobile' | 'browser';
  label: string;
  description?: string;
}

export interface WireframeModuleDraft {
  id?: string;
  name: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  purpose?: string;
  actions?: string[];
  priority?: string;
  content: string;
}

export interface MarkdownModuleMatch {
  name: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  purpose?: string;
  actions?: string[];
  priority?: string;
  content: string;
  start: number;
  end: number;
}

const MOBILE_APP_TYPES: AppType[] = ['mobile', 'mini_program'];
export const MIN_MODULE_WIDTH = 1;
export const MIN_MODULE_HEIGHT = 1;
export const DEFAULT_WIREFRAME_MODULE_TYPE = '线框';
export const TEXT_WIREFRAME_MODULE_TYPE = '文字';
const FRAME_SIZE_REGEX = /^(?:(.+?)\s+)?(\d+)\s*x\s*(\d+)$/i;
const MODULE_CONTENT_TYPE_REGEX = /(?:^|[;\n]\s*)type:\s*([a-z-]+)/i;
const MOBILE_FRAME_REGEX = /(mobile|mini|phone|移动|手机|小程序)/i;
const MODULE_BLOCK_START_REGEX = /(^|\n)\s{2,}-\s+name:\s*/g;
const EMPTY_MODULE_NAME = '暂无模块';
const EMPTY_MODULE_CONTENT = '无';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const getPageMetadata = (
  node: Pick<PageStructureNode, 'name' | 'kind' | 'description'> & { metadata?: PageStructureNode['metadata'] }
) => ({
  route: node.metadata?.route || `/${node.name}`,
  title: node.metadata?.title || node.name,
  goal: node.metadata?.goal || node.description || '承接当前页面的核心任务',
  template: node.metadata?.template || (node.kind === 'flow' ? 'workspace' : 'custom'),
});

const normalizeModuleActions = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[|/、，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const getWireframeModuleContentType = (content: unknown): string | null => {
  if (typeof content !== 'string') {
    return null;
  }

  const match = MODULE_CONTENT_TYPE_REGEX.exec(content.trim());
  return match?.[1]?.trim().toLowerCase() || null;
};

export const normalizeWireframeModuleType = (value: unknown): 'text' | 'wireframe' | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === '文字' || normalized === 'text') {
    return 'text';
  }

  if (normalized === '线框' || normalized === 'wireframe') {
    return 'wireframe';
  }

  return null;
};

export const getWireframeModuleTypeLabel = (value: unknown): string => {
  const normalized = normalizeWireframeModuleType(value);
  return normalized === 'text' ? TEXT_WIREFRAME_MODULE_TYPE : DEFAULT_WIREFRAME_MODULE_TYPE;
};

export const getWireframeModuleVisualType = (
  type: unknown,
  content?: unknown
): 'text' | 'wireframe' => {
  const normalized = normalizeWireframeModuleType(type);
  if (normalized) {
    return normalized;
  }

  return getWireframeModuleContentType(content) === 'text' ? 'text' : 'wireframe';
};

export const isMobileAppType = (appType?: AppType | null) => Boolean(appType && MOBILE_APP_TYPES.includes(appType));

export const formatCanvasPreset = (preset: CanvasPreset) => `${preset.width}x${preset.height}`;

export const getCanvasPreset = (appType?: AppType | null): CanvasPreset => {
  if (isMobileAppType(appType)) {
    return {
      width: 390,
      height: 844,
      frameType: 'mobile',
      label: appType === 'mini_program' ? '小程序线框图' : '移动端线框图',
      description: '移动端画布，适合单列页面和底部主操作。',
    };
  }

  return {
    width: 1280,
    height: 800,
    frameType: 'browser',
    label: 'Web 端线框图',
  };
};

export const resolveCanvasPresetFromFrame = (
  frame: string | null | undefined,
  fallbackAppType?: AppType | null
): CanvasPreset => {
  const fallbackPreset = getCanvasPreset(fallbackAppType);
  const normalized = frame?.trim();

  if (!normalized) {
    return fallbackPreset;
  }

  const match = FRAME_SIZE_REGEX.exec(normalized);
  if (!match) {
    return fallbackPreset;
  }

  const width = Number(match[2]);
  const height = Number(match[3]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallbackPreset;
  }

  const explicitLabel = match[1]?.trim();
  const inferredMobile = width <= 480;
  const label = explicitLabel || (inferredMobile ? '移动端线框图' : 'Web 端线框图');
  const frameType = MOBILE_FRAME_REGEX.test(label) || width <= 480 ? 'mobile' : 'browser';

  return {
    label,
    width,
    height,
    frameType,
  };
};

const getModuleSize = (appType?: AppType | null, content = '') => {
  const baseWidth = isMobileAppType(appType) ? 350 : 280;
  const contentLines = Math.max(1, content.split('\n').filter(Boolean).length);
  const extraHeight = Math.max(0, contentLines - 1) * 18;

  return {
    width: baseWidth,
    height: 86 + extraHeight,
  };
};

const getElementName = (element: CanvasElement, index: number) => {
  const rawName = [
    element.props.name,
    element.props.title,
    element.props.text,
    element.props.placeholder,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  return rawName ? String(rawName).trim() : `模块 ${index + 1}`;
};

const getElementContent = (element: CanvasElement) => {
  const rawContent = [
    element.props.content,
    element.props.text,
    element.props.placeholder,
  ].find((value) => typeof value === 'string');

  return rawContent ? String(rawContent).trim() : '';
};

const getElementPurpose = (element: CanvasElement) => {
  const rawPurpose = element.props.purpose;
  return typeof rawPurpose === 'string' ? rawPurpose.trim() : '';
};

const getElementPriority = (element: CanvasElement) => {
  const rawPriority = element.props.priority;
  return typeof rawPriority === 'string' ? rawPriority.trim() : '';
};

const getElementModuleType = (element: CanvasElement) =>
  getWireframeModuleVisualType(element.props.moduleType, element.props.content) === 'text'
    ? TEXT_WIREFRAME_MODULE_TYPE
    : DEFAULT_WIREFRAME_MODULE_TYPE;

export const toWireframeModuleDrafts = (elements: CanvasElement[]): WireframeModuleDraft[] =>
  elements.map((element, index) => ({
    id: element.id,
    name: getElementName(element, index),
    type: getElementModuleType(element),
    x: Number.isFinite(element.x) ? Math.max(0, Math.round(element.x)) : 0,
    y: Number.isFinite(element.y) ? Math.max(0, Math.round(element.y)) : 0,
    width: Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH,
    height: Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT,
    purpose: getElementPurpose(element),
    actions: normalizeModuleActions(element.props.actions),
    priority: getElementPriority(element),
    content: getElementContent(element),
  }));

export const createWireframeModule = (
  draft: WireframeModuleDraft,
  appType?: AppType | null
): CanvasElement => {
  const content = draft.content.trim();
  const size = getModuleSize(appType, content);
  const width = Math.max(MIN_MODULE_WIDTH, Math.round(draft.width ?? size.width));
  const height = Math.max(MIN_MODULE_HEIGHT, Math.round(draft.height ?? size.height));
  const moduleType =
    getWireframeModuleVisualType(draft.type, content) === 'text'
      ? TEXT_WIREFRAME_MODULE_TYPE
      : DEFAULT_WIREFRAME_MODULE_TYPE;

  return {
    id: draft.id || globalThis.crypto?.randomUUID?.() || `wire-${Math.random().toString(36).slice(2, 10)}`,
    type: 'wireframe-block',
    x: Math.max(0, Math.round(draft.x)),
    y: Math.max(0, Math.round(draft.y)),
    width,
    height,
    props: {
      name: draft.name.trim() || '模块',
      moduleType,
      content,
      purpose: draft.purpose?.trim() || '',
      actions: normalizeModuleActions(draft.actions),
      priority: draft.priority?.trim() || '',
    },
    children: [],
  };
};

export const snapToGrid = (value: number, gridSize = 8) =>
  Math.round(value / gridSize) * gridSize;

const buildModuleMarkdownLines = (module: WireframeModuleDraft) => [
  `  - name: ${module.name}`,
  `    type: ${getWireframeModuleTypeLabel(module.type)}`,
  `    position: ${module.x}, ${module.y}`,
  `    size: ${module.width ?? MIN_MODULE_WIDTH}, ${module.height ?? MIN_MODULE_HEIGHT}`,
  ...(module.purpose ? [`    purpose: ${module.purpose}`] : []),
  ...(module.actions && module.actions.length > 0 ? [`    actions: ${module.actions.join(' / ')}`] : []),
  ...(module.priority ? [`    priority: ${module.priority}`] : []),
  `    content: ${module.content || EMPTY_MODULE_CONTENT}`,
];

export const buildPageWireframeMarkdown = (
  page: PageStructureNode,
  wireframe: WireframeDocument | null | undefined,
  featureTree: FeatureTree | null,
  appType?: AppType | null,
  canvasPresetOverride?: CanvasPreset
) => {
  const featureMap = new Map((featureTree?.children || []).map((feature) => [feature.id, feature.name]));
  const featureNames = page.featureIds.map((id) => featureMap.get(id) || id).filter(Boolean);
  const metadata = getPageMetadata(page);
  const canvasPreset = canvasPresetOverride || getCanvasPreset(appType);
  const frameValue = wireframe?.frame || formatCanvasPreset(canvasPreset);
  const modules = toWireframeModuleDrafts(wireframe?.elements || []);

  return [
    `## ${page.name}`,
    `- route: ${metadata.route}`,
    `- frame: ${frameValue}`,
    `- feature: ${featureNames.join(' / ') || metadata.goal}`,
    '- modules:',
    ...(modules.length > 0
      ? modules.flatMap((module) => buildModuleMarkdownLines(module))
      : [
          `  - name: ${EMPTY_MODULE_NAME}`,
          `    type: ${DEFAULT_WIREFRAME_MODULE_TYPE}`,
          '    position: 0, 0',
          `    size: ${MIN_MODULE_WIDTH}, ${MIN_MODULE_HEIGHT}`,
          `    content: ${EMPTY_MODULE_CONTENT}`,
        ]),
  ].join('\n');
};

export const buildWireframesMarkdown = (
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>,
  featureTree: FeatureTree | null,
  appType?: AppType | null
) => {
  const designPages = collectDesignPages(pageStructure);

  if (designPages.length === 0) {
    return '# 线框说明\n\n暂无页面线框。';
  }

  return [
    '# 线框说明',
    '',
    ...designPages.flatMap((page) => [buildPageWireframeMarkdown(page, wireframes[page.id], featureTree, appType), '']),
  ].join('\n');
};

export const parsePageWireframeMarkdown = (
  markdown: string,
  appType?: AppType | null
): CanvasElement[] => {
  return getMarkdownModuleMatches(markdown)
    .map((module) =>
      createWireframeModule(
        {
          name: module.name,
          type: module.type,
          x: module.x,
          y: module.y,
          width: module.width,
          height: module.height,
          purpose: module.purpose,
          actions: module.actions,
          priority: module.priority,
          content: module.content,
        },
        appType
      )
    );
};

export const parseFrameFromWireframeMarkdown = (markdown: string) => {
  const match = /^-\s+frame:\s*(.+)$/m.exec(markdown.replace(/\r/g, ''));
  return match?.[1]?.trim() || null;
};

const parseModuleBlock = (block: string, start: number): MarkdownModuleMatch | null => {
  const nameMatch = /^\s*-\s+name:\s*(.+)$/m.exec(block);
  const typeMatch = /^\s+type:\s*(.+)$/m.exec(block);
  const positionMatch = /^\s+position:\s*(\d+)\s*,\s*(\d+)$/m.exec(block);
  const sizeMatch = /^\s+size:\s*(\d+)\s*,\s*(\d+)$/m.exec(block);
  const purposeMatch = /^\s+purpose:\s*(.+)$/m.exec(block);
  const actionsMatch = /^\s+actions:\s*(.+)$/m.exec(block);
  const priorityMatch = /^\s+priority:\s*(.+)$/m.exec(block);
  const contentMatch = /^\s+content:\s*(.+)$/m.exec(block);
  const name = nameMatch?.[1]?.trim() || '';

  if (!name || name === EMPTY_MODULE_NAME || !positionMatch || !contentMatch) {
    return null;
  }

  return {
    name,
    type: typeMatch?.[1]?.trim() || undefined,
    x: Number(positionMatch[1]),
    y: Number(positionMatch[2]),
    width: sizeMatch?.[1] ? Number(sizeMatch[1]) : undefined,
    height: sizeMatch?.[2] ? Number(sizeMatch[2]) : undefined,
    purpose: purposeMatch?.[1]?.trim() || '',
    actions: normalizeModuleActions(actionsMatch?.[1]),
    priority: priorityMatch?.[1]?.trim() || '',
    content: contentMatch[1].trim() === EMPTY_MODULE_CONTENT ? '' : contentMatch[1].trim(),
    start,
    end: start + block.length,
  };
};

export const getMarkdownModuleMatches = (markdown: string): MarkdownModuleMatch[] => {
  const normalizedMarkdown = markdown.replace(/\r/g, '');
  const starts = [...normalizedMarkdown.matchAll(MODULE_BLOCK_START_REGEX)].map((match) => ({
    index: (match.index || 0) + (match[1] ? match[1].length : 0),
  }));

  return starts
    .map((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].index - 1 : normalizedMarkdown.length;
      const block = normalizedMarkdown.slice(start.index, end).trimEnd();
      return parseModuleBlock(block, start.index);
    })
    .filter((match): match is MarkdownModuleMatch => Boolean(match));
};

export const findMarkdownModuleMatch = (
  markdown: string,
  moduleDraft: WireframeModuleDraft | null | undefined
) => {
  if (!moduleDraft) {
    return null;
  }

  const matches = getMarkdownModuleMatches(markdown);

  return (
    matches.find((match) =>
      match.name === moduleDraft.name &&
      match.x === moduleDraft.x &&
      match.y === moduleDraft.y &&
      (match.width == null || match.width === moduleDraft.width) &&
      (match.height == null || match.height === moduleDraft.height)
    ) ||
    matches.find((match) => match.name === moduleDraft.name) ||
    null
  );
};

export const findMarkdownModuleByOffset = (markdown: string, offset: number) =>
  getMarkdownModuleMatches(markdown).find((match) => offset >= match.start && offset <= match.end) || null;
