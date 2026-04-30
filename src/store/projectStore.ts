import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  DocumentChangeAction,
  DocumentChangeEvent,
  DocumentChangeTrigger,
  FeatureNode,
  FeatureTree,
  GraphEdge,
  GraphNodeBase,
  CanvasElement,
  DeployPlanDoc,
  DesignSystemDoc,
  DesignTokenGroup,
  DevTask,
  GeneratedFile,
  KnowledgeRetrievalMethod,
  PageStructureNode,
  ProductPRD,
  ProjectConfig,
  ProjectGraph,
  ProjectMemory,
  RequirementDoc,
  TestPlanDoc,
  UISpecDoc,
  WireframeDocument,
} from '../types';
import { featureTreeToMarkdown, markdownToFeatureTree } from '../utils/featureTreeToMarkdown';
import { buildWireframesMarkdown } from '../utils/wireframe';

export interface CreateProjectInput {
  name: string;
  description: string;
  vaultPath: string;
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
}

export interface ProjectWorkspaceSnapshot {
  currentProject: ProjectConfig | null;
  graph: ProjectGraph;
  memory: ProjectMemory | null;
  rawRequirementInput: string;
  featuresMarkdown: string;
  wireframesMarkdown: string;
  requirementDocs: RequirementDoc[];
  documentEvents: DocumentChangeEvent[];
  activeKnowledgeFileId: string | null;
  selectedKnowledgeContextIds: string[];
  prd: ProductPRD | null;
  pageStructure: PageStructureNode[];
  wireframes: Record<string, WireframeDocument>;
  designSystem: DesignSystemDoc | null;
  uiSpecs: UISpecDoc[];
  devTasks: DevTask[];
  generatedFiles: GeneratedFile[];
  testPlan: TestPlanDoc | null;
  deployPlan: DeployPlanDoc | null;
}

interface ProjectState {
  projects: ProjectConfig[];
  currentProjectId: string | null;
  currentProject: ProjectConfig | null;
  graph: ProjectGraph;
  memory: ProjectMemory | null;
  rawRequirementInput: string;
  featuresMarkdown: string;
  wireframesMarkdown: string;
  requirementDocs: RequirementDoc[];
  documentEvents: DocumentChangeEvent[];
  activeKnowledgeFileId: string | null;
  selectedKnowledgeContextIds: string[];
  prd: ProductPRD | null;
  pageStructure: PageStructureNode[];
  wireframes: Record<string, WireframeDocument>;
  designSystem: DesignSystemDoc | null;
  uiSpecs: UISpecDoc[];
  devTasks: DevTask[];
  generatedFiles: GeneratedFile[];
  testPlan: TestPlanDoc | null;
  deployPlan: DeployPlanDoc | null;
  createProject: (input: CreateProjectInput) => { project: ProjectConfig; featureTree: FeatureTree };
  loadProjectWorkspace: (snapshot: ProjectWorkspaceSnapshot) => void;
  switchProject: (project: ProjectConfig) => void;
  deleteProject: (projectId: string) => void;
  updateProject: (updates: Partial<Omit<ProjectConfig, 'id' | 'createdAt'>>) => void;
  setRawRequirementInput: (value: string) => void;
  setFeaturesMarkdown: (value: string) => void;
  setActiveKnowledgeFileId: (id: string | null) => void;
  setSelectedKnowledgeContextIds: (ids: string[]) => void;
  toggleKnowledgeContextId: (id: string) => void;
  updateRequirementDoc: (
    id: string,
    updates: Partial<Pick<RequirementDoc, 'title' | 'content' | 'summary' | 'status' | 'sourceType' | 'filePath' | 'kind' | 'docType' | 'tags' | 'relatedIds'>>
  ) => void;
  addRequirementDoc: () => RequirementDoc | null;
  deleteRequirementDoc: (id: string) => void;
  ingestRequirementDoc: (input: { title: string; content: string; sourceType?: RequirementDoc['sourceType']; filePath?: string }) => void;
  replaceRequirementDocs: (docs: RequirementDoc[]) => void;
  replacePageStructure: (pageStructure: PageStructureNode[], featureTree: FeatureTree | null) => void;
  replaceWireframes: (wireframes: Record<string, WireframeDocument>, featureTree: FeatureTree | null) => void;
  mergeGeneratedFilesFromAI: (files: GeneratedFile[]) => void;
  generatePlanningArtifacts: (featureTree: FeatureTree | null) => FeatureTree | null;
  generateProductArtifactsFromRequirements: () => FeatureTree | null;
  updateWireframeFrame: (page: Pick<PageStructureNode, 'id' | 'name'>, frame: string) => void;
  saveWireframeDraft: (page: Pick<PageStructureNode, 'id' | 'name'>, elements: CanvasElement[]) => void;
  upsertWireframe: (page: Pick<PageStructureNode, 'id' | 'name'>, elements: CanvasElement[]) => void;
  addRootPage: () => PageStructureNode | null;
  addSiblingPage: (referencePageId: string) => PageStructureNode | null;
  addChildPage: (parentPageId: string) => PageStructureNode | null;
  deletePageStructureNode: (pageId: string) => void;
  updatePageStructureNode: (
    pageId: string,
    updates: Partial<Pick<PageStructureNode, 'name' | 'description'>> & {
      metadata?: Partial<PageStructureNode['metadata']>;
    }
  ) => void;
  generateDeliveryArtifacts: (featureTree: FeatureTree | null) => void;
  clearProject: () => void;
}

const buildStarterFeatureTree = (projectName: string): FeatureTree => ({
  id: uuidv4(),
  name: projectName,
  children: [
    {
      id: uuidv4(),
      name: '需求分析',
      status: 'in_progress',
      priority: 'high',
      progress: 30,
      linkedPrototypePageIds: [],
      linkedCodeFiles: [],
      children: [],
    },
    {
      id: uuidv4(),
      name: '页面结构设计',
      status: 'pending',
      priority: 'high',
      progress: 0,
      linkedPrototypePageIds: [],
      linkedCodeFiles: [],
      children: [],
    },
    {
      id: uuidv4(),
      name: '开发工作区接入',
      status: 'pending',
      priority: 'medium',
      progress: 0,
      linkedPrototypePageIds: [],
      linkedCodeFiles: [],
      children: [],
    },
  ],
});

const createFeature = (
  name: string,
  overrides: Partial<FeatureNode> = {},
  children: FeatureNode[] = []
): FeatureNode => ({
  id: uuidv4(),
  name,
  description: '',
  details: [],
  inputs: [],
  outputs: [],
  dependencies: [],
  acceptanceCriteria: [],
  status: 'pending',
  priority: 'medium',
  progress: 0,
  linkedPrototypePageIds: [],
  linkedCodeFiles: [],
  children,
  ...overrides,
});

const summarizeRequirement = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
};

const normalizeRequirementTitle = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!normalized) {
    return '未命名需求.md';
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
};

const normalizeKnowledgeRetrievalMethod = (value: unknown): KnowledgeRetrievalMethod =>
  value === 'llmwiki' || value === 'rag' ? value : 'm-flow';

const MAX_DOCUMENT_CHANGE_EVENTS = 200;

const areStringArraysEqual = (left: string[] = [], right: string[] = []) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const hasRequirementDocChanged = (previous: RequirementDoc, next: RequirementDoc) =>
  previous.title !== next.title ||
  previous.content !== next.content ||
  previous.summary !== next.summary ||
  previous.status !== next.status ||
  previous.sourceType !== next.sourceType ||
  previous.filePath !== next.filePath ||
  previous.kind !== next.kind ||
  previous.docType !== next.docType ||
  !areStringArraysEqual(previous.tags || [], next.tags || []) ||
  !areStringArraysEqual(previous.relatedIds || [], next.relatedIds || []);

const buildDocumentChangeSummary = (
  documentTitle: string,
  action: DocumentChangeAction,
  trigger: DocumentChangeTrigger
) => {
  const quotedTitle = `《${documentTitle}》`;

  if (trigger === 'import') {
    return `导入文档${quotedTitle}`;
  }

  if (trigger === 'sync') {
    if (action === 'created') {
      return `同步新增文档${quotedTitle}`;
    }

    if (action === 'updated') {
      return `同步更新文档${quotedTitle}`;
    }

    return `同步删除文档${quotedTitle}`;
  }

  if (action === 'created') {
    return `新建文档${quotedTitle}`;
  }

  if (action === 'updated') {
    return `更新文档${quotedTitle}`;
  }

  return `删除文档${quotedTitle}`;
};

const buildDocumentChangeEvent = (
  projectId: string,
  document: RequirementDoc,
  action: DocumentChangeAction,
  trigger: DocumentChangeTrigger
): DocumentChangeEvent => ({
  id: uuidv4(),
  projectId,
  documentId: document.id,
  documentTitle: document.title,
  action,
  trigger,
  sourceType: document.sourceType,
  filePath: document.filePath,
  summary: buildDocumentChangeSummary(document.title, action, trigger),
  timestamp: new Date().toISOString(),
});

const appendDocumentEvents = (
  currentEvents: DocumentChangeEvent[],
  nextEvents: DocumentChangeEvent[]
) => (nextEvents.length > 0 ? [...nextEvents, ...currentEvents].slice(0, MAX_DOCUMENT_CHANGE_EVENTS) : currentEvents);

const collectRequirementDocEvents = (
  previousDocs: RequirementDoc[],
  nextDocs: RequirementDoc[],
  projectId: string,
  trigger: DocumentChangeTrigger
) => {
  const previousById = new Map(previousDocs.map((doc) => [doc.id, doc]));
  const nextById = new Map(nextDocs.map((doc) => [doc.id, doc]));
  const events: DocumentChangeEvent[] = [];

  nextDocs.forEach((doc) => {
    const previousDoc = previousById.get(doc.id);
    if (!previousDoc) {
      events.push(buildDocumentChangeEvent(projectId, doc, 'created', trigger));
      return;
    }

    if (hasRequirementDocChanged(previousDoc, doc)) {
      events.push(buildDocumentChangeEvent(projectId, doc, 'updated', trigger));
    }
  });

  previousDocs.forEach((doc) => {
    if (!nextById.has(doc.id)) {
      events.push(buildDocumentChangeEvent(projectId, doc, 'deleted', trigger));
    }
  });

  return events;
};

