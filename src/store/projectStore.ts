import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  FeatureNode,
  FeatureTree,
  GraphEdge,
  GraphNodeBase,
  CanvasElement,
  DeployPlanDoc,
  DesignSystemDoc,
  DevTask,
  GeneratedFile,
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

export interface CreateProjectInput {
  name: string;
  appType: ProjectConfig['appType'];
  frontendFramework: string;
  backendFramework: string;
  database: string;
  uiFramework: string;
  deployment: string;
}

interface ProjectState {
  currentProject: ProjectConfig | null;
  graph: ProjectGraph;
  memory: ProjectMemory | null;
  rawRequirementInput: string;
  requirementDocs: RequirementDoc[];
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
  updateProject: (updates: Partial<Omit<ProjectConfig, 'id' | 'createdAt'>>) => void;
  setRawRequirementInput: (value: string) => void;
  updateRequirementDoc: (id: string, updates: Partial<Pick<RequirementDoc, 'title' | 'summary' | 'status'>>) => void;
  addRequirementDoc: () => void;
  generatePlanningArtifacts: (featureTree: FeatureTree | null) => FeatureTree | null;
  upsertWireframe: (page: Pick<PageStructureNode, 'id' | 'name'>, elements: CanvasElement[]) => void;
  updatePageStructureNode: (
    pageId: string,
    updates: Partial<Pick<PageStructureNode, 'name' | 'description'>> & {
      metadata?: Partial<PageStructureNode['metadata']>;
    }
  ) => void;
  generateDeliveryArtifacts: (featureTree: FeatureTree | null) => void;
  clearProject: () => void;
}

const buildStarterRequirementDocs = (projectName: string): RequirementDoc[] => {
  const now = new Date().toISOString();

  return [
    {
      id: uuidv4(),
      title: `${projectName} 初始需求`,
      summary: '整理核心目标、主要角色和 MVP 范围，作为后续 PRD 和功能树的基础输入。',
      authorRole: '产品经理',
      updatedAt: now,
      status: 'ready',
    },
    {
      id: uuidv4(),
      title: '信息架构草案',
      summary: '拆分页面结构、关键工作流与线框图入口，衔接产品与设计工作区。',
      authorRole: 'UI设计',
      updatedAt: now,
      status: 'draft',
    },
  ];
};

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

const buildProjectMemory = (project: ProjectConfig): ProjectMemory => ({
  techStack: {
    appType: project.appType,
    frontend: project.frontendFramework,
    backend: project.backendFramework,
    database: project.database,
    uiFramework: project.uiFramework,
    deployment: project.deployment,
  },
  designSystem: {
    mode: 'draft',
    uiFramework: project.uiFramework,
  },
  codeStructure: {
    frontendRoot: 'src',
    backendRoot: project.backendFramework ? 'src-tauri / server' : 'src',
  },
});

const buildStarterRawRequirementInput = (projectName: string) =>
  `${projectName} 需要成为一个可视化的软件生产工作台。\n支持需求梳理、功能拆分、页面结构设计、线框图编辑，并逐步衔接代码、测试和部署流程。`;

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
  ownerRole: node.kind === 'flow' ? '产品经理' : node.kind === 'page' ? 'UI设计' : '开发',
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

