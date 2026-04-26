import { AppType, CanvasElement, FeatureTree, PageStructureNode, WireframeDocument } from '../types';

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
  x: number;
  y: number;
  width?: number;
  height?: number;
  content: string;
}

export interface MarkdownModuleMatch {
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content: string;
  start: number;
  end: number;
}

const MOBILE_APP_TYPES: AppType[] = ['mobile', 'mini_program'];
export const MIN_MODULE_WIDTH = 80;
export const MIN_MODULE_HEIGHT = 60;
const FRAME_SIZE_REGEX = /^(?:(.+?)\s+)?(\d+)\s*x\s*(\d+)$/i;
const MOBILE_FRAME_REGEX = /(mobile|mini|phone|移动|手机|小程序)/i;

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

export const isMobileAppType = (appType?: AppType | null) => Boolean(appType && MOBILE_APP_TYPES.includes(appType));

export const formatCanvasPreset = (preset: CanvasPreset) => `${preset.width}x${preset.height}`;

export const getCanvasPreset = (appType?: AppType | null): CanvasPreset => {
  if (isMobileAppType(appType)) {
    return {
      width: 390,
      height: 844,
      frameType: 'mobile',
      label: appType === 'mini_program' ? '小程序线框' : '移动端线框',
      description: '移动端画布，适合单列页面和底部主操作。',
    };
  }

  return {
    width: 1280,
    height: 800,
    frameType: 'browser',
    label: 'Web 端线框',
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
  const label = explicitLabel || (inferredMobile ? '移动端线框' : 'Web 端线框');
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

  return rawContent ? String(rawContent) : '';
};

export const toWireframeModuleDrafts = (elements: CanvasElement[]): WireframeModuleDraft[] =>
  elements.map((element, index) => ({
    id: element.id,
    name: getElementName(element, index),
    x: Number.isFinite(element.x) ? Math.max(0, Math.round(element.x)) : 0,
    y: Number.isFinite(element.y) ? Math.max(0, Math.round(element.y)) : 0,
    width: Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH,
    height: Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT,
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

  return {
    id: draft.id || globalThis.crypto?.randomUUID?.() || `wire-${Math.random().toString(36).slice(2, 10)}`,
    type: 'wireframe-block',
    x: Math.max(0, Math.round(draft.x)),
    y: Math.max(0, Math.round(draft.y)),
    width,
    height,
    props: {
      name: draft.name.trim() || '未命名模块',
      content,
    },
    children: [],
  };
};

export const snapToGrid = (value: number, gridSize = 8) =>
  Math.round(value / gridSize) * gridSize;

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
      ? modules.flatMap((module) => [
          `  - name: ${module.name}`,
          `    position: ${module.x}, ${module.y}`,
          `    size: ${module.width ?? MIN_MODULE_WIDTH}, ${module.height ?? MIN_MODULE_HEIGHT}`,
          `    content: ${module.content || '无'}`,
        ])
      : ['  - name: 暂无模块', '    position: 0, 0', `    size: ${MIN_MODULE_WIDTH}, ${MIN_MODULE_HEIGHT}`, '    content: 无']),
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
    .map((module) => ({
      name: module.name,
      x: module.x,
      y: module.y,
      width: module.width,
      height: module.height,
      content: module.content,
    }))
    .map((module) => createWireframeModule(module, appType));
};

export const parseFrameFromWireframeMarkdown = (markdown: string) => {
  const match = /^-\s+frame:\s*(.+)$/m.exec(markdown.replace(/\r/g, ''));
  return match?.[1]?.trim() || null;
};

export const getMarkdownModuleMatches = (markdown: string): MarkdownModuleMatch[] => {
  const matches: MarkdownModuleMatch[] = [];
  const moduleRegex =
    /(^|\n)(\s*-\s+name:\s*(.+?)\s*\n\s+position:\s*(\d+)\s*,\s*(\d+)\s*(?:\n\s+size:\s*(\d+)\s*,\s*(\d+)\s*)?\n\s+content:\s*(.+?))(?=\n\s+-\s+name:|\n*$)/gms;

  let match = moduleRegex.exec(markdown);

  while (match) {
    const blockStart = (match.index || 0) + (match[1] ? match[1].length : 0);
    const block = match[2];
    const name = match[3].trim();

    if (name !== '暂无模块') {
      matches.push({
        name,
        x: Number(match[4]),
        y: Number(match[5]),
        width: match[6] ? Number(match[6]) : undefined,
        height: match[7] ? Number(match[7]) : undefined,
        content: match[8].trim() === '无' ? '' : match[8].trim(),
        start: blockStart,
        end: blockStart + block.length,
      });
    }

    match = moduleRegex.exec(markdown);
  }

  return matches;
};

export const findMarkdownModuleMatch = (
  markdown: string,
  moduleDraft: WireframeModuleDraft | null | undefined
) => {
  if (!moduleDraft) {
    return null;
  }

  const matches = getMarkdownModuleMatches(markdown);

  return matches.find((match) =>
    match.name === moduleDraft.name &&
    match.x === moduleDraft.x &&
    match.y === moduleDraft.y &&
    (match.width == null || match.width === moduleDraft.width) &&
    (match.height == null || match.height === moduleDraft.height)
  ) || matches.find((match) => match.name === moduleDraft.name) || null;
};

export const findMarkdownModuleByOffset = (markdown: string, offset: number) =>
  getMarkdownModuleMatches(markdown).find((match) => offset >= match.start && offset <= match.end) || null;