const collectRequirementLines = (rawRequirementInput: string, docs: RequirementDoc[]) =>
  [rawRequirementInput, ...docs.map((doc) => `${doc.title}\n${doc.content}\n${doc.summary}`)]
    .join('\n')
    .split('\n')
    .map((line) => line.replace(/^[-*#\d.\s]+/, '').trim())
    .filter((line) => line.length > 4);

const buildFeatureTreeFromRequirements = (
  projectName: string,
  rawRequirementInput: string,
  docs: RequirementDoc[]
): FeatureTree => {
  const lines = collectRequirementLines(rawRequirementInput, docs);
  const hasWireframe = lines.some((line) => /线稿|草图|wireframe/i.test(line));
  const hasMarkdown = lines.some((line) => /markdown|树状|层级|功能清单/i.test(line));
  const hasAI = lines.some((line) => /\bai\b|智能|头脑风暴|skill/i.test(line));
  const firstSummary = summarizeRequirement(lines[0] || rawRequirementInput || `${projectName} 产品规划`);

  return {
    id: uuidv4(),
    name: `${projectName} 产品规划`,
    children: [
      createFeature(
        '需求协作流程',
        {
          description: '让产品可以描述需求、选择技能并通过 AI 头脑风暴快速形成产品资料。',
          details: ['支持直接输入需求', '支持选择 skill', '保留 AI 生成上下文'],
          inputs: ['原始需求文本', '需求文档上传', '选中的 skill'],
          outputs: ['PRD 草案', '功能清单', '线稿任务'],
          acceptanceCriteria: ['能从需求输入进入规划', 'AI 提示词可复用', '产品文档可持续修改'],
          priority: 'critical',
          progress: 60,
          status: 'in_progress',
        },
        [
          createFeature('输入需求与文档沉淀', {
            description: firstSummary,
            details: lines.slice(0, 3),
            priority: 'high',
          }),
          createFeature('Skill 选择与 AI 头脑风暴', {
            description: '把需求、skill 与上下文组合成 AI 可继续执行的规划入口。',
            details: ['记录当前选中的 skill', '生成可复用 prompt', '打开 AI 协作面板'],
            priority: hasAI ? 'critical' : 'high',
          }),
        ]
      ),
      createFeature(
        '树状功能清单',
        {
          description: '功能清单需要支持多层级树结构，并以 Markdown 形式长期保存在本地。',
          details: ['层级结构代表父子概念', 'Markdown 需要可编辑和回灌', '方便后续 AI 查询与引用'],
          outputs: ['features.md', '功能节点上下文'],
          acceptanceCriteria: ['支持多层级编辑', '支持 Markdown 回灌', '节点与页面/线稿存在关联'],
          priority: hasMarkdown ? 'critical' : 'high',
          progress: 55,
          status: 'in_progress',
        },
        [
          createFeature('功能树编辑', {
            description: '增删改查树节点并维护层级关系。',
            details: ['节点描述', '输入输出', '依赖与验收'],
          }),
          createFeature('Markdown 本地存储', {
            description: '将功能树以 Markdown 形式存储在本地，并可被 AI 检索。',
            outputs: ['src/generated/planning/features.md'],
          }),
        ]
      ),
      createFeature(
        '功能线稿绑定',
        {
          description: '每个功能需要对应线稿图，线稿图支持拖拉拽、修改与后续 UI 设计。',
          details: ['页面级线稿档案', '元素坐标与尺寸持久化', '线稿与功能信息绑定'],
          outputs: ['wireframes.json', 'wireframes.md'],
          acceptanceCriteria: ['能选择页面继续编辑', '元素位置信息可回放', 'AI 可读取线稿上下文'],
          priority: hasWireframe ? 'critical' : 'high',
          progress: 50,
          status: 'in_progress',
        },
        [
          createFeature('线稿编辑画布', {
            description: '支持拖拽组件、调整位置和尺寸。',
          }),
          createFeature('线稿结构化存储', {
            description: '存储页面、功能、元素位置与说明，方便后续 UI 生成。',
          }),
        ]
      ),
      createFeature(
        '产品工作台布局',
        {
          description: '界面左侧展示需求/功能菜单，中间和右侧根据当前点击展示文档、功能或线稿。',
          details: ['左侧导航树', '中右双显示器', '上下文侧栏'],
          acceptanceCriteria: ['产品无需频繁切 tab', '点击不同条目直接切换查看器'],
          priority: 'high',
          progress: 45,
          status: 'in_progress',
        },
        [
          createFeature('左侧需求与功能导航'),
          createFeature('中区主查看器'),
          createFeature('右区上下文与 AI 协作'),
        ]
      ),
    ],
  };
};

const buildProjectMemory = (_project: ProjectConfig): ProjectMemory => ({
  designSystem: {
    mode: 'draft',
    source: 'workspace',
  },
  codeStructure: {
    frontendRoot: 'src',
    generatedRoot: 'src/generated',
  },
});

const buildStarterRawRequirementInput = (projectName: string, projectDescription = '') =>
  projectDescription.trim()
    ? `${projectName}\n${projectDescription.trim()}`
    : `${projectName} 需要成为一个可视化的软件生产工作台。\n支持需求梳理、功能拆分、页面结构设计、线框图编辑，并逐步衔接代码、测试和部署流程。`;

const mapRequirementStatus = (status: RequirementDoc['status']): GraphNodeBase['status'] =>
  status === 'ready' ? 'ready' : 'draft';

const mapFeatureStatus = (status: FeatureNode['status']): GraphNodeBase['status'] => {
  switch (status) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'in_progress';
    case 'failed':
      return 'failed';
    default:
      return 'draft';
  }
};

const mapPrdStatus = (status: ProductPRD['status']): GraphNodeBase['status'] =>
  status === 'ready' ? 'ready' : 'draft';

const ensureFeatureName = (feature?: FeatureNode) => feature?.name || '核心功能';

const buildDefaultPageMetadata = (
  node: Pick<PageStructureNode, 'name' | 'kind' | 'description'>
): PageStructureNode['metadata'] => ({
  route: `/${node.kind}/${node.name.toLowerCase().replace(/\s+/g, '-')}`,
  title: node.name,
  goal: node.description,
  template: node.kind === 'page' ? 'detail' : 'workspace',
  ownerRole: node.kind === 'flow' ? '产品' : node.kind === 'page' ? 'UI设计' : '开发',
  notes: '',
  status: 'draft',
});

const getPageMetadata = (node: Pick<PageStructureNode, 'name' | 'kind' | 'description'> & { metadata?: PageStructureNode['metadata'] }) => ({
  ...buildDefaultPageMetadata(node),
  ...node.metadata,
});

const buildPRDFromProject = (
  project: ProjectConfig,
  docs: RequirementDoc[],
  rawRequirementInput: string,
  featureTree: FeatureTree | null
): ProductPRD => {
  const features = featureTree?.children || [];
  const now = new Date().toISOString();
  const summarySource = docs.map((doc) => doc.summary).filter(Boolean).join('；');

  return {
    id: uuidv4(),
    title: `${project.name} PRD`,
    summary: summarySource || `${project.name} 的产品目标与 MVP 范围整理`,
    updatedAt: now,
    status: 'ready',
    sections: [
      {
        id: uuidv4(),
        title: '产品目标',
        content: rawRequirementInput || `${project.name} 聚焦 ${project.appType} 场景，形成从需求到交付的连续工作流。`,
      },
      {
        id: uuidv4(),
        title: 'MVP 范围',
        content:
          features.length > 0
            ? features.map((feature, index) => `${index + 1}. ${feature.name}`).join('\n')
            : '1. 需求管理\n2. 页面结构设计\n3. 线框图编辑',
      },
      {
        id: uuidv4(),
        title: '核心流程',
        content: '项目创建 -> 需求输入 -> PRD -> Feature Tree -> Page Structure -> Wireframe -> 开发工作区',
      },
    ],
  };
};

export const buildPageStructureFromFeatureTree = (featureTree: FeatureTree | null): PageStructureNode[] => {
  const features = featureTree?.children || [];

  return [
    {
      id: uuidv4(),
      name: '产品门户',
      kind: 'flow',
      description: '承接需求输入、PRD 查看与功能规划。',
      featureIds: features[0] ? [features[0].id] : [],
      metadata: {
        route: '/product',
        title: '产品门户',
        goal: '集中查看需求、PRD 与规划结果。',
        template: 'workspace',
        ownerRole: '产品',
        notes: '作为需求到规划产物的统一入口。',
        status: 'ready',
      },
      children: [
        {
          id: uuidv4(),
          name: '需求工作台',
          kind: 'page',
          description: `集中录入原始需求、补充约束，并沉淀成 PRD。`,
          featureIds: features[0] ? [features[0].id] : [],
          metadata: {
            route: '/product/requirements',
            title: '需求工作台',
            goal: '沉淀原始需求并生成 PRD。',
            template: 'form',
            ownerRole: '产品',
            notes: '适合放置需求输入区、需求条目列表和规划操作。',
            status: 'ready',
          },
          children: [],
        },
      ],
    },
    {
      id: uuidv4(),
      name: '设计工作台',
      kind: 'flow',
      description: '用于承接页面结构、线框图和设计系统演进。',
      featureIds: features[1] ? [features[1].id] : [],
      metadata: {
        route: '/design',
        title: '设计工作台',
        goal: '组织页面结构与线框图设计。',
        template: 'workspace',
        ownerRole: 'UI设计',
        notes: '后续会扩展设计系统和 UI 规范输出。',
        status: 'ready',
      },
      children: [
        {
          id: uuidv4(),
          name: '页面结构总览',
          kind: 'page',
          description: `梳理 ${ensureFeatureName(features[1])} 对应的页面和模块关系。`,
          featureIds: features[1] ? [features[1].id] : [],
          metadata: {
            route: '/design/pages',
            title: '页面结构总览',
            goal: '确认页面信息架构与模块关系。',
            template: 'list',
            ownerRole: 'UI设计',
            notes: '适合作为页面清单和上下游结构浏览入口。',
            status: 'ready',
          },
          children: [],
        },
        {
          id: uuidv4(),
          name: '线框图画布',
          kind: 'module',
          description: '页面结构确认后进入线框图编辑。',
          featureIds: features[1] ? [features[1].id] : [],
          metadata: {
            route: '/design/wireframe',
            title: '线框图画布',
            goal: '把页面结构细化为页面级布局草图。',
            template: 'workspace',
            ownerRole: 'UI设计',
            notes: '当前以页面级 wireframe 持久化为主。',
            status: 'draft',
          },
          children: [],
        },
      ],
    },
    {
      id: uuidv4(),
      name: '开发工作台',
      kind: 'flow',
      description: '连接真实文件系统、AI 编码和终端执行。',
      featureIds: features[2] ? [features[2].id] : [],
      metadata: {
        route: '/develop',
        title: '开发工作台',
        goal: '连接代码生成、文件编辑与执行。',
        template: 'workspace',
        ownerRole: '开发',
        notes: '下一阶段接真实文件树与终端。',
        status: 'draft',
      },
      children: [
        {
          id: uuidv4(),
          name: '代码生成入口',
          kind: 'page',
          description: `围绕 ${ensureFeatureName(features[2])} 打通开发链路。`,
          featureIds: features[2] ? [features[2].id] : [],
          metadata: {
            route: '/develop/codegen',
            title: '代码生成入口',
            goal: '将结构化设计产物转为开发任务。',
            template: 'dashboard',
            ownerRole: '开发',
            notes: '后续会接入真实文件树和任务编排。',
            status: 'draft',
          },
          children: [],
        },
      ],
    },
  ];
};

const collectPageNodes = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [node, ...collectPageNodes(node.children)]);

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  collectPageNodes(nodes).filter((node) => node.kind === 'page');

const toKebabCase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

const createComponentLabel = (element: CanvasElement, index: number) => {
  const textValue =
    typeof element.props.text === 'string'
      ? element.props.text
      : typeof element.props.title === 'string'
        ? element.props.title
        : typeof element.props.placeholder === 'string'
          ? element.props.placeholder
          : '';

  return textValue || `${element.type}-${index + 1}`;
};

export const buildWireframesFromPages = (pages: PageStructureNode[]): Record<string, WireframeDocument> => {
  const now = new Date().toISOString();

  return pages.reduce<Record<string, WireframeDocument>>((acc, page) => {
    acc[page.id] = {
      id: uuidv4(),
      pageId: page.id,
      pageName: page.name,
      elements: [],
      updatedAt: now,
      status: 'draft',
    };

    return acc;
  }, {});
};

const reconcileWireframes = (
  pages: PageStructureNode[],
  currentWireframes: Record<string, WireframeDocument>
): Record<string, WireframeDocument> => {
  const nextPageIds = new Set(pages.map((page) => page.id));
  const now = new Date().toISOString();

  return pages.reduce<Record<string, WireframeDocument>>((acc, page) => {
    const existing = currentWireframes[page.id];

    acc[page.id] = existing
      ? {
          ...existing,
          pageName: page.name,
        }
      : {
          id: uuidv4(),
          pageId: page.id,
          pageName: page.name,
          elements: [],
          updatedAt: now,
          status: 'draft',
        };

    return acc;
  }, Object.fromEntries(Object.entries(currentWireframes).filter(([pageId]) => nextPageIds.has(pageId))));
};

const buildDesignSystemDoc = (
  project: ProjectConfig,
  pages: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>
): DesignSystemDoc => {
  const now = new Date().toISOString();
  const allElements = pages.flatMap((page) => wireframes[page.id]?.elements || []);
  const uniqueTypes = Array.from(new Set(allElements.map((element) => element.type)));

  return {
    id: uuidv4(),
    name: `${project.name} Design System`,
    summary: '围绕当前页面结构与线框生成的基础设计系统草案。',
    principles: [
      '优先保持页面结构与功能任务的一致性',
      '组件命名和布局语义应能映射到开发任务',
      '优先使用清晰层级、稳定间距和可复用组件模式',
    ],
    tokens: {
      color: {
        label: 'Color',
        values: ['#0f172a', '#1d4ed8', '#f8fafc', '#e2e8f0', '#16a34a'],
      },
      typography: {
        label: 'Typography',
        values: ['title/28 semibold', 'heading/20 semibold', 'body/14 regular', 'caption/12 medium'],
      },
      spacing: {
        label: 'Spacing',
        values: ['4', '8', '12', '16', '24', '32'],
      },
      radius: {
        label: 'Radius',
        values: ['6', '10', '14', '20'],
      },
    },
    componentPatterns: uniqueTypes.map((type) => ({
      id: uuidv4(),
      name: type,
      description: `${type} 组件在当前 wireframe 中已出现，可作为可复用 UI 模式沉淀。`,
      sourcePageIds: pages.filter((page) => (wireframes[page.id]?.elements || []).some((element) => element.type === type)).map((page) => page.id),
    })),
    updatedAt: now,
    status: pages.length > 0 ? 'ready' : 'draft',
  };
};

const buildUISpecDocs = (
  pages: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>
): UISpecDoc[] => {
  const now = new Date().toISOString();

  return pages.map((page) => {
    const metadata = getPageMetadata(page);
    const elements = wireframes[page.id]?.elements || [];

    return {
      id: uuidv4(),
      pageId: page.id,
      pageName: page.name,
      route: metadata.route,
      template: metadata.template,
      sections:
        elements.length > 0
          ? elements.map((element, index) => `${index + 1}. ${element.type} 区块`)
          : ['Header 区', '核心内容区', '操作区'],
      interactionNotes: [
        metadata.goal || '需要支持基础信息浏览与操作反馈。',
        metadata.notes || '后续可补交互态、空态和异常态设计。',
      ],
      components: elements.map((element, index) => ({
        id: element.id,
        type: element.type,
        label: createComponentLabel(element, index),
        behavior: `${element.type} 组件需与页面目标保持一致，并支持基础交互反馈。`,
      })),
      status: 'ready',
      updatedAt: now,
    };
  });
};

const buildDevTasks = (
  features: FeatureNode[],
  pages: PageStructureNode[],
  uiSpecs: UISpecDoc[],
  _project: ProjectConfig
): DevTask[] => {
  const frontendTasks = pages.map((page) => {
    const spec = uiSpecs.find((item) => item.pageId === page.id);
    const fileName = toKebabCase(page.name) || 'page';
    return {
      id: uuidv4(),
      title: `实现页面：${page.name}`,
      summary: `基于 ${page.name} 的 UI Spec 搭建页面骨架。`,
      owner: 'frontend' as const,
      status: 'ready' as const,
      pageId: page.id,
      featureId: page.featureIds[0],
      relatedFilePaths: [`src/generated/pages/${fileName}.tsx`, `src/generated/pages/${fileName}.css`],
      acceptanceCriteria: [
        '页面布局与 UI Spec 对齐',
        '关键组件具备明确命名与语义结构',
        `包含 ${spec?.components.length || 0} 个主要组件映射`,
      ],
    };
  });

  const backendTasks = features.slice(0, Math.max(1, Math.min(2, features.length))).map((feature) => ({
    id: uuidv4(),
    title: `实现接口与服务：${feature.name}`,
    summary: `为 ${feature.name} 提供基础数据接口和服务层结构。`,
    owner: 'backend' as const,
    status: 'ready' as const,
    featureId: feature.id,
    relatedFilePaths: [`src/generated/server/${toKebabCase(feature.name)}.service.ts`, 'src/generated/server/routes.ts'],
    acceptanceCriteria: ['接口命名与功能语义一致', '返回结构能支撑页面展示', '可继续扩展真实数据源'],
  }));

  const qaTask: DevTask = {
    id: uuidv4(),
    title: '补齐测试用例与执行计划',
    summary: '围绕当前页面和核心功能生成单测、集成测试与 E2E 草案。',
    owner: 'qa',
    status: 'ready',
    relatedFilePaths: ['src/generated/tests/test-plan.md', 'src/generated/tests/app.spec.ts'],
    acceptanceCriteria: ['覆盖核心页面', '覆盖关键用户流程', '输出可执行测试建议'],
  };

  const devopsTask: DevTask = {
    id: uuidv4(),
    title: '准备部署方案',
    summary: '生成部署脚本、环境变量清单与交付流程说明。',
    owner: 'devops',
    status: 'ready',
    relatedFilePaths: ['src/generated/deploy/deploy-plan.md', 'src/generated/deploy/deploy.sh'],
    acceptanceCriteria: ['具备部署步骤', '具备环境变量说明', '具备构建与发布命令'],
  };

  return [...frontendTasks, ...backendTasks, qaTask, devopsTask];
};

const buildGeneratedFiles = (
  _project: ProjectConfig,
  designSystem: DesignSystemDoc,
  uiSpecs: UISpecDoc[],
  devTasks: DevTask[],
  testPlan: TestPlanDoc,
  deployPlan: DeployPlanDoc
): GeneratedFile[] => {
  const now = new Date().toISOString();
  const designSystemTaskIds = devTasks.filter((task) => task.owner === 'frontend').map((task) => task.id);

  const files: GeneratedFile[] = [
    {
      path: 'src/generated/design/design-system.json',
      content: JSON.stringify(designSystem, null, 2),
      language: 'json' as const,
      category: 'design' as const,
      summary: '设计系统草案',
      sourceTaskIds: designSystemTaskIds,
      updatedAt: now,
    },
    ...uiSpecs.flatMap((spec) => {
      const fileName = toKebabCase(spec.pageName) || 'page';
      const pageTask = devTasks.find((task) => task.pageId === spec.pageId);
      return [
        {
          path: `src/generated/pages/${fileName}.tsx`,
          content: `export const ${fileName.replace(/-([a-z])/g, (_, char) => char.toUpperCase()).replace(/^[a-z]/, (char) => char.toUpperCase())}Page = () => {\n  return (\n    <main>\n      <h1>${spec.pageName}</h1>\n      ${spec.components.map((component) => `<section data-component="${component.type}">${component.label}</section>`).join('\n      ')}\n    </main>\n  );\n};\n`,
          language: 'tsx' as const,
          category: 'frontend' as const,
          summary: `${spec.pageName} 页面骨架`,
          sourceTaskIds: pageTask ? [pageTask.id] : [],
          updatedAt: now,
        },
        {
          path: `src/generated/pages/${fileName}.css`,
          content: `.${fileName}-page {\n  display: grid;\n  gap: 16px;\n  padding: 24px;\n}\n`,
          language: 'css' as const,
          category: 'frontend' as const,
          summary: `${spec.pageName} 页面样式草案`,
          sourceTaskIds: pageTask ? [pageTask.id] : [],
          updatedAt: now,
        },
      ];
    }),
    {
      path: 'src/generated/server/routes.ts',
      content: `export const routes = ${JSON.stringify(uiSpecs.map((spec) => ({ route: spec.route, page: spec.pageName })), null, 2)};\n`,
      language: 'ts' as const,
      category: 'backend' as const,
      summary: '页面路由与服务映射草案',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'backend').map((task) => task.id),
      updatedAt: now,
    },
    {
      path: 'src/generated/tests/test-plan.md',
      content: `# Test Plan\n\n${testPlan.cases.map((item) => `- [${item.type}] ${item.title}: ${item.expected}`).join('\n')}\n`,
      language: 'md' as const,
      category: 'test' as const,
      summary: '测试计划文档',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'qa').map((task) => task.id),
      updatedAt: now,
    },
    {
      path: 'src/generated/deploy/deploy-plan.md',
      content: `# Deploy Plan\n\nTarget: ${deployPlan.target}\n\n${deployPlan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`,
      language: 'md' as const,
      category: 'deploy' as const,
      summary: '部署计划文档',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'devops').map((task) => task.id),
      updatedAt: now,
    },
    {
      path: 'src/generated/deploy/deploy.sh',
      content: `#!/usr/bin/env bash\nnpm run build\n# deploy to target after environment review\n`,
      language: 'sh' as const,
      category: 'deploy' as const,
      summary: '部署脚本草案',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'devops').map((task) => task.id),
      updatedAt: now,
    },
  ];

  return files;
};

