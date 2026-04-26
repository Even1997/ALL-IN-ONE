import type { AppType, CanvasElement, PageStructureNode, WireframeDocument } from '../../types';

const MIN_MODULE_WIDTH = 80;
const MIN_MODULE_HEIGHT = 60;

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
  if (appType === 'mini_program') {
    return '390x844';
  }

  if (appType === 'mobile') {
    return '390x844';
  }

  return '1280x800';
};

const toModules = (elements: CanvasElement[] | undefined) =>
  (elements || []).map((element, index) => ({
    name:
      String(element.props.name || element.props.title || element.props.text || `模块 ${index + 1}`).trim() ||
      `模块 ${index + 1}`,
    x: Number.isFinite(element.x) ? Math.max(0, Math.round(element.x)) : 0,
    y: Number.isFinite(element.y) ? Math.max(0, Math.round(element.y)) : 0,
    width: Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH,
    height: Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT,
    content: String(element.props.content || element.props.placeholder || element.props.text || '').trim(),
  }));

const buildModulesSection = (elements: CanvasElement[] | undefined) => {
  const modules = toModules(elements);

  if (modules.length === 0) {
    return [
      '- modules:',
      '  - name: 暂无模块',
      '    position: 0, 0',
      `    size: ${MIN_MODULE_WIDTH}, ${MIN_MODULE_HEIGHT}`,
      '    content: 无',
    ];
  }

  return [
    '- modules:',
    ...modules.flatMap((module) => [
      `  - name: ${module.name}`,
      `    position: ${module.x}, ${module.y}`,
      `    size: ${module.width}, ${module.height}`,
      `    content: ${module.content || '无'}`,
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
    ...buildModulesSection(wireframe?.elements),
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
  const moduleRegex =
    /(^|\n)\s*-\s+name:\s*(.+?)\s*\n\s+position:\s*(\d+)\s*,\s*(\d+)\s*\n\s+size:\s*(\d+)\s*,\s*(\d+)\s*\n\s+content:\s*(.+?)(?=\n\s*-\s+name:|\n*$)/gms;
  const elements: CanvasElement[] = [];
  let match = moduleRegex.exec(content);

  while (match) {
    const moduleName = match[2].trim();
    if (moduleName !== '暂无模块') {
      const moduleContent = match[7].trim() === '无' ? '' : match[7].trim();
      elements.push({
        id: `${pageId}:module:${elements.length + 1}`,
        type: 'wireframe-block',
        x: Number(match[3]),
        y: Number(match[4]),
        width: Number(match[5]),
        height: Number(match[6]),
        props: {
          name: moduleName,
          content: moduleContent,
        },
        children: [],
      });
    }

    match = moduleRegex.exec(content);
  }

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