const buildPageStructureFromFeatureTree = (featureTree: FeatureTree | null): PageStructureNode[] => {
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
        ownerRole: '产品经理',
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
            ownerRole: '产品经理',
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

const buildWireframesFromPages = (pages: PageStructureNode[]): Record<string, WireframeDocument> => {
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
    summary: `围绕 ${project.uiFramework} 与 ${project.frontendFramework} 生成的基础设计系统草案。`,
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
  project: ProjectConfig
): DevTask[] => {
  const frontendTasks = pages.map((page) => {
    const spec = uiSpecs.find((item) => item.pageId === page.id);
    const fileName = toKebabCase(page.name) || 'page';
    return {
      id: uuidv4(),
      title: `实现页面：${page.name}`,
      summary: `基于 ${page.name} 的 UI Spec 搭建 ${project.frontendFramework} 页面骨架。`,
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
    title: `部署到 ${project.deployment}`,
    summary: '生成部署脚本、环境变量清单与交付流程说明。',
    owner: 'devops',
    status: 'ready',
    relatedFilePaths: ['src/generated/deploy/deploy-plan.md', 'src/generated/deploy/deploy.sh'],
    acceptanceCriteria: ['具备部署步骤', '具备环境变量说明', '具备构建与发布命令'],
  };

  return [...frontendTasks, ...backendTasks, qaTask, devopsTask];
};

const buildGeneratedFiles = (
  project: ProjectConfig,
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
      content: `# Deploy Plan\n\nTarget: ${project.deployment}\n\n${deployPlan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`,
      language: 'md' as const,
      category: 'deploy' as const,
      summary: '部署计划文档',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'devops').map((task) => task.id),
      updatedAt: now,
    },
    {
      path: 'src/generated/deploy/deploy.sh',
      content: `#!/usr/bin/env bash\nnpm run build\n# deploy to ${project.deployment}\n`,
      language: 'sh' as const,
      category: 'deploy' as const,
      summary: '部署脚本草案',
      sourceTaskIds: devTasks.filter((task) => task.owner === 'devops').map((task) => task.id),
      updatedAt: now,
    },
  ];

  return files;
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
  project: ProjectConfig,
  generatedFiles: Pick<GeneratedFile, 'path'>[]
): DeployPlanDoc => {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    target: project.deployment,
    summary: `围绕 ${project.deployment} 输出的基础交付计划。`,
    environments: ['development', 'staging', 'production'],
    envVars: ['APP_ENV', 'API_BASE_URL', 'DATABASE_URL'],
    steps: [
      '校验项目配置与设计/开发产物一致',
      '执行 npm run build 构建前端产物',
      `按 ${project.deployment} 目标准备部署配置`,
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
  const databaseNodes: GraphNodeBase[] =
    project.database && project.database !== 'None'
      ? [
          {
            id: `${project.id}-database`,
            type: 'database',
            name: project.database,
            status: 'ready',
            metadata: {
              provider: project.database,
            },
          },
        ]
      : [];
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
        frontendFramework: project.frontendFramework,
        backendFramework: project.backendFramework,
        database: project.database,
        uiFramework: project.uiFramework,
        deployment: project.deployment,
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
    ...databaseNodes,
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
    ...databaseNodes.map((node) => ({
      id: uuidv4(),
      from: project.id,
      to: node.id,
      relation: 'depends_on' as const,
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

const emptyGraph: ProjectGraph = { nodes: [], edges: [] };

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

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentProject: null,
      graph: emptyGraph,
      memory: null,
      rawRequirementInput: '',
      requirementDocs: [],
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
          appType: input.appType,
          frontendFramework: input.frontendFramework,
          backendFramework: input.backendFramework,
          database: input.database,
          uiFramework: input.uiFramework,
          deployment: input.deployment,
          createdAt: now,
          updatedAt: now,
        };

        const requirementDocs = buildStarterRequirementDocs(project.name);
        const featureTree = buildStarterFeatureTree(project.name);
        const rawRequirementInput = buildStarterRawRequirementInput(project.name);
        const prd = buildPRDFromProject(project, requirementDocs, rawRequirementInput, featureTree);
        const pageStructure = buildPageStructureFromFeatureTree(featureTree);
        const wireframes = buildWireframesFromPages(collectDesignPages(pageStructure));
        const memory = buildProjectMemory(project);
        const deliveryArtifacts = buildDeliveryArtifacts(project, featureTree, pageStructure, wireframes);
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
          deliveryArtifacts.generatedFiles,
          deliveryArtifacts.testPlan,
          deliveryArtifacts.deployPlan
        );

        set({
          currentProject: project,
          graph,
          memory,
          rawRequirementInput,
          requirementDocs,
          prd,
          pageStructure,
          wireframes,
          designSystem: deliveryArtifacts.designSystem,
          uiSpecs: deliveryArtifacts.uiSpecs,
          devTasks: deliveryArtifacts.devTasks,
          generatedFiles: deliveryArtifacts.generatedFiles,
          testPlan: deliveryArtifacts.testPlan,
          deployPlan: deliveryArtifacts.deployPlan,
        });

        return {
          project,
          featureTree: syncFeatureTreeWithPageStructure(featureTree, pageStructure) || featureTree,
        };
      },

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

      setRawRequirementInput: (value) => set({ rawRequirementInput: value }),

      updateRequirementDoc: (id, updates) =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const requirementDocs = state.requirementDocs.map((doc) =>
            doc.id === id
              ? {
                  ...doc,
                  ...updates,
                  updatedAt: new Date().toISOString(),
                }
              : doc
          );

          return {
            requirementDocs,
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
              state.generatedFiles,
              state.testPlan,
              state.deployPlan
            ),
            
          };
        }),

      addRequirementDoc: () =>
        set((state) => {
          if (!state.currentProject) {
            return state;
          }

          const requirementDocs: RequirementDoc[] = [
            ...state.requirementDocs,
            {
              id: uuidv4(),
              title: '新增需求条目',
              summary: '补充新的用户故事、约束条件或业务规则。',
              authorRole: '产品经理',
              updatedAt: new Date().toISOString(),
              status: 'draft',
            },
          ];

          return {
            requirementDocs,
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
              state.generatedFiles,
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

          const pageStructure = buildPageStructureFromFeatureTree(featureTree);
          const syncedFeatureTree = syncFeatureTreeWithPageStructure(featureTree, pageStructure) || featureTree;
          const wireframes = reconcileWireframes(collectDesignPages(pageStructure), state.wireframes);
          const prd = buildPRDFromProject(
            state.currentProject,
            state.requirementDocs,
            state.rawRequirementInput,
            syncedFeatureTree
          );
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            syncedFeatureTree,
            pageStructure,
            wireframes
          );
          const graph = buildProjectGraph(
            state.currentProject,
            state.requirementDocs,
            syncedFeatureTree,
            prd,
            pageStructure,
            wireframes,
            deliveryArtifacts.designSystem,
            deliveryArtifacts.uiSpecs,
            deliveryArtifacts.devTasks,
            deliveryArtifacts.generatedFiles,
            deliveryArtifacts.testPlan,
            deliveryArtifacts.deployPlan
          );

          set({
            prd,
            pageStructure,
            wireframes,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles: deliveryArtifacts.generatedFiles,
            testPlan: deliveryArtifacts.testPlan,
            deployPlan: deliveryArtifacts.deployPlan,
            graph,
          });

          return syncedFeatureTree;
        },

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
            elements,
            updatedAt: new Date().toISOString(),
            status: elements.length > 0 ? 'ready' : 'draft',
          };
          const wireframes = {
            ...state.wireframes,
            [page.id]: wireframe,
          };
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            null,
            state.pageStructure,
            wireframes
          );

          return {
            wireframes,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles: deliveryArtifacts.generatedFiles,
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
              deliveryArtifacts.generatedFiles,
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
          const deliveryArtifacts = buildDeliveryArtifacts(
            state.currentProject,
            null,
            pageStructure,
            wireframes
          );

          return {
            pageStructure,
            wireframes,
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles: deliveryArtifacts.generatedFiles,
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
              deliveryArtifacts.generatedFiles,
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

          return {
            designSystem: deliveryArtifacts.designSystem,
            uiSpecs: deliveryArtifacts.uiSpecs,
            devTasks: deliveryArtifacts.devTasks,
            generatedFiles: deliveryArtifacts.generatedFiles,
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
              deliveryArtifacts.generatedFiles,
              deliveryArtifacts.testPlan,
              deliveryArtifacts.deployPlan
            ),
          };
        }),

      clearProject: () =>
        set({
          currentProject: null,
          graph: emptyGraph,
          memory: null,
          rawRequirementInput: '',
          requirementDocs: [],
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
      name: 'devflow-project-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