const buildPlanningFiles = (
  project: ProjectConfig,
  rawRequirementInput: string,
  requirementDocs: RequirementDoc[],
  featureTree: FeatureTree | null,
  fallbackFeaturesMarkdown: string,
  prd: ProductPRD | null,
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>
): { featuresMarkdown: string; wireframesMarkdown: string; files: GeneratedFile[] } => {
  const now = new Date().toISOString();
  const effectiveTree =
    featureTree || (fallbackFeaturesMarkdown.trim()
      ? markdownToFeatureTree(fallbackFeaturesMarkdown, `${project.name} 产品规划`)
      : null);
  const featuresMarkdown = featureTree ? featureTreeToMarkdown(featureTree) : fallbackFeaturesMarkdown || '# 功能清单\n';
  const wireframesMarkdown = buildWireframesMarkdown(pageStructure, wireframes, effectiveTree, project.appType);
  const wireframeRegistry = collectDesignPages(pageStructure).map((page) => ({
    pageId: page.id,
    pageName: page.name,
    route: getPageMetadata(page).route,
    featureIds: page.featureIds,
    elements:
      wireframes[page.id]?.elements.map((element) => ({
        id: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        props: element.props,
      })) || [],
  }));

  const files: GeneratedFile[] = [
    {
      path: 'src/generated/planning/requirements.md',
      content: [
        `# ${project.name} 需求资料`,
        '',
        `> 项目：${project.name}`,
        '',
        '## 原始需求',
        '',
        rawRequirementInput || '暂无原始需求输入。',
        '',
        ...requirementDocs.flatMap((doc) => [
          `## ${doc.title}`,
          '',
          doc.content || doc.summary,
          '',
          `- summary: ${doc.summary}`,
          `- source: ${doc.sourceType || 'manual'}`,
          '',
        ]),
      ].join('\n'),
      language: 'md',
      category: 'design',
      summary: '需求资料入口',
      sourceTaskIds: [],
      updatedAt: now,
    },
    {
      path: 'src/generated/planning/features.md',
      content: featuresMarkdown,
      language: 'md',
      category: 'design',
      summary: '功能清单 Markdown',
      sourceTaskIds: [],
      updatedAt: now,
    },
    {
      path: 'src/generated/planning/prd.md',
      content: prd
        ? `# ${prd.title}\n\n${prd.summary}\n\n${prd.sections.map((section) => `## ${section.title}\n\n${section.content}`).join('\n\n')}\n`
        : '# PRD\n\n暂无内容。\n',
      language: 'md',
      category: 'design',
      summary: 'PRD 文档',
      sourceTaskIds: [],
      updatedAt: now,
    },
    {
      path: 'src/generated/planning/wireframes.md',
      content: wireframesMarkdown,
      language: 'md',
      category: 'design',
      summary: '线稿说明 Markdown',
      sourceTaskIds: [],
      updatedAt: now,
    },
    {
      path: 'src/generated/planning/wireframes.json',
      content: JSON.stringify(wireframeRegistry, null, 2),
      language: 'json',
      category: 'design',
      summary: '线稿结构化存储',
      sourceTaskIds: [],
      updatedAt: now,
    },
  ];

  return { featuresMarkdown, wireframesMarkdown, files };
};

