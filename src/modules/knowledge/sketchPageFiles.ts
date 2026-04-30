import type { AppType, PageStructureNode, WireframeDocument } from '../../types';
import {
  createWireframeModule,
  getCanvasPreset,
  getMarkdownModuleMatches,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  toWireframeModuleDrafts,
} from '../../utils/wireframe';

const EMPTY_MODULE_NAME = '暂无模块';
const EMPTY_MODULE_CONTENT = '无';

const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

const basename = (value: string) => {
  const normalized = normalizePath(value);
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
};

const stripMarkdownExtension = (value: string) => value.replace(/\.(md|markdown)$/i, '');
const getSketchPageNameFromPath = (value: string) => stripMarkdownExtension(basename(value));

export const slugifySketchPart = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

export const buildSketchPagePath = (page: Pick<PageStructureNode, 'id' | 'name'>) =>
  /^sketch\/pages\/.+\.(md|markdown)$/i.test(normalizePath(page.id))
    ? normalizePath(page.id)
    : `sketch/pages/${page.id}-${slugifySketchPart(page.name)}.md`;

const getRoute = (page: Partial<PageStructureNode>) =>
  page.metadata?.route || `/${slugifySketchPart(page.name || 'page')}`;

const getGoal = (page: Partial<PageStructureNode>) =>
  page.metadata?.goal || page.description || page.name || '未命名页面';

const getDefaultFrame = (appType?: AppType | null) => {
  const preset = getCanvasPreset(appType);
  return `${preset.width}x${preset.height}`;
};

const buildModulesSection = (wireframe: WireframeDocument | null | undefined) => {
  const modules = toWireframeModuleDrafts(wireframe?.elements || []);

  if (modules.length === 0) {
    return [
      '- modules:',
      `  - name: ${EMPTY_MODULE_NAME}`,
      '    position: 0, 0',
      `    size: ${MIN_MODULE_WIDTH}, ${MIN_MODULE_HEIGHT}`,
      `    content: ${EMPTY_MODULE_CONTENT}`,
    ];
  }

  return [
    '- modules:',
    ...modules.flatMap((module) => [
      `  - name: ${module.name}`,
      `    position: ${module.x}, ${module.y}`,
      `    size: ${module.width ?? MIN_MODULE_WIDTH}, ${module.height ?? MIN_MODULE_HEIGHT}`,
      ...(module.purpose ? [`    purpose: ${module.purpose}`] : []),
      ...(module.actions && module.actions.length > 0 ? [`    actions: ${module.actions.join(' / ')}`] : []),
      ...(module.priority ? [`    priority: ${module.priority}`] : []),
      `    content: ${module.content || EMPTY_MODULE_CONTENT}`,
    ]),
  ];
};

export const buildSketchPageContent = (
  page: Pick<PageStructureNode, 'name'> & Partial<PageStructureNode>,
  wireframe: WireframeDocument | null | undefined,
  appType?: AppType | null
) =>
  [
    `# ${page.name}`,
    '',
    `- route: ${getRoute(page)}`,
    `- frame: ${wireframe?.frame || getDefaultFrame(appType)}`,
    `- goal: ${getGoal(page)}`,
    ...buildModulesSection(wireframe),
  ].join('\n');

const parseField = (content: string, name: 'route' | 'goal' | 'frame') => {
  const match = new RegExp(`^- ${name}:\\s*(.+)$`, 'm').exec(content);
  return match?.[1]?.trim() || '';
};

export const parseSketchPageFile = (relativePath: string, content: string) => {
  const name = getSketchPageNameFromPath(relativePath);
  const route = parseField(content, 'route') || `/${slugifySketchPart(name)}`;
  const frame = parseField(content, 'frame');
  const goal = parseField(content, 'goal') || name;
  const pageId = normalizePath(relativePath);
  const elements = getMarkdownModuleMatches(content).map((module, index) =>
    createWireframeModule({
      id: `${pageId}:module:${index + 1}`,
      name: module.name,
      x: module.x,
      y: module.y,
      width: module.width,
      height: module.height,
      purpose: module.purpose,
      actions: module.actions,
      priority: module.priority,
      content: module.content,
    })
  );

  const page: PageStructureNode = {
    id: pageId,
    name,
    kind: 'page',
    description: goal,
    featureIds: [],
    metadata: {
      route,
      title: name,
      goal,
      template: 'custom',
      ownerRole: 'UI设计',
      notes: '',
      status: elements.length > 0 ? 'ready' : 'draft',
    },
    children: [],
  };

  const wireframe: WireframeDocument = {
    id: `wireframe:${pageId}`,
    pageId,
    pageName: name,
    frame: frame || undefined,
    elements,
    updatedAt: new Date().toISOString(),
    status: elements.length > 0 ? 'ready' : 'draft',
  };

  return {
    page,
    wireframe,
  };
};