const buildTestPlan = (features: FeatureNode[], pages: PageStructureNode[], uiSpecs: UISpecDoc[]): TestPlanDoc => {
  const now = new Date().toISOString();
  const cases = [
    ...pages.map((page) => ({
      id: uuidv4(),
      title: `${page.name} 页面渲染与交互`,
      type: 'e2e' as const,
      module: page.name,
      priority: 'high' as const,
      steps: ['打开页面', '检查主结构', '执行主要操作'],
      expected: '页面结构、主要组件和关键操作可正常工作',
      status: 'ready' as const,
    })),
    ...features.map((feature) => ({
      id: uuidv4(),
      title: `${feature.name} 功能逻辑`,
      type: 'integration' as const,
      module: feature.name,
      priority: 'medium' as const,
      steps: ['准备输入', '触发功能流程', '检查状态同步'],
      expected: '功能状态与页面/图谱数据保持一致',
      status: 'ready' as const,
    })),
  ];

  return {
    id: uuidv4(),
    summary: `覆盖 ${pages.length} 个页面、${features.length} 个功能节点和 ${uiSpecs.length} 份 UI Spec。`,
    coverage: {
      featureCount: features.length,
      pageCount: pages.length,
      caseCount: cases.length,
    },
    cases,
    updatedAt: now,
    status: cases.length > 0 ? 'ready' : 'draft',
  };
};

const buildDeployPlan = (
  _project: ProjectConfig,
  generatedFiles: Pick<GeneratedFile, 'path'>[]
): DeployPlanDoc => {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    target: '待定',
    summary: '围绕当前项目输出的基础交付计划。',
    environments: ['development', 'staging', 'production'],
    envVars: ['APP_ENV', 'API_BASE_URL', 'DATABASE_URL'],
    steps: [
      '校验项目配置与设计/开发产物一致',
      '执行 npm run build 构建前端产物',
      '按目标环境补齐部署配置',
      '发布后执行核心页面冒烟测试',
    ],
    artifacts: generatedFiles.map((file) => file.path),
    commands: ['npm install', 'npm run build', 'npm run preview'],
    updatedAt: now,
    status: 'ready',
  };
};

const buildDeliveryArtifacts = (
  project: ProjectConfig,
  featureTree: FeatureTree | null,
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>
) => {
  const features = featureTree?.children || [];
  const designPages = collectDesignPages(pageStructure);
  const designSystem = buildDesignSystemDoc(project, designPages, wireframes);
  const uiSpecs = buildUISpecDocs(designPages, wireframes);
  const testPlan = buildTestPlan(features, designPages, uiSpecs);
  const preliminaryDeployPlan = buildDeployPlan(project, []);
  const devTasks = buildDevTasks(features, designPages, uiSpecs, project);
  const generatedFiles = buildGeneratedFiles(project, designSystem, uiSpecs, devTasks, testPlan, preliminaryDeployPlan);
  const deployPlan = buildDeployPlan(project, generatedFiles);

  return {
    designSystem,
    uiSpecs,
    devTasks,
    generatedFiles,
    testPlan,
    deployPlan,
  };
};

const mergeGeneratedFiles = (planningFiles: GeneratedFile[], deliveryFiles: GeneratedFile[]) => {
  const merged = new Map<string, GeneratedFile>();
  [...planningFiles, ...deliveryFiles].forEach((file) => {
    merged.set(file.path, file);
  });
  return Array.from(merged.values());
};

const buildProjectGraph = (
  project: ProjectConfig,
  docs: RequirementDoc[],
  featureTree: FeatureTree | null,
  prd: ProductPRD | null,
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>,
  designSystem: DesignSystemDoc | null,
  uiSpecs: UISpecDoc[],
  devTasks: DevTask[],
  generatedFiles: GeneratedFile[],
  testPlan: TestPlanDoc | null,
  deployPlan: DeployPlanDoc | null
): ProjectGraph => {
  const features = featureTree?.children || [];
  const pageNodes = collectPageNodes(pageStructure);
  const designPages = collectDesignPages(pageStructure);
  const wireframeNodes = designPages
    .map((page) => wireframes[page.id])
    .filter((wireframe): wireframe is WireframeDocument => Boolean(wireframe));
  const requirementNodes: GraphNodeBase[] = docs.map((doc) => ({
    id: doc.id,
    type: 'requirement',
    name: doc.title,
    status: mapRequirementStatus(doc.status),
    metadata: {
      summary: doc.summary,
      authorRole: doc.authorRole,
      updatedAt: doc.updatedAt,
    },
  }));
  const prdNodes: GraphNodeBase[] = prd
    ? [
        {
          id: prd.id,
          type: 'prd',
          name: prd.title,
          status: mapPrdStatus(prd.status),
          metadata: {
            summary: prd.summary,
            updatedAt: prd.updatedAt,
            sectionCount: prd.sections.length,
          },
        },
      ]
    : [];
  const featureNodes: GraphNodeBase[] = features.map((feature) => ({
    id: feature.id,
    type: 'feature',
    name: feature.name,
    status: mapFeatureStatus(feature.status),
    metadata: {
      priority: feature.priority,
      progress: feature.progress,
      linkedPrototypePageIds: feature.linkedPrototypePageIds,
    },
  }));
  const structureNodes: GraphNodeBase[] = pageNodes.map((node) => ({
    id: node.id,
    type: 'page',
    name: node.name,
    status: 'ready',
    metadata: {
      kind: node.kind,
      description: node.description,
      featureIds: node.featureIds,
      route: getPageMetadata(node).route,
      template: getPageMetadata(node).template,
      ownerRole: getPageMetadata(node).ownerRole,
      pageStatus: getPageMetadata(node).status,
    },
  }));
  const wireframeGraphNodes: GraphNodeBase[] = wireframeNodes.map((wireframe) => ({
    id: wireframe.id,
    type: 'wireframe',
    name: `${wireframe.pageName} Wireframe`,
    status: wireframe.status === 'ready' ? 'ready' : 'draft',
    metadata: {
      pageId: wireframe.pageId,
      pageName: wireframe.pageName,
      elementCount: wireframe.elements.length,
      updatedAt: wireframe.updatedAt,
      storage: 'json',
    },
  }));
  const componentNodes: GraphNodeBase[] = uiSpecs.flatMap((spec) =>
    spec.components.map((component) => ({
      id: component.id,
      type: 'component' as const,
      name: `${spec.pageName}/${component.label}`,
      status: 'ready' as const,
      metadata: {
        pageId: spec.pageId,
        componentType: component.type,
        behavior: component.behavior,
      },
    }))
  );
  const apiNodes: GraphNodeBase[] = devTasks
    .filter((task) => task.owner === 'backend')
    .map((task) => ({
      id: task.id,
      type: 'api' as const,
      name: task.title,
      status: 'ready' as const,
      metadata: {
        files: task.relatedFilePaths,
        summary: task.summary,
      },
    }));
  const testNodes: GraphNodeBase[] = (testPlan?.cases || []).map((item) => ({
    id: item.id,
    type: 'test',
    name: item.title,
    status: item.status === 'ready' ? 'ready' : 'draft',
    metadata: {
      module: item.module,
      testType: item.type,
      priority: item.priority,
    },
  }));
  const deployNodes: GraphNodeBase[] = deployPlan
    ? [
        {
          id: deployPlan.id,
          type: 'deploy',
          name: `${deployPlan.target} Deploy Plan`,
          status: deployPlan.status === 'ready' ? 'ready' : 'draft',
          metadata: {
            target: deployPlan.target,
            commandCount: deployPlan.commands.length,
            artifactCount: deployPlan.artifacts.length,
          },
        },
      ]
    : [];

  const nodes: GraphNodeBase[] = [
    {
      id: project.id,
      type: 'feature',
      name: `${project.name} 项目根节点`,
      status: 'ready',
      metadata: {
        appType: project.appType,
      },
    },
    ...requirementNodes,
    ...prdNodes,
    ...featureNodes,
    ...structureNodes,
    ...wireframeGraphNodes,
    ...(designSystem
      ? [
          {
            id: designSystem.id,
            type: 'component' as const,
            name: designSystem.name,
            status: designSystem.status === 'ready' ? ('ready' as const) : ('draft' as const),
            metadata: {
              patternCount: designSystem.componentPatterns.length,
              principles: designSystem.principles,
            },
          },
        ]
      : []),
    ...componentNodes,
    ...apiNodes,
    ...testNodes,
    ...deployNodes,
  ];

  const edges: GraphEdge[] = [
    ...docs.map((doc) => ({
      id: uuidv4(),
      from: doc.id,
      to: project.id,
      relation: 'derived_from' as const,
    })),
    ...(prd
      ? docs.map((doc) => ({
          id: uuidv4(),
          from: doc.id,
          to: prd.id,
          relation: 'derived_from' as const,
        }))
      : []),
    ...features.map((feature, index) => ({
      id: uuidv4(),
      from: prd?.id || docs[index % docs.length]?.id || project.id,
      to: feature.id,
      relation: 'contains' as const,
    })),
    ...pageNodes.flatMap((node) =>
      node.featureIds.map((featureId) => ({
        id: uuidv4(),
        from: featureId,
        to: node.id,
        relation: 'implements' as const,
      }))
    ),
    ...designPages.flatMap((page) => {
      const wireframe = wireframes[page.id];
      if (!wireframe) {
        return [];
      }

      return [
        {
          id: uuidv4(),
          from: page.id,
          to: wireframe.id,
          relation: 'contains' as const,
        },
        ...page.featureIds.map((featureId) => ({
          id: uuidv4(),
          from: featureId,
          to: wireframe.id,
          relation: 'implements' as const,
        })),
      ];
    }),
    ...uiSpecs.flatMap((spec) =>
      spec.components.map((component) => ({
        id: uuidv4(),
        from: spec.pageId,
        to: component.id,
        relation: 'contains' as const,
      }))
    ),
    ...apiNodes.map((node) => ({
      id: uuidv4(),
      from: project.id,
      to: node.id,
      relation: 'implements' as const,
    })),
    ...(testPlan?.cases || []).map((item) => ({
      id: uuidv4(),
      from: project.id,
      to: item.id,
      relation: 'tests' as const,
    })),
    ...(deployPlan
      ? generatedFiles.map((file) => ({
          id: uuidv4(),
          from: deployPlan.id,
          to: file.path,
          relation: 'deploys' as const,
        }))
      : []),
  ];

  return { nodes, edges };
};

const syncFeatureTreeWithPageStructure = (featureTree: FeatureTree | null, pageStructure: PageStructureNode[]): FeatureTree | null => {
  if (!featureTree) {
    return null;
  }

  const pageNodes = collectPageNodes(pageStructure);

  const attachPages = (nodes: FeatureNode[]): FeatureNode[] =>
    nodes.map((node) => ({
      ...node,
      linkedPrototypePageIds: pageNodes.filter((page) => page.featureIds.includes(node.id)).map((page) => page.id),
      children: attachPages(node.children),
    }));

  return {
    ...featureTree,
    children: attachPages(featureTree.children),
  };
};

const buildReconciledArtifacts = (
  project: ProjectConfig,
  rawRequirementInput: string,
  requirementDocs: RequirementDoc[],
  featureTree: FeatureTree | null,
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>,
  existingGeneratedFiles: GeneratedFile[]
) => {
  const syncedFeatureTree = syncFeatureTreeWithPageStructure(featureTree, pageStructure) || featureTree;
  const prd = buildPRDFromProject(project, requirementDocs, rawRequirementInput, syncedFeatureTree);
  const planningArtifacts = buildPlanningFiles(
    project,
    rawRequirementInput,
    requirementDocs,
    syncedFeatureTree,
    syncedFeatureTree ? featureTreeToMarkdown(syncedFeatureTree) : '',
    prd,
    pageStructure,
    wireframes
  );
  const deliveryArtifacts = buildDeliveryArtifacts(project, syncedFeatureTree, pageStructure, wireframes);
  const preservedFiles = existingGeneratedFiles.filter(
    (file) => !file.path.startsWith('src/generated/planning/') && !file.path.startsWith('src/generated/pages/') && !file.path.startsWith('src/generated/design/')
  );
  const generatedFiles = mergeGeneratedFiles(
    mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles),
    preservedFiles
  );

  return {
    syncedFeatureTree,
    prd,
    planningArtifacts,
    deliveryArtifacts,
    generatedFiles,
    graph: buildProjectGraph(
      project,
      requirementDocs,
      syncedFeatureTree,
      prd,
      pageStructure,
      wireframes,
      deliveryArtifacts.designSystem,
      deliveryArtifacts.uiSpecs,
      deliveryArtifacts.devTasks,
      generatedFiles,
      deliveryArtifacts.testPlan,
      deliveryArtifacts.deployPlan
    ),
  };
};

const emptyGraph: ProjectGraph = { nodes: [], edges: [] };

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeRequirementKind = (value: unknown): RequirementDoc['kind'] =>
  value === 'sketch' || value === 'spec' ? value : 'note';

const normalizeRequirementDocType = (value: unknown): RequirementDoc['docType'] =>
  value === 'wiki-index' || value === 'ai-summary' ? value : undefined;

const normalizeGraph = (value: unknown): ProjectGraph => {
  if (!value || typeof value !== 'object') {
    return emptyGraph;
  }

  const graph = value as Partial<ProjectGraph>;

  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.filter(Boolean) as GraphNodeBase[] : [],
    edges: Array.isArray(graph.edges) ? graph.edges.filter(Boolean) as GraphEdge[] : [],
  };
};

const normalizeProjectConfig = (value: unknown): ProjectConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const project = value as Partial<ProjectConfig>;
  const now = new Date().toISOString();

  return {
    id: typeof project.id === 'string' ? project.id : uuidv4(),
    name: typeof project.name === 'string' && project.name.trim().length > 0 ? project.name : '未命名项目',
    description: typeof project.description === 'string' ? project.description : '',
    vaultPath: typeof project.vaultPath === 'string' ? project.vaultPath.trim() : '',
    knowledgeRetrievalMethod:
      project.knowledgeRetrievalMethod === 'llmwiki' || project.knowledgeRetrievalMethod === 'rag'
        ? project.knowledgeRetrievalMethod
        : 'm-flow',
    appType: project.appType === 'mobile' || project.appType === 'mini_program' || project.appType === 'desktop' || project.appType === 'backend' || project.appType === 'api'
      ? project.appType
      : 'web',
    createdAt: typeof project.createdAt === 'string' ? project.createdAt : now,
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : typeof project.createdAt === 'string' ? project.createdAt : now,
  };
};

const normalizeRequirementDocs = (value: unknown): RequirementDoc[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Partial<RequirementDoc> => Boolean(item) && typeof item === 'object')
        .map((doc) => {
          const authorRole = typeof doc.authorRole === 'string' ? String(doc.authorRole) : '';

          return {
            id: typeof doc.id === 'string' ? doc.id : uuidv4(),
            title: normalizeRequirementTitle(typeof doc.title === 'string' ? doc.title : '未命名需求'),
            content: typeof doc.content === 'string' ? doc.content : '',
            summary:
              typeof doc.summary === 'string' && doc.summary.trim().length > 0
                ? doc.summary
                : summarizeRequirement(typeof doc.content === 'string' ? doc.content : ''),
            filePath: typeof doc.filePath === 'string' && doc.filePath.trim().length > 0 ? doc.filePath : undefined,
            kind: normalizeRequirementKind(doc.kind),
            docType: normalizeRequirementDocType(doc.docType),
            tags: normalizeStringArray(doc.tags),
            relatedIds: normalizeStringArray(doc.relatedIds),
            authorRole:
              authorRole === '产品经理'
                ? '产品'
                : authorRole === '产品' || authorRole === 'UI设计' || authorRole === '开发' || authorRole === '测试' || authorRole === '运维'
                  ? authorRole
                  : '产品',
            sourceType: doc.sourceType === 'upload' || doc.sourceType === 'ai' ? doc.sourceType : 'manual',
            updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date().toISOString(),
            status: doc.status === 'ready' ? 'ready' : 'draft',
          };
        })
    : [];

const normalizeDocumentChangeEvents = (value: unknown): DocumentChangeEvent[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Partial<DocumentChangeEvent> => Boolean(item) && typeof item === 'object')
        .map((event) => {
          const action: DocumentChangeAction =
            event.action === 'created' || event.action === 'updated' || event.action === 'deleted'
              ? event.action
              : 'updated';
          const trigger: DocumentChangeTrigger =
            event.trigger === 'editor' || event.trigger === 'import' || event.trigger === 'sync'
              ? event.trigger
              : 'sync';

          return {
            id: typeof event.id === 'string' ? event.id : uuidv4(),
            projectId: typeof event.projectId === 'string' ? event.projectId : '',
            documentId: typeof event.documentId === 'string' ? event.documentId : '',
            documentTitle:
              typeof event.documentTitle === 'string' && event.documentTitle.trim().length > 0
                ? event.documentTitle
                : '未命名需求.md',
            action,
            trigger,
            sourceType: event.sourceType === 'upload' || event.sourceType === 'ai' ? event.sourceType : 'manual',
            filePath:
              typeof event.filePath === 'string' && event.filePath.trim().length > 0
                ? event.filePath
                : undefined,
            summary:
              typeof event.summary === 'string' && event.summary.trim().length > 0
                ? event.summary
                : buildDocumentChangeSummary('未命名需求.md', action, trigger),
            timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
          } satisfies DocumentChangeEvent;
        })
        .filter((event) => event.projectId.length > 0 && event.documentId.length > 0)
        .slice(0, MAX_DOCUMENT_CHANGE_EVENTS)
    : [];

const normalizePrd = (value: unknown): ProductPRD | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const prd = value as Partial<ProductPRD>;

  return {
    id: typeof prd.id === 'string' ? prd.id : uuidv4(),
    title: typeof prd.title === 'string' ? prd.title : 'PRD',
    summary: typeof prd.summary === 'string' ? prd.summary : '',
    sections: Array.isArray(prd.sections)
      ? prd.sections
          .filter((section) => Boolean(section) && typeof section === 'object')
          .map((section) => ({
            id: typeof section.id === 'string' ? section.id : uuidv4(),
            title: typeof section.title === 'string' ? section.title : '未命名章节',
            content: typeof section.content === 'string' ? section.content : '',
          }))
      : [],
    updatedAt: typeof prd.updatedAt === 'string' ? prd.updatedAt : new Date().toISOString(),
    status: prd.status === 'ready' ? 'ready' : 'draft',
  };
};

const normalizePageStructureNode = (value: unknown): PageStructureNode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const node = value as Partial<PageStructureNode>;
  const name = typeof node.name === 'string' ? node.name : '未命名页面';
  const kind = node.kind === 'flow' || node.kind === 'module' ? node.kind : 'page';
  const description = typeof node.description === 'string' ? node.description : '';
  const metadata = getPageMetadata({
    name,
    kind,
    description,
    metadata: node.metadata,
  });

  return {
    id: typeof node.id === 'string' ? node.id : uuidv4(),
    name,
    kind,
    description,
    featureIds: normalizeStringArray(node.featureIds),
    metadata,
    children: Array.isArray(node.children)
      ? node.children
          .map((child) => normalizePageStructureNode(child))
          .filter((child): child is PageStructureNode => Boolean(child))
      : [],
  };
};

const normalizePageStructure = (value: unknown): PageStructureNode[] =>
  Array.isArray(value)
    ? value.map((node) => normalizePageStructureNode(node)).filter((node): node is PageStructureNode => Boolean(node))
    : [];

const normalizeCanvasElements = (value: unknown): CanvasElement[] =>
  Array.isArray(value) ? value.filter(Boolean) as CanvasElement[] : [];

const normalizeWireframes = (value: unknown): Record<string, WireframeDocument> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const wireframe = item as Partial<WireframeDocument> | undefined;
      return [
        key,
        {
          id: typeof wireframe?.id === 'string' ? wireframe.id : uuidv4(),
          pageId: typeof wireframe?.pageId === 'string' ? wireframe.pageId : key,
          pageName: typeof wireframe?.pageName === 'string' ? wireframe.pageName : '未命名页面',
          frame: typeof wireframe?.frame === 'string' ? wireframe.frame : undefined,
          elements: normalizeCanvasElements(wireframe?.elements),
          updatedAt: typeof wireframe?.updatedAt === 'string' ? wireframe.updatedAt : new Date().toISOString(),
          status: wireframe?.status === 'ready' ? 'ready' : 'draft',
        } satisfies WireframeDocument,
      ];
    })
  );
};

const normalizeDesignTokenGroup = (value: unknown, label: string) => {
  const group = value as Partial<DesignTokenGroup> | undefined;

  return {
    label: typeof group?.label === 'string' ? group.label : label,
    values: normalizeStringArray(group?.values),
  };
};

const normalizeDesignSystem = (value: unknown): DesignSystemDoc | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const designSystem = value as Partial<DesignSystemDoc>;

  return {
    id: typeof designSystem.id === 'string' ? designSystem.id : uuidv4(),
    name: typeof designSystem.name === 'string' ? designSystem.name : '设计系统',
    summary: typeof designSystem.summary === 'string' ? designSystem.summary : '',
    principles: normalizeStringArray(designSystem.principles),
    tokens: {
      color: normalizeDesignTokenGroup(designSystem.tokens?.color, 'Color'),
      typography: normalizeDesignTokenGroup(designSystem.tokens?.typography, 'Typography'),
      spacing: normalizeDesignTokenGroup(designSystem.tokens?.spacing, 'Spacing'),
      radius: normalizeDesignTokenGroup(designSystem.tokens?.radius, 'Radius'),
    },
    componentPatterns: Array.isArray(designSystem.componentPatterns)
      ? designSystem.componentPatterns
          .filter((item) => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : uuidv4(),
            name: typeof item.name === 'string' ? item.name : '未命名模式',
            description: typeof item.description === 'string' ? item.description : '',
            sourcePageIds: normalizeStringArray(item.sourcePageIds),
          }))
      : [],
    updatedAt: typeof designSystem.updatedAt === 'string' ? designSystem.updatedAt : new Date().toISOString(),
    status: designSystem.status === 'ready' ? 'ready' : 'draft',
  };
};

const normalizeUISpecs = (value: unknown): UISpecDoc[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Partial<UISpecDoc> => Boolean(item) && typeof item === 'object')
        .map((spec) => ({
          id: typeof spec.id === 'string' ? spec.id : uuidv4(),
          pageId: typeof spec.pageId === 'string' ? spec.pageId : '',
          pageName: typeof spec.pageName === 'string' ? spec.pageName : '未命名页面',
          route: typeof spec.route === 'string' ? spec.route : '',
          template:
            spec.template === 'dashboard' || spec.template === 'form' || spec.template === 'list' || spec.template === 'detail' || spec.template === 'workspace'
              ? spec.template
              : 'custom',
          sections: normalizeStringArray(spec.sections),
          interactionNotes: normalizeStringArray(spec.interactionNotes),
          components: Array.isArray(spec.components)
            ? spec.components
                .filter((item) => Boolean(item) && typeof item === 'object')
                .map((component) => ({
                  id: typeof component.id === 'string' ? component.id : uuidv4(),
                  type: typeof component.type === 'string' ? component.type : 'section',
                  label: typeof component.label === 'string' ? component.label : '未命名组件',
                  behavior: typeof component.behavior === 'string' ? component.behavior : '',
                }))
            : [],
          status: spec.status === 'ready' ? 'ready' : 'draft',
          updatedAt: typeof spec.updatedAt === 'string' ? spec.updatedAt : new Date().toISOString(),
        }))
    : [];

const normalizeDevTasks = (value: unknown): DevTask[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Partial<DevTask> => Boolean(item) && typeof item === 'object')
        .map((task) => ({
          id: typeof task.id === 'string' ? task.id : uuidv4(),
          title: typeof task.title === 'string' ? task.title : '未命名任务',
          summary: typeof task.summary === 'string' ? task.summary : '',
          owner: task.owner === 'backend' || task.owner === 'qa' || task.owner === 'devops' ? task.owner : 'frontend',
          status: task.status === 'ready' ? 'ready' : 'draft',
          pageId: typeof task.pageId === 'string' ? task.pageId : undefined,
          featureId: typeof task.featureId === 'string' ? task.featureId : undefined,
          relatedFilePaths: normalizeStringArray(task.relatedFilePaths),
          acceptanceCriteria: normalizeStringArray(task.acceptanceCriteria),
        }))
    : [];

const normalizeGeneratedFiles = (value: unknown): GeneratedFile[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Partial<GeneratedFile> => Boolean(item) && typeof item === 'object')
        .map((file) => {
          const language: GeneratedFile['language'] =
            file.language === 'tsx' || file.language === 'ts' || file.language === 'css' || file.language === 'json' || file.language === 'md' || file.language === 'sh' || file.language === 'html'
              ? file.language
              : 'yml';
          const category: GeneratedFile['category'] =
            file.category === 'frontend' || file.category === 'backend' || file.category === 'test' || file.category === 'deploy'
              ? file.category
              : 'design';

          return {
            path: typeof file.path === 'string' ? file.path : '',
            content: typeof file.content === 'string' ? file.content : '',
            language,
            category,
            summary: typeof file.summary === 'string' ? file.summary : '',
            sourceTaskIds: normalizeStringArray(file.sourceTaskIds),
            sourceRequirementId:
              typeof file.sourceRequirementId === 'string' && file.sourceRequirementId.trim().length > 0
                ? file.sourceRequirementId
                : undefined,
            relatedRequirementIds: normalizeStringArray(file.relatedRequirementIds),
            tags: normalizeStringArray(file.tags),
            updatedAt: typeof file.updatedAt === 'string' ? file.updatedAt : new Date().toISOString(),
          };
        })
        .filter((file) => file.path.length > 0)
    : [];

const normalizeTestPlan = (value: unknown): TestPlanDoc | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const testPlan = value as Partial<TestPlanDoc>;

  return {
    id: typeof testPlan.id === 'string' ? testPlan.id : uuidv4(),
    summary: typeof testPlan.summary === 'string' ? testPlan.summary : '',
    coverage: {
      featureCount: typeof testPlan.coverage?.featureCount === 'number' ? testPlan.coverage.featureCount : 0,
      pageCount: typeof testPlan.coverage?.pageCount === 'number' ? testPlan.coverage.pageCount : 0,
      caseCount: typeof testPlan.coverage?.caseCount === 'number' ? testPlan.coverage.caseCount : 0,
    },
    cases: Array.isArray(testPlan.cases)
      ? testPlan.cases
          .filter((item) => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : uuidv4(),
            title: typeof item.title === 'string' ? item.title : '未命名用例',
            type: item.type === 'integration' || item.type === 'e2e' ? item.type : 'unit',
            module: typeof item.module === 'string' ? item.module : '',
            priority: item.priority === 'medium' || item.priority === 'low' ? item.priority : 'high',
            steps: normalizeStringArray(item.steps),
            expected: typeof item.expected === 'string' ? item.expected : '',
            status: item.status === 'ready' ? 'ready' : 'draft',
          }))
      : [],
    updatedAt: typeof testPlan.updatedAt === 'string' ? testPlan.updatedAt : new Date().toISOString(),
    status: testPlan.status === 'ready' ? 'ready' : 'draft',
  };
};

const normalizeDeployPlan = (value: unknown): DeployPlanDoc | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const deployPlan = value as Partial<DeployPlanDoc>;

  return {
    id: typeof deployPlan.id === 'string' ? deployPlan.id : uuidv4(),
    target: typeof deployPlan.target === 'string' ? deployPlan.target : 'Workspace',
    summary: typeof deployPlan.summary === 'string' ? deployPlan.summary : '',
    environments: normalizeStringArray(deployPlan.environments),
    envVars: normalizeStringArray(deployPlan.envVars),
    steps: normalizeStringArray(deployPlan.steps),
    artifacts: normalizeStringArray(deployPlan.artifacts),
    commands: normalizeStringArray(deployPlan.commands),
    updatedAt: typeof deployPlan.updatedAt === 'string' ? deployPlan.updatedAt : new Date().toISOString(),
    status: deployPlan.status === 'ready' ? 'ready' : 'draft',
  };
};

const normalizeProjectMemory = (value: unknown): ProjectMemory | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const memory = value as Partial<ProjectMemory>;

  return {
    designSystem: memory.designSystem && typeof memory.designSystem === 'object' ? memory.designSystem as Record<string, unknown> : {},
    codeStructure: memory.codeStructure && typeof memory.codeStructure === 'object' ? memory.codeStructure as Record<string, unknown> : {},
  };
};

const updatePageNodeById = (
  nodes: PageStructureNode[],
  pageId: string,
  updates: Partial<Pick<PageStructureNode, 'name' | 'description'>> & {
    metadata?: Partial<PageStructureNode['metadata']>;
  }
): PageStructureNode[] =>
  nodes.map((node) => {
    if (node.id === pageId) {
      return {
        ...node,
        ...updates,
        metadata: {
          ...getPageMetadata(node),
          ...updates.metadata,
        },
      };
    }

    return {
      ...node,
      children: updatePageNodeById(node.children, pageId, updates),
    };
  });

const insertChildPageNodeById = (
  nodes: PageStructureNode[],
  parentPageId: string,
  onCreate: (parent: PageStructureNode) => PageStructureNode
): PageStructureNode[] =>
  nodes.map((node) => {
    if (node.id === parentPageId) {
      return {
        ...node,
        children: [...node.children, onCreate(node)],
      };
    }

    return {
      ...node,
      children: insertChildPageNodeById(node.children, parentPageId, onCreate),
    };
  });

const insertPageNodeAfterId = (
  nodes: PageStructureNode[],
  referencePageId: string,
  onCreate: (reference: PageStructureNode) => PageStructureNode
): PageStructureNode[] => {
  const targetIndex = nodes.findIndex((node) => node.id === referencePageId);

  if (targetIndex >= 0) {
    const nextNodes = [...nodes];
    nextNodes.splice(targetIndex + 1, 0, onCreate(nodes[targetIndex]));
    return nextNodes;
  }

  return nodes.map((node) => ({
    ...node,
    children: insertPageNodeAfterId(node.children, referencePageId, onCreate),
  }));
};

const findPageContextById = (
  nodes: PageStructureNode[],
  pageId: string,
  parent: PageStructureNode | null = null
): {
  page: PageStructureNode;
  parent: PageStructureNode | null;
  siblings: PageStructureNode[];
} | null => {
  for (const node of nodes) {
    if (node.id === pageId) {
      return {
        page: node,
        parent,
        siblings: nodes,
      };
    }

    const nested = findPageContextById(node.children, pageId, node);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const createPageNodeDraft = ({
  name,
  description,
  featureIds,
  routeBase,
  template,
  ownerRole,
  goal,
  notes,
}: {
  name: string;
  description: string;
  featureIds: string[];
  routeBase: string;
  template: PageStructureNode['metadata']['template'];
  ownerRole: PageStructureNode['metadata']['ownerRole'];
  goal: string;
  notes: string;
}): PageStructureNode => {
  const cleanRouteBase = routeBase.replace(/\/+$/, '') || '/pages';
  const routeSuffix = toKebabCase(name) || `page-${Date.now()}`;

  return {
    id: uuidv4(),
    name,
    kind: 'page',
    description,
    featureIds,
    metadata: {
      route: `${cleanRouteBase}/${routeSuffix}`.replace(/\/{2,}/g, '/'),
      title: name,
      goal,
      template,
      ownerRole,
      notes,
      status: 'draft',
    },
    children: [],
  };
};

const deletePageNodeById = (
  nodes: PageStructureNode[],
  pageId: string
): PageStructureNode[] =>
  nodes
    .filter((node) => node.id !== pageId)
    .map((node) => ({
      ...node,
      children: deletePageNodeById(node.children, pageId),
    }));

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      currentProject: null,
      graph: emptyGraph,
      memory: null,
      rawRequirementInput: '',
      featuresMarkdown: '',
      wireframesMarkdown: '',
      requirementDocs: [],
      documentEvents: [],
      activeKnowledgeFileId: null,
      selectedKnowledgeContextIds: [],
      prd: null,
      pageStructure: [],
      wireframes: {},
      designSystem: null,
      uiSpecs: [],
      devTasks: [],
      generatedFiles: [],
      testPlan: null,
      deployPlan: null,

      createProject: (input) => {
        const now = new Date().toISOString();
        const project: ProjectConfig = {
          id: uuidv4(),
          name: input.name.trim(),
          description: input.description.trim(),
          vaultPath: input.vaultPath.trim(),
          knowledgeRetrievalMethod: normalizeKnowledgeRetrievalMethod(input.knowledgeRetrievalMethod),
          appType: 'desktop',
          createdAt: now,
          updatedAt: now,
        };

        const requirementDocs: RequirementDoc[] = [];
        const activeKnowledgeFileId = null;
        const featureTree = buildStarterFeatureTree(project.name);
        const rawRequirementInput = buildStarterRawRequirementInput(project.name, project.description);
        const prd = buildPRDFromProject(project, requirementDocs, rawRequirementInput, featureTree);
        const pageStructure: PageStructureNode[] = [];
        const wireframes: Record<string, WireframeDocument> = {};
        const memory = buildProjectMemory(project);
        const planningArtifacts = buildPlanningFiles(
          project,
          rawRequirementInput,
          requirementDocs,
          featureTree,
          '',
          prd,
          pageStructure,
          wireframes
        );
        const deliveryArtifacts = buildDeliveryArtifacts(project, featureTree, pageStructure, wireframes);
        const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);
        const graph = buildProjectGraph(
          project,
          requirementDocs,
          featureTree,
          prd,
          pageStructure,
          wireframes,
          deliveryArtifacts.designSystem,
          deliveryArtifacts.uiSpecs,
          deliveryArtifacts.devTasks,
          generatedFiles,
          deliveryArtifacts.testPlan,
          deliveryArtifacts.deployPlan
        );

        set({
          projects: [...get().projects.filter((item) => item.id !== project.id), project],
          currentProjectId: project.id,
          currentProject: project,
          graph,
          memory,
          rawRequirementInput,
          featuresMarkdown: planningArtifacts.featuresMarkdown,
          wireframesMarkdown: planningArtifacts.wireframesMarkdown,
          requirementDocs,
          activeKnowledgeFileId,
          selectedKnowledgeContextIds: activeKnowledgeFileId ? [activeKnowledgeFileId] : [],
          prd,
          pageStructure,
          wireframes,
          designSystem: deliveryArtifacts.designSystem,
          uiSpecs: deliveryArtifacts.uiSpecs,
          devTasks: deliveryArtifacts.devTasks,
          generatedFiles,
          testPlan: deliveryArtifacts.testPlan,
          deployPlan: deliveryArtifacts.deployPlan,
        });

        return {
          project,
          featureTree: syncFeatureTreeWithPageStructure(featureTree, pageStructure) || featureTree,
        };
      },

      loadProjectWorkspace: (snapshot) =>
        set(() => ({
          currentProjectId: snapshot.currentProject?.id || null,
          currentProject: snapshot.currentProject,
          graph: snapshot.graph,
          memory: snapshot.memory,
          rawRequirementInput: snapshot.rawRequirementInput,
          featuresMarkdown: snapshot.featuresMarkdown,
          wireframesMarkdown: snapshot.wireframesMarkdown,
          requirementDocs: snapshot.requirementDocs,
          documentEvents: snapshot.documentEvents,
          activeKnowledgeFileId: snapshot.activeKnowledgeFileId,
          selectedKnowledgeContextIds:
            snapshot.selectedKnowledgeContextIds.length > 0
              ? snapshot.selectedKnowledgeContextIds
              : snapshot.activeKnowledgeFileId
                ? [snapshot.activeKnowledgeFileId]
                : [],
          prd: snapshot.prd,
          pageStructure: snapshot.pageStructure,
          wireframes: snapshot.wireframes,
          designSystem: snapshot.designSystem,
          uiSpecs: snapshot.uiSpecs,
          devTasks: snapshot.devTasks,
          generatedFiles: snapshot.generatedFiles,
          testPlan: snapshot.testPlan,
          deployPlan: snapshot.deployPlan,
        })),

      switchProject: (project) =>
        set((state) => ({
          currentProjectId: project.id,
          currentProject: project,
          projects: state.projects.map((item) => (item.id === project.id ? project : item)),
        })),

      deleteProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((item) => item.id !== projectId),
          currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
        })),

      updateProject: (updates) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const nextProject = {
            ...state.currentProject,
            ...updates,
            updatedAt: new Date().toISOString(),
          };

          return {
            projects: state.projects.map((item) => (item.id === nextProject.id ? nextProject : item)),
            currentProjectId: nextProject.id,
            currentProject: nextProject,
            graph: buildProjectGraph(
              nextProject,
              state.requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              state.generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      setRawRequirementInput: (value) =>
        set((state) => {
          if (!state.currentProject) {
            return { rawRequirementInput: value };
          }

          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            value,
            state.requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );

          return {
            rawRequirementInput: value,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            generatedFiles: mergeGeneratedFiles(
              planningArtifacts.files,
              state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
            ),
          };
        }),

      setFeaturesMarkdown: (value) => set({ featuresMarkdown: value }),

      setActiveKnowledgeFileId: (id) =>
        set((state) => ({
          activeKnowledgeFileId: id,
          selectedKnowledgeContextIds:
            id && !state.selectedKnowledgeContextIds.includes(id)
              ? [id, ...state.selectedKnowledgeContextIds]
              : state.selectedKnowledgeContextIds,
        })),

      setSelectedKnowledgeContextIds: (ids) =>
        set({
          selectedKnowledgeContextIds: Array.from(new Set(ids.filter(Boolean))),
        }),

      toggleKnowledgeContextId: (id) =>
        set((state) => ({
          selectedKnowledgeContextIds: state.selectedKnowledgeContextIds.includes(id)
            ? state.selectedKnowledgeContextIds.filter((item) => item !== id)
            : [...state.selectedKnowledgeContextIds, id],
        })),

      updateRequirementDoc: (id, updates) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const updatedDocument = state.requirementDocs.find((doc) => doc.id === id);
          if (!updatedDocument) {
            return state;
          }

          const nextDocument: RequirementDoc = {
            ...updatedDocument,
            ...updates,
            title: typeof updates.title === 'string' ? normalizeRequirementTitle(updates.title) : updatedDocument.title,
            summary:
              typeof updates.summary === 'string'
                ? updates.summary
                : typeof updates.content === 'string'
                  ? summarizeRequirement(updates.content)
                  : updatedDocument.summary,
            kind: updates.kind ?? updatedDocument.kind ?? 'note',
            docType: updates.docType ?? updatedDocument.docType,
            tags: updates.tags ?? updatedDocument.tags ?? [],
            relatedIds: updates.relatedIds ?? updatedDocument.relatedIds ?? [],
            updatedAt: new Date().toISOString(),
          };

          const requirementDocs = state.requirementDocs.map((doc) => (doc.id === id ? nextDocument : doc));
          const documentEvents = hasRequirementDocChanged(updatedDocument, nextDocument)
            ? appendDocumentEvents(state.documentEvents, [
                buildDocumentChangeEvent(state.currentProject.id, nextDocument, 'updated', 'editor'),
              ])
            : state.documentEvents;

          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(
            planningArtifacts.files,
            state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
          );

          return {
            requirementDocs,
            documentEvents,
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      addRequirementDoc: () => {
        let createdDoc: RequirementDoc | null = null;

        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const nextDoc: RequirementDoc = {
            id: uuidv4(),
            title: '新增需求条目.md',
            content: '# 新增需求条目\n\n补充新的用户故事、约束条件或业务规则。',
            summary: '补充新的用户故事、约束条件或业务规则。',
            filePath: undefined,
            kind: 'note',
            tags: [],
            relatedIds: [],
            authorRole: '产品',
            sourceType: 'manual',
            updatedAt: new Date().toISOString(),
            status: 'draft',
          };

          const requirementDocs: RequirementDoc[] = [...state.requirementDocs, nextDoc];
          createdDoc = nextDoc;
          const documentEvents = appendDocumentEvents(state.documentEvents, [
            buildDocumentChangeEvent(state.currentProject.id, nextDoc, 'created', 'editor'),
          ]);

          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(
            planningArtifacts.files,
            state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
          );

          return {
            requirementDocs,
            documentEvents,
            activeKnowledgeFileId:
              state.activeKnowledgeFileId || state.selectedKnowledgeContextIds[0] || nextDoc.id,
            selectedKnowledgeContextIds: state.selectedKnowledgeContextIds.includes(nextDoc.id)
              ? state.selectedKnowledgeContextIds
              : [...state.selectedKnowledgeContextIds, nextDoc.id],
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        });

        return createdDoc;
      },

      deleteRequirementDoc: (id) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const deletedDocument = state.requirementDocs.find((doc) => doc.id === id);
          if (!deletedDocument) {
            return state;
          }

          const requirementDocs = state.requirementDocs.filter((doc) => doc.id !== id);
          const documentEvents = appendDocumentEvents(state.documentEvents, [
            buildDocumentChangeEvent(state.currentProject.id, deletedDocument, 'deleted', 'editor'),
          ]);
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(
            planningArtifacts.files,
            state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
          );

          return {
            requirementDocs,
            documentEvents,
            activeKnowledgeFileId:
              state.activeKnowledgeFileId === id ? null : state.activeKnowledgeFileId,
            selectedKnowledgeContextIds: state.selectedKnowledgeContextIds.filter((item) => item !== id),
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      ingestRequirementDoc: (input) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const content = input.content.trim();
          const nextDocument: RequirementDoc = {
            id: uuidv4(),
            title: normalizeRequirementTitle(input.title),
            content,
            summary: summarizeRequirement(content),
            filePath: input.filePath,
            kind: 'note' as const,
            tags: [],
            relatedIds: [],
            authorRole: '产品' as const,
            sourceType: input.sourceType || 'upload',
            updatedAt: new Date().toISOString(),
            status: 'ready' as const,
          };
          const requirementDocs = [...state.requirementDocs, nextDocument];
          const documentEvents = appendDocumentEvents(state.documentEvents, [
            buildDocumentChangeEvent(state.currentProject.id, nextDocument, 'created', 'import'),
          ]);

          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(
            planningArtifacts.files,
            state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
          );

          return {
            requirementDocs,
            documentEvents,
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      replaceRequirementDocs: (docs) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const requirementDocs = docs.map((doc) => ({
            ...doc,
            title: normalizeRequirementTitle(doc.title),
            summary: doc.summary?.trim() ? doc.summary : summarizeRequirement(doc.content),
            kind: doc.kind || 'note',
            tags: doc.tags || [],
            relatedIds: doc.relatedIds || [],
            updatedAt: doc.updatedAt || new Date().toISOString(),
          }));
          const documentEvents = appendDocumentEvents(
            state.documentEvents,
            collectRequirementDocEvents(state.requirementDocs, requirementDocs, state.currentProject.id, 'sync')
          );

          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(
            planningArtifacts.files,
            state.generatedFiles.filter((file) => !file.path.startsWith('src/generated/planning/'))
          );

          return {
            requirementDocs,
            documentEvents,
            activeKnowledgeFileId:
              requirementDocs.some((doc) => doc.id === state.activeKnowledgeFileId)
                ? state.activeKnowledgeFileId
                : null,
            selectedKnowledgeContextIds: state.selectedKnowledgeContextIds.filter((id) =>
              requirementDocs.some((doc) => doc.id === id)
            ),
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      replacePageStructure: (pageStructure, featureTree) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), state.wireframes);
          const next = buildReconciledArtifacts(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            featureTree,
            pageStructure,
            wireframes,
            state.generatedFiles
          );

          return {
            pageStructure,
            wireframes,
            prd: next.prd,
            featuresMarkdown: next.planningArtifacts.featuresMarkdown,
            wireframesMarkdown: next.planningArtifacts.wireframesMarkdown,
            designSystem: next.deliveryArtifacts.designSystem,
            uiSpecs: next.deliveryArtifacts.uiSpecs,
            devTasks: next.deliveryArtifacts.devTasks,
            generatedFiles: next.generatedFiles,
            testPlan: next.deliveryArtifacts.testPlan,
            deployPlan: next.deliveryArtifacts.deployPlan,
            graph: next.graph,
          };
        }),

      replaceWireframes: (wireframes, featureTree) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const nextWireframes = reconcileWireframes(collectDesignPages(state.pageStructure), wireframes);
          const next = buildReconciledArtifacts(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            featureTree,
            state.pageStructure,
            nextWireframes,
            state.generatedFiles
          );

          return {
            wireframes: nextWireframes,
            prd: next.prd,
            featuresMarkdown: next.planningArtifacts.featuresMarkdown,
            wireframesMarkdown: next.planningArtifacts.wireframesMarkdown,
            designSystem: next.deliveryArtifacts.designSystem,
            uiSpecs: next.deliveryArtifacts.uiSpecs,
            devTasks: next.deliveryArtifacts.devTasks,
            generatedFiles: next.generatedFiles,
            testPlan: next.deliveryArtifacts.testPlan,
            deployPlan: next.deliveryArtifacts.deployPlan,
            graph: next.graph,
          };
        }),

      updateWireframeFrame: (page, frame) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const current = state.wireframes[page.id];
          const nextFrame = frame.trim();
          if (current?.frame === nextFrame) {
            return state;
          }

          const wireframe: WireframeDocument = {
            id: current?.id || uuidv4(),
            pageId: page.id,
            pageName: page.name,
            frame: nextFrame,
            elements: current?.elements || [],
            updatedAt: new Date().toISOString(),
            status: (current?.elements || []).length > 0 ? 'ready' : 'draft',
          };

          return {
            wireframes: {
              ...state.wireframes,
              [page.id]: wireframe,
            },
          };
        }),

      mergeGeneratedFilesFromAI: (files) =>
        set((state) => {
          if (!state.currentProject || files.length === 0) {
            return state;
          }

          const generatedFiles = mergeGeneratedFiles(state.generatedFiles, files);

          return {
            generatedFiles,
            graph: buildProjectGraph(
              state.currentProject,
              state.requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              state.wireframes,
              state.designSystem,
              state.uiSpecs,
              state.devTasks,
              generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
          };
        }),

      generatePlanningArtifacts: (featureTree) => {
          const state = get();
          if (!state.currentProject) {
            return null;
          }

          const syncedFeatureTree = syncFeatureTreeWithPageStructure(featureTree, state.pageStructure) || featureTree;
          const prd = buildPRDFromProject(
            state.currentProject,
            state.requirementDocs,
            state.rawRequirementInput,
            syncedFeatureTree
          );
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            syncedFeatureTree,
            state.featuresMarkdown,
            prd,
            state.pageStructure,
            state.wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            syncedFeatureTree,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);
          const graph = buildProjectGraph(
            state.currentProject,
            state.requirementDocs,
            syncedFeatureTree,
            prd,
            state.pageStructure,
            state.wireframes,
            deliveryArtifacts.designSystem,
            deliveryArtifacts.uiSpecs,
            deliveryArtifacts.devTasks,
            generatedFiles,
            deliveryArtifacts.testPlan,
            deliveryArtifacts.deployPlan
          );

          set({
            prd,
            featuresMarkdown: planningArtifacts.featuresMarkdown,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph,
          });

          return syncedFeatureTree;
        },

      generateProductArtifactsFromRequirements: () => {
        const state = get();
        if (!state.currentProject) {
          return null;
        }

        const featureTree = buildFeatureTreeFromRequirements(
          state.currentProject.name,
          state.rawRequirementInput,
          state.requirementDocs
        );

        return get().generatePlanningArtifacts(featureTree);
      },

      saveWireframeDraft: (page, elements) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const current = state.wireframes[page.id];
          const wireframe: WireframeDocument = {
            id: current?.id || uuidv4(),
            pageId: page.id,
            pageName: page.name,
            frame: current?.frame,
            elements,
            updatedAt: new Date().toISOString(),
            status: elements.length > 0 ? 'ready' : 'draft',
          };

          return {
            wireframes: {
              ...state.wireframes,
              [page.id]: wireframe,
            },
          };
        }),

      upsertWireframe: (page, elements) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const current = state.wireframes[page.id];
          const wireframe: WireframeDocument = {
            id: current?.id || uuidv4(),
            pageId: page.id,
            pageName: page.name,
            frame: current?.frame,
            elements,
            updatedAt: new Date().toISOString(),
            status: elements.length > 0 ? 'ready' : 'draft',
          };
          const wireframes = {
            ...state.wireframes,
            [page.id]: wireframe,
          };
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            null,
            state.pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              state.currentProject,
              state.requirementDocs,
              null,
              state.prd,
              state.pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        }),

      addRootPage: () => {
        const state = get();
        if (!state.currentProject) {
          return null;
        }

        const nextIndex = collectDesignPages(state.pageStructure).length + 1;
        const nextPage = createPageNodeDraft({
          name: `新页面 ${nextIndex}`,
          description: '由页面工作台直接维护的页面。',
          featureIds: [],
          routeBase: '/pages',
          template: 'custom',
          ownerRole: 'UI设计',
          goal: '在页面侧独立维护页面结构、线框和后续 UI 产物。',
          notes: '支持手动维护，也支持后续由 AI 直接生成页面内容。',
        });

        set((current) => {
          if (!current.currentProject) {
            return current;
          }

          const pageStructure = [...current.pageStructure, nextPage];
          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), current.wireframes);
          const planningArtifacts = buildPlanningFiles(
            current.currentProject,
            current.rawRequirementInput,
            current.requirementDocs,
            null,
            current.featuresMarkdown,
            current.prd,
            pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            current.currentProject,
            null,
            pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            pageStructure,
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              current.currentProject,
              current.requirementDocs,
              null,
              current.prd,
              pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        });

        return nextPage;
      },

      addSiblingPage: (referencePageId) => {
        const state = get();
        if (!state.currentProject) {
          return null;
        }

        const pageContext = findPageContextById(state.pageStructure, referencePageId);
        if (!pageContext || pageContext.page.kind !== 'page') {
          return null;
        }

        const { page: referencePage, parent, siblings } = pageContext;
        const siblingPages = siblings.filter((node) => node.kind === 'page');
        const nextIndex = siblingPages.length + 1;
        const nextName = `新页面 ${nextIndex}`;
        const parentRoute =
          parent?.metadata.route.replace(/\/+$/, '') ||
          referencePage.metadata.route.replace(/\/[^/]+$/, '') ||
          '/pages';
        const nextPage = createPageNodeDraft({
          name: nextName,
          description: `与 ${referencePage.name} 同级的新页面。`,
          featureIds: parent?.featureIds.length ? [...parent.featureIds] : [...referencePage.featureIds],
          routeBase: parentRoute,
          template: referencePage.metadata.template,
          ownerRole: referencePage.metadata.ownerRole,
          goal: referencePage.metadata.goal || `补充 ${referencePage.name} 所在层级的页面流程`,
          notes: `作为 ${referencePage.name} 的同级页面继续补充结构。`,
        });

        set((current) => {
          if (!current.currentProject) {
            return current;
          }

          const pageStructure = insertPageNodeAfterId(current.pageStructure, referencePageId, () => nextPage);
          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), current.wireframes);
          const planningArtifacts = buildPlanningFiles(
            current.currentProject,
            current.rawRequirementInput,
            current.requirementDocs,
            null,
            current.featuresMarkdown,
            current.prd,
            pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            current.currentProject,
            null,
            pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            pageStructure,
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              current.currentProject,
              current.requirementDocs,
              null,
              current.prd,
              pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        });

        return nextPage;
      },

      addChildPage: (parentPageId) => {
        const state = get();
        if (!state.currentProject) {
          return null;
        }

        const parentPage = collectPageNodes(state.pageStructure).find((node) => node.id === parentPageId);
        if (!parentPage) {
          return null;
        }

        const siblingPages = parentPage.children.filter((node) => node.kind === 'page');
        const nextIndex = siblingPages.length + 1;
        const nextName = `新页面 ${nextIndex}`;
        const parentRoute = parentPage.metadata.route.replace(/\/+$/, '');
        const routeSuffix = toKebabCase(nextName) || `page-${nextIndex}`;
        const childPage: PageStructureNode = {
          id: uuidv4(),
          name: nextName,
          kind: 'page',
          description: `由 ${parentPage.name} 拆分出的子页面。`,
          featureIds: [...parentPage.featureIds],
          metadata: {
            route: `${parentRoute}/${routeSuffix}`.replace(/\/{2,}/g, '/'),
            title: nextName,
            goal: parentPage.metadata.goal || `承接 ${parentPage.name} 的后续操作`,
            template: parentPage.metadata.template,
            ownerRole: parentPage.metadata.ownerRole,
            notes: `作为 ${parentPage.name} 的子页面继续补充流程。`,
            status: 'draft',
          },
          children: [],
        };

        set((current) => {
          if (!current.currentProject) {
            return current;
          }

          const pageStructure = insertChildPageNodeById(current.pageStructure, parentPageId, () => childPage);
          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), current.wireframes);
          const planningArtifacts = buildPlanningFiles(
            current.currentProject,
            current.rawRequirementInput,
            current.requirementDocs,
            null,
            current.featuresMarkdown,
            current.prd,
            pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            current.currentProject,
            null,
            pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            pageStructure,
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              current.currentProject,
              current.requirementDocs,
              null,
              current.prd,
              pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        });

        return childPage;
      },

      deletePageStructureNode: (pageId) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const pageExists = collectPageNodes(state.pageStructure).some((node) => node.id === pageId);
          if (!pageExists) {
            return state;
          }

          const pageStructure = deletePageNodeById(state.pageStructure, pageId);
          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), state.wireframes);
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            null,
            pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            pageStructure,
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              state.currentProject,
              state.requirementDocs,
              null,
              state.prd,
              pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        }),

      updatePageStructureNode: (pageId, updates) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const pageStructure = updatePageNodeById(state.pageStructure, pageId, updates);
          const selectedPage = collectPageNodes(pageStructure).find((node) => node.id === pageId);
          const currentWireframe = state.wireframes[pageId];
          const wireframes =
            selectedPage && currentWireframe
              ? {
                  ...state.wireframes,
                  [pageId]: {
                    ...currentWireframe,
                    pageName: selectedPage.name,
                  },
                }
              : state.wireframes;
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            null,
            state.featuresMarkdown,
            state.prd,
            pageStructure,
            wireframes
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            null,
            pageStructure,
            wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            pageStructure,
            wireframes,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              state.currentProject,
              state.requirementDocs,
              null,
              state.prd,
              pageStructure,
              wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        }),

      generateDeliveryArtifacts: (featureTree) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            featureTree,
            state.pageStructure,
            state.wireframes
          );
          const planningArtifacts = buildPlanningFiles(
            state.currentProject,
            state.rawRequirementInput,
            state.requirementDocs,
            featureTree,
            state.featuresMarkdown,
            state.prd,
            state.pageStructure,
            state.wireframes
          );
          const generatedFiles = mergeGeneratedFiles(planningArtifacts.files, deliveryArtifacts.generatedFiles);

          return {
            featuresMarkdown: planningArtifacts.featuresMarkdown,
            wireframesMarkdown: planningArtifacts.wireframesMarkdown,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph: buildProjectGraph(
              state.currentProject,
              state.requirementDocs,
              featureTree,
              state.prd,
              state.pageStructure,
              state.wireframes,
              deliveryArtifacts.designSystem,
              deliveryArtifacts.uiSpecs,
              deliveryArtifacts.devTasks,
              generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        }),

      clearProject: () =>
        set({
          currentProjectId: null,
          currentProject: null,
          graph: emptyGraph,
          memory: null,
          rawRequirementInput: '',
          featuresMarkdown: '',
          wireframesMarkdown: '',
          requirementDocs: [],
          documentEvents: [],
          activeKnowledgeFileId: null,
          selectedKnowledgeContextIds: [],
          prd: null,
          pageStructure: [],
          wireframes: {},
          designSystem: null,
          uiSpecs: [],
          devTasks: [],
          generatedFiles: [],
          testPlan: null,
          deployPlan: null,
        }),
    }),
    {
      name: 'goodnight-project-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ProjectState>;
        const projects = Array.isArray(persisted.projects)
          ? persisted.projects
              .map((project) => normalizeProjectConfig(project))
              .filter((project): project is ProjectConfig => Boolean(project))
          : [];
        const currentProject = normalizeProjectConfig(persisted.currentProject);
        const requirementDocs = normalizeRequirementDocs(persisted.requirementDocs);
        const prd = normalizePrd(persisted.prd);
        const pageStructure = normalizePageStructure(persisted.pageStructure);
        const wireframes = normalizeWireframes(persisted.wireframes);
        const designSystem = normalizeDesignSystem(persisted.designSystem);
        const uiSpecs = normalizeUISpecs(persisted.uiSpecs);
        const devTasks = normalizeDevTasks(persisted.devTasks);
        const generatedFiles = normalizeGeneratedFiles(persisted.generatedFiles);
        const testPlan = normalizeTestPlan(persisted.testPlan);
        const deployPlan = normalizeDeployPlan(persisted.deployPlan);

        return {
          ...currentState,
          ...persisted,
          projects,
          currentProjectId:
            typeof persisted.currentProjectId === 'string'
              ? persisted.currentProjectId
              : currentProject?.id || null,
          currentProject,
          graph: currentProject
            ? buildProjectGraph(
                currentProject,
                requirementDocs,
                null,
                prd,
                pageStructure,
                wireframes,
                designSystem,
                uiSpecs,
                devTasks,
                generatedFiles,
                testPlan,
                deployPlan
              )
            : normalizeGraph(persisted.graph),
          memory: normalizeProjectMemory(persisted.memory),
          rawRequirementInput: typeof persisted.rawRequirementInput === 'string' ? persisted.rawRequirementInput : '',
          featuresMarkdown: typeof persisted.featuresMarkdown === 'string' ? persisted.featuresMarkdown : '',
          wireframesMarkdown: typeof persisted.wireframesMarkdown === 'string' ? persisted.wireframesMarkdown : '',
          requirementDocs,
          documentEvents: normalizeDocumentChangeEvents(persisted.documentEvents),
          activeKnowledgeFileId: typeof persisted.activeKnowledgeFileId === 'string' ? persisted.activeKnowledgeFileId : null,
          selectedKnowledgeContextIds: Array.isArray(persisted.selectedKnowledgeContextIds)
            ? persisted.selectedKnowledgeContextIds.filter((item): item is string => typeof item === 'string')
            : [],
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
      },
    }
  )
);
