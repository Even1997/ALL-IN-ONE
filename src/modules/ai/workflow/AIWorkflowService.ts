import { v4 as uuidv4 } from 'uuid';
import { aiService } from '../core/AIService';
import { buildAIConfigurationError } from '../core/configStatus';
import { useProjectStore } from '../../../store/projectStore';
import { useFeatureTreeStore } from '../../../store/featureTreeStore';
import {
  createWireframeModule,
  getCanvasPreset,
  isMobileAppType,
  toWireframeModuleDrafts,
} from '../../../utils/wireframe';
import { buildKnowledgeContextSelection, buildKnowledgeEntries } from '../../knowledge/knowledgeEntries';
import {
  AIExperienceMode,
  AISkillName,
  AIWorkflowPackage,
  AIWorkflowRun,
  AIWorkflowStage,
  FeatureNode,
  FeatureTree,
  GeneratedFile,
  HTMLPrototypeDoc,
  HTMLPrototypePage,
  PageStructureNode,
  RequirementDoc,
  SkillExecution,
  StyleProfile,
  WireframeDocument,
} from '../../../types';
import { useAIWorkflowStore } from '../store/workflowStore';

type RequirementSection = {
  title: string;
  content: string;
};

type RequirementsSpecSkillOutput = {
  title: string;
  summary: string;
  sections: RequirementSection[];
  assumptions: string[];
};

type StructuredFeatureNode = {
  name: string;
  description: string;
  acceptanceCriteria: string[];
  children: StructuredFeatureNode[];
};

type FeatureTreeSkillOutput = {
  summary: string;
  nodes: StructuredFeatureNode[];
  userStories: Array<{
    asA: string;
    iWant: string;
    soThat: string;
    tasks: string[];
  }>;
};

type StructuredPageNode = {
  name: string;
  description: string;
  route: string;
  goal: string;
  template: PageStructureNode['metadata']['template'];
  featureNames: string[];
  children: StructuredPageNode[];
};

type PageStructureSkillOutput = {
  summary: string;
  pages: StructuredPageNode[];
};

type StructuredWireframeModule = {
  name: string;
  purpose?: string;
  actions?: string[];
  priority?: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type WireframeSkillOutput = {
  summary: string;
  pages: Array<{
    pageName: string;
    modules: StructuredWireframeModule[];
  }>;
};

type HTMLPrototypeSkillOutput = {
  summary: string;
  pages: Array<{
    path: string;
    title: string;
    html: string;
    cssTokensUsed: string[];
  }>;
};

type SkillResult<T> = {
  data: T;
  summary: string;
  provider?: string;
  model?: string;
  usedFallback: boolean;
  rawText?: string;
};

const WORKFLOW_SKILL_VERSION = 'v1';
const WORKFLOW_SCHEMA_VERSION = 'v1';

const PACKAGE_STAGES: Record<AIWorkflowPackage, AIWorkflowStage[]> = {
  requirements: ['requirements_spec', 'feature_tree'],
  prototype: ['page_structure', 'wireframes'],
  page: ['html_prototype'],
};

const SYSTEM_PROMPT = `你是面向产品经理的 AI 产品工作台编排助手。
你必须遵守以下规则：
1. 只输出当前阶段要求的 JSON，不要跳阶段。
2. 不要发明系统未定义的字段。
3. 如果信息不足，只能放入 assumptions 或 notes，不要伪造确定结论。
4. 除非当前阶段是 html_prototype，否则不要输出前端代码。
5. 输出中文内容，字段键保持英文。`;

const WORKFLOW_PROMPTS: Record<AISkillName, string> = {
  requirements_spec_skill:
    '你是资深产品经理助理。请把用户原始需求整理成可确认的需求规格说明书。不要补充未被暗示的业务规则。缺失项用 assumptions 标注。',
  feature_tree_skill:
    '你是产品分析师。请把已确认需求拆成功能树，层级不超过 3 层，每个叶子节点必须可被页面或流程承接。',
  page_structure_skill:
    '你是信息架构设计师。请把功能树映射为页面结构，优先页面目标和用户任务闭环，不要生成实现细节。',
  wireframe_skill:
    '你是低保真原型设计师。请先做模块设计，再输出线框。每个页面必须拆成 4-8 个功能模块，模块名要体现业务职责，不能只写“容器/卡片/区域”。每个模块都要填写 purpose、content、actions、priority，说明它承载的目标、信息和关键操作。只输出模块化线框，不输出视觉风格词，不输出前端代码。',
  html_prototype_skill:
    '你是前端原型设计师。请基于已确认草图生成可预览 HTML 原型，保留低到中保真交互，不实现真实业务逻辑。',
};

const trimAndJoin = (...parts: Array<string | undefined>) =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n\n');

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'page';

const summarize = (value: string, maxLength = 120) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(1, maxLength - 3))}...` : normalized;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const collectPageNodes = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [node, ...collectPageNodes(node.children)]);

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const extractIdeas = (rawInput: string, docs: RequirementDoc[]) => {
  const source = [rawInput, ...docs.map((doc) => doc.content)].join('\n');
  return uniqueStrings(
    source
      .replace(/\r/g, '\n')
      .split(/[\n。！？!?\-•]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 6)
  ).slice(0, 8);
};

const toRequirementMarkdown = (output: RequirementsSpecSkillOutput) =>
  [
    `# ${output.title}`,
    '',
    output.summary,
    '',
    ...output.sections.flatMap((section) => [`## ${section.title}`, '', section.content, '']),
    '## Assumptions',
    '',
    ...(output.assumptions.length > 0 ? output.assumptions.map((item) => `- ${item}`) : ['- 暂无']),
    '',
  ].join('\n');

export const createDefaultStyleProfiles = (appType: StyleProfile['appType']): StyleProfile[] => {
  const now = new Date().toISOString();

  return [
    {
      id: 'style-clean-workbench',
      name: 'Clean Workbench',
      summary: '清晰稳重的企业工作台风格，适合产品经理确认流程。',
      industry: 'SaaS',
      direction: 'Structured editorial workspace',
      colorMood: 'Slate blue',
      appType,
      palette: ['#0f172a', '#1d4ed8', '#e2e8f0', '#ffffff', '#f8fafc'],
      typography: { heading: 'Manrope', body: 'Inter' },
      radius: '18px',
      notes: ['适合表单、表格、状态卡片', '信息密度高但层级清晰'],
      status: 'ready',
      updatedAt: now,
    },
    {
      id: 'style-product-bento',
      name: 'Bento Spotlight',
      summary: '模块化 bento 信息编排，适合概览页和能力展示页。',
      industry: 'Productivity',
      direction: 'Bento grid overview',
      colorMood: 'Sky teal',
      appType,
      palette: ['#082f49', '#0891b2', '#67e8f9', '#f8fafc', '#cffafe'],
      typography: { heading: 'Manrope', body: 'Inter' },
      radius: '22px',
      notes: ['适合首页与总览页', '突出功能卡片和阶段状态'],
      status: 'ready',
      updatedAt: now,
    },
    {
      id: 'style-warm-docs',
      name: 'Warm Docs',
      summary: '偏内容与文档的温和视觉，更适合需求说明书和确认页。',
      industry: 'Documentation',
      direction: 'Editorial minimal',
      colorMood: 'Warm neutral',
      appType,
      palette: ['#2f241f', '#8c6a43', '#f6f1e8', '#ffffff', '#d6c3a5'],
      typography: { heading: 'Georgia', body: 'Inter' },
      radius: '16px',
      notes: ['强调可读性', '适合长文档与草图确认'],
      status: 'ready',
      updatedAt: now,
    },
  ];
};

const validateRequirementsSpec = (value: unknown): value is RequirementsSpecSkillOutput =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as RequirementsSpecSkillOutput).title === 'string' &&
      typeof (value as RequirementsSpecSkillOutput).summary === 'string' &&
      Array.isArray((value as RequirementsSpecSkillOutput).sections)
  );

const validateFeatureTree = (value: unknown): value is FeatureTreeSkillOutput =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as FeatureTreeSkillOutput).nodes));

const validatePageStructure = (value: unknown): value is PageStructureSkillOutput =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as PageStructureSkillOutput).pages));

const validateWireframes = (value: unknown): value is WireframeSkillOutput =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as WireframeSkillOutput).pages));

const validateHTMLPrototype = (value: unknown): value is HTMLPrototypeSkillOutput =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as HTMLPrototypeSkillOutput).pages));

const extractJSONObject = (value: string) => {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const arrayStart = value.indexOf('[');
  const objectStart = value.indexOf('{');
  const start = arrayStart === -1 ? objectStart : objectStart === -1 ? arrayStart : Math.min(arrayStart, objectStart);
  if (start === -1) {
    return '';
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      stack.pop();
      if (stack.length === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return '';
};

const formatSchemaPrompt = (schema: string) =>
  `只返回合法 JSON。禁止解释文字。返回 schema:
${schema}`;

const buildRequirementsFallback = (projectName: string, rawInput: string, docs: RequirementDoc[]): RequirementsSpecSkillOutput => {
  const ideas = extractIdeas(rawInput, docs);
  const goal = ideas[0] || summarize(rawInput, 100) || `${projectName} 的核心目标`;
  const audience = ideas[1] || '产品经理与业务确认人员';

  return {
    title: `${projectName} 需求规格说明书`,
    summary: summarize(rawInput, 120) || `${projectName} 的一期目标是把自然语言需求沉淀为可确认的结构化产物。`,
    sections: [
      {
        title: '项目目标',
        content: `围绕“${goal}”建立从项目创建、需求整理、功能拆解到草图与 HTML 原型输出的一体化工作流。`,
      },
      {
        title: '目标用户与场景',
        content: `一期主要面向 ${audience}，强调快速确认需求、减少反复沟通，并沉淀标准化交付物。`,
      },
      {
        title: '一期核心流程',
        content:
          '用户创建项目后输入需求，系统先生成需求规格说明书和功能清单，再生成页面结构与草图，最后基于确认后的草图和风格生成 HTML 原型。',
      },
      {
        title: '范围与边界',
        content:
          '一期只覆盖需求文档、功能树、页面结构、低保真草图和 HTML 原型，不输出生产可用业务代码，也不做 Figma/Axure 深度适配。',
      },
    ],
    assumptions: [
      '若用户没有明确给出业务规则，系统仅提供可确认的默认假设，不将其视为确定结论。',
      '页面和草图优先服务于结构确认，不追求高保真视觉还原。',
      'HTML 原型用于预览和导出，不承载真实后端逻辑。',
    ],
  };
};

const buildFeatureFallback = (projectName: string, requirements: RequirementsSpecSkillOutput): FeatureTreeSkillOutput => {
  const summarySeed = summarize(
    requirements.sections.map((section) => `${section.title}:${section.content}`).join(' '),
    120
  );

  return {
    summary: summarySeed || `${projectName} 的功能树覆盖需求整理、原型生成与 HTML 导出。`,
    nodes: [
      {
        name: '项目创建与需求录入',
        description: '创建项目、记录原始需求、沉淀需求输入上下文。',
        acceptanceCriteria: ['支持创建项目', '支持录入和保存原始需求', '支持后续 AI 继续引用该需求'],
        children: [
          {
            name: '项目基础信息',
            description: '维护项目名称、简介和目标。',
            acceptanceCriteria: ['可编辑项目基本信息'],
            children: [],
          },
          {
            name: '原始需求输入',
            description: '接收用户自然语言输入并保存为项目上下文。',
            acceptanceCriteria: ['可保存原始需求', '可被后续技能读取'],
            children: [],
          },
        ],
      },
      {
        name: '需求规格与功能拆解',
        description: '把需求沉淀为需求规格说明书和结构化功能树。',
        acceptanceCriteria: ['生成需求规格说明书', '生成层级不超过 3 层的功能树', '功能节点包含验收标准'],
        children: [
          {
            name: '需求规格说明书',
            description: '形成可确认的需求文档。',
            acceptanceCriteria: ['有标题和摘要', '有范围说明', '有 assumptions'],
            children: [],
          },
          {
            name: '功能树维护',
            description: '将需求拆解为产品功能节点。',
            acceptanceCriteria: ['叶子功能可被页面承接', '功能节点支持手动维护'],
            children: [],
          },
        ],
      },
      {
        name: '页面结构与低保真草图',
        description: '把功能映射为页面树，并产出可编辑的低保真草图。',
        acceptanceCriteria: ['页面结构清晰', '页面包含目标和路由', '草图模块可被画布直接消费'],
        children: [
          {
            name: '页面结构建议',
            description: '生成功能到页面的映射。',
            acceptanceCriteria: ['页面数量适中', '页面目标明确'],
            children: [],
          },
          {
            name: '页面草图初稿',
            description: '生成页面模块与坐标布局。',
            acceptanceCriteria: ['模块有位置和尺寸', '支持手动调整与确认'],
            children: [],
          },
        ],
      },
      {
        name: '样式选择与 HTML 原型',
        description: '根据确认后的草图和风格方向生成可预览 HTML 原型。',
        acceptanceCriteria: ['可选择风格档案', '输出多页面 HTML', '支持下载导出'],
        children: [
          {
            name: '风格档案',
            description: '记录设计方向、配色和字体偏好。',
            acceptanceCriteria: ['可选择预设风格'],
            children: [],
          },
          {
            name: 'HTML 原型导出',
            description: '导出静态 HTML 与 manifest。',
            acceptanceCriteria: ['HTML 可预览', '包含基础导航关系'],
            children: [],
          },
        ],
      },
    ],
    userStories: [
      {
        asA: '产品经理',
        iWant: '直接输入需求并获得结构化产物',
        soThat: '我能更快完成需求确认与原型讨论',
        tasks: ['创建项目', '填写需求', '确认文档和草图'],
      },
      {
        asA: '业务协作方',
        iWant: '查看低保真草图和 HTML 原型',
        soThat: '我可以快速确认范围和页面结构',
        tasks: ['查看页面结构', '确认页面草图', '下载 HTML'],
      },
    ],
  };
};

const mapStructuredFeatureNodes = (nodes: StructuredFeatureNode[]): FeatureNode[] =>
  nodes.map((node, index) => ({
    id: uuidv4(),
    name: node.name,
    description: node.description,
    acceptanceCriteria: node.acceptanceCriteria,
    status: index === 0 ? 'in_progress' : 'pending',
    priority: index === 0 ? 'high' : 'medium',
    progress: index === 0 ? 55 : 0,
    linkedPrototypePageIds: [],
    linkedCodeFiles: [],
    children: mapStructuredFeatureNodes(node.children),
  }));

const buildFeatureTree = (projectName: string, output: FeatureTreeSkillOutput): FeatureTree => ({
  id: uuidv4(),
  name: `${projectName} AI Workflow`,
  children: mapStructuredFeatureNodes(output.nodes),
});

const buildPageStructureFallback = (featureTree: FeatureTree, appType: StyleProfile['appType']): PageStructureSkillOutput => {
  const rootFeatures = featureTree.children;
  const requirementFeature = rootFeatures[0];
  const planningFeature = rootFeatures[1];
  const pageFeature = rootFeatures[2];
  const deliveryFeature = rootFeatures[3];

  return {
    summary: '页面结构围绕项目创建、需求确认、草图确认与 HTML 导出构建。',
    pages: [
      {
        name: '产品工作台',
        description: '集中承接项目背景、需求、功能树和阶段状态。',
        route: '/product',
        goal: '让产品经理在一个工作台内推进需求到原型的流程',
        template: 'workspace',
        featureNames: uniqueStrings([requirementFeature?.name, planningFeature?.name].filter(Boolean) as string[]),
        children: [
          {
            name: '需求规格说明书',
            description: '查看和编辑 AI 生成的需求规格说明书。',
            route: '/product/requirements',
            goal: '确认项目目标、范围和假设',
            template: 'form',
            featureNames: [planningFeature?.name || requirementFeature?.name].filter(Boolean) as string[],
            children: [],
          },
          {
            name: '功能清单',
            description: '查看并维护功能树及验收标准。',
            route: '/product/features',
            goal: '确认功能边界与层级拆解',
            template: 'list',
            featureNames: [planningFeature?.name || '需求规格与功能拆解'],
            children: [],
          },
        ],
      },
      {
        name: '原型工作台',
        description: '查看页面结构、生成草图并进行低保真确认。',
        route: '/prototype',
        goal: '把功能树映射为页面结构和低保真草图',
        template: 'workspace',
        featureNames: uniqueStrings([pageFeature?.name, deliveryFeature?.name].filter(Boolean) as string[]),
        children: [
          {
            name: isMobileAppType(appType) ? '移动端页面草图' : '页面草图',
            description: '承接页面结构并输出可编辑的模块草图。',
            route: '/prototype/wireframes',
            goal: '确认页面模块布局与主要信息层级',
            template: 'workspace',
            featureNames: [pageFeature?.name || '页面结构与低保真草图'],
            children: [],
          },
          {
            name: 'HTML 原型导出',
            description: '基于确认后的草图输出静态 HTML 原型。',
            route: '/prototype/html',
            goal: '预览和导出静态 HTML 页面',
            template: 'detail',
            featureNames: [deliveryFeature?.name || '样式选择与 HTML 原型'],
            children: [],
          },
        ],
      },
    ],
  };
};

const buildPageNode = (
  input: StructuredPageNode,
  featureIdMap: Map<string, string>,
  ownerRole: PageStructureNode['metadata']['ownerRole'] = '产品'
): PageStructureNode => ({
  id: uuidv4(),
  name: input.name,
  kind: input.children.length > 0 ? 'flow' : 'page',
  description: input.description,
  featureIds: input.featureNames.map((name) => featureIdMap.get(name)).filter((id): id is string => Boolean(id)),
  metadata: {
    route: input.route,
    title: input.name,
    goal: input.goal,
    template: input.template,
    ownerRole,
    notes: 'Generated by AI workflow',
    status: 'ready',
  },
  children: input.children.map((child) => buildPageNode(child, featureIdMap, child.children.length > 0 ? '产品' : 'UI设计')),
});

const buildWireframeModuleSummary = (module: StructuredWireframeModule) => {
  const sections = [
    module.purpose ? `职责：${module.purpose}` : '',
    module.content ? `内容：${module.content}` : '',
    module.actions && module.actions.length > 0 ? `操作：${module.actions.join(' / ')}` : '',
    module.priority ? `优先级：${module.priority}` : '',
  ].filter(Boolean);

  return sections.join('\n');
};

const buildWireframePageContext = (pages: PageStructureNode[], featureTree: FeatureTree) => {
  const designPages = collectDesignPages(pages);
  const featureNodeQueue = [...featureTree.children];
  const featureMap = new Map<string, string>();

  while (featureNodeQueue.length > 0) {
    const node = featureNodeQueue.shift();
    if (!node) {
      continue;
    }

    featureMap.set(node.id, node.name);
    featureNodeQueue.push(...node.children);
  }

  return designPages
    .map((page) => {
      const featureNames = page.featureIds.map((id) => featureMap.get(id) || id).filter(Boolean);
      return [
        `page: ${page.name}`,
        `route: ${page.metadata.route}`,
        `goal: ${page.metadata.goal || page.description || page.name}`,
        `description: ${page.description || page.metadata.goal || page.name}`,
        `features: ${featureNames.join(' / ') || '无'}`,
      ].join('\n');
    })
    .join('\n\n---\n\n');
};

const buildWireframeModules = (
  page: PageStructureNode,
  appType: StyleProfile['appType'],
  featureLabels: string[]
): StructuredWireframeModule[] => {
  const promptSummary = summarize([page.metadata.goal, page.description, featureLabels.join(' / ')].filter(Boolean).join(' | '), 100);
  const preset = getCanvasPreset(appType);
  const mobile = preset.frameType === 'mobile';

  if (mobile) {
    return [
      {
        name: `${page.name} 顶部导航`,
        purpose: '帮助用户确认页面位置并快速返回关键入口。',
        actions: ['返回上一级', '查看标题'],
        priority: 'high',
        content: promptSummary || page.name,
        x: 20,
        y: 28,
        width: 318,
        height: 92,
      },
      {
        name: '核心信息模块',
        purpose: '展示当前页面最重要的信息或结果。',
        actions: ['查看核心信息'],
        priority: 'high',
        content: featureLabels[0] || '核心信息与主要价值说明',
        x: 20,
        y: 138,
        width: 318,
        height: 144,
      },
      {
        name: '主要内容模块',
        purpose: '承载用户完成当前任务所需的主体内容。',
        actions: ['浏览内容', '编辑内容'],
        priority: 'high',
        content: featureLabels[1] || '主体内容模块',
        x: 20,
        y: 302,
        width: 318,
        height: 208,
      },
      {
        name: '关键操作模块',
        purpose: '承接提交、下一步、确认等主操作。',
        actions: ['提交', '下一步', '保存'],
        priority: 'high',
        content: '提交、下一步、状态反馈',
        x: 20,
        y: 530,
        width: 318,
        height: 168,
      },
      {
        name: '底部导航模块',
        purpose: '提供辅助导航或高频切换入口。',
        actions: ['切换 Tab', '进入常用入口'],
        priority: 'medium',
        content: '导航 / 常用操作',
        x: 20,
        y: 720,
        width: 318,
        height: 84,
      },
    ];
  }

  return [
    {
      name: `${page.name} 顶部导航`,
      purpose: '帮助用户理解当前页面位置并进入关键入口。',
      actions: ['全局导航', '搜索', '快捷入口'],
      priority: 'high',
      content: promptSummary || page.name,
      x: 36,
      y: 28,
      width: 1160,
      height: 84,
    },
    {
      name: '筛选与导航模块',
      purpose: '帮助用户缩小范围、切换视角或选择工作对象。',
      actions: ['筛选', '切换分类'],
      priority: 'high',
      content: featureLabels[0] || '一级导航和筛选条件',
      x: 36,
      y: 136,
      width: 252,
      height: 536,
    },
    {
      name: '主任务模块',
      purpose: '承接当前页面最核心的主任务流程。',
      actions: ['查看详情', '执行主任务'],
      priority: 'high',
      content: featureLabels[1] || '主体内容与关键任务流',
      x: 320,
      y: 136,
      width: 560,
      height: 536,
    },
    {
      name: '辅助信息模块',
      purpose: '补充说明、状态、提示和上下文信息。',
      actions: ['查看说明', '确认状态'],
      priority: 'medium',
      content: featureLabels[2] || '说明、状态和补充信息',
      x: 912,
      y: 136,
      width: 284,
      height: 536,
    },
  ];
};

const buildWireframeFallback = (pageStructure: PageStructureNode[], featureTree: FeatureTree, appType: StyleProfile['appType']): WireframeSkillOutput => {
  const designPages = collectDesignPages(pageStructure);
  const featureMap = new Map(featureTree.children.map((node) => [node.id, node.name]));

  return {
    summary: '页面草图已根据页面目标和功能映射生成低保真模块布局。',
    pages: designPages.map((page) => ({
      pageName: page.name,
      modules: buildWireframeModules(
        page,
        appType,
        page.featureIds.map((id) => featureMap.get(id)).filter((name): name is string => Boolean(name))
      ),
    })),
  };
};

const mapWireframesToDocuments = (
  output: WireframeSkillOutput,
  pageStructure: PageStructureNode[],
  appType: StyleProfile['appType']
): Record<string, WireframeDocument> => {
  const now = new Date().toISOString();
  const pageMap = new Map(collectDesignPages(pageStructure).map((page) => [page.name, page]));

  return output.pages.reduce<Record<string, WireframeDocument>>((accumulator, pageDraft) => {
    const page = pageMap.get(pageDraft.pageName);
    if (!page) {
      return accumulator;
    }

    accumulator[page.id] = {
      id: uuidv4(),
      pageId: page.id,
      pageName: page.name,
      updatedAt: now,
      status: 'ready',
      elements: pageDraft.modules.map((module) =>
        createWireframeModule(
          {
            name: module.name,
            purpose: module.purpose,
            actions: module.actions,
            priority: module.priority,
            content: buildWireframeModuleSummary(module) || module.content,
            x: module.x,
            y: module.y,
            width: module.width,
            height: module.height,
          },
          appType
        )
      ),
    };

    return accumulator;
  }, {});
};

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPrototypeModuleMeta = (element: WireframeDocument['elements'][number]) => {
  const purpose = String(element.props.purpose || '').trim();
  const priority = String(element.props.priority || '').trim();
  const actions = Array.isArray(element.props.actions)
    ? element.props.actions
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];

  return {
    purpose,
    priority,
    actions,
  };
};

const buildHTMLWireframeModulePrompt = (wireframes: Record<string, WireframeDocument>) =>
  Object.values(wireframes)
    .map((wireframe) => {
      const modules = toWireframeModuleDrafts(wireframe.elements || []);
      const moduleLines = modules
        .map((module, index) =>
          [
            `${index + 1}. ${module.name}`,
            module.purpose ? `purpose: ${module.purpose}` : '',
            module.actions && module.actions.length > 0 ? `actions: ${module.actions.join(' / ')}` : '',
            module.priority ? `priority: ${module.priority}` : '',
            module.content ? `content: ${module.content}` : '',
          ]
            .filter(Boolean)
            .join(' | ')
        )
        .join('\n');

      return `${wireframe.pageName}:\n${moduleLines || '暂无模块'}`;
    })
    .join('\n\n');

const buildPrototypeHTML = (
  page: PageStructureNode,
  wireframe: WireframeDocument | undefined,
  allPages: PageStructureNode[],
  styleProfile: StyleProfile
): HTMLPrototypePage => {
  const preset = getCanvasPreset(styleProfile.appType);
  const palette = styleProfile.palette;
  const modules = wireframe?.elements || [];
  const cssTokensUsed = ['--surface', '--surface-alt', '--accent', '--text', '--muted'];
  const navigation = allPages
    .map(
      (item) =>
        `<a class="nav-link${item.id === page.id ? ' active' : ''}" href="${escapeHTML(`${slugify(item.name)}.html`)}">${escapeHTML(item.name)}</a>`
    )
    .join('');
  const moduleMarkup =
    modules.length > 0
      ? modules
          .map((element) => {
            const label = String(element.props.name || element.props.title || '模块');
            const content = String(element.props.content || element.props.text || '');
            const meta = buildPrototypeModuleMeta(element);
            const actionsMarkup =
              meta.actions.length > 0
                ? `<div class="module-card-actions">${meta.actions
                    .map((action) => `<span class="module-card-action">${escapeHTML(action)}</span>`)
                    .join('')}</div>`
                : '';
            const purposeMarkup = meta.purpose
              ? `<div class="module-card-purpose">${escapeHTML(meta.purpose)}</div>`
              : '';
            const priorityMarkup = meta.priority
              ? `<span class="module-card-priority">${escapeHTML(meta.priority)}</span>`
              : '';

            return `<section class="module-card" style="left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;">
  <div class="module-card-head">
    <span>${escapeHTML(label)}</span>
    ${priorityMarkup}
  </div>
  ${purposeMarkup}
  <div class="module-card-body">${escapeHTML(content || '内容待补充')}</div>
  ${actionsMarkup}
</section>`;
          })
          .join('\n')
      : `<section class="module-card empty" style="left:24px;top:24px;width:${Math.max(320, preset.width - 80)}px;height:120px;">
  <div class="module-card-head">暂无模块</div>
  <div class="module-card-body">请先确认草图后再导出 HTML。</div>
</section>`;

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHTML(page.name)} - HTML Prototype</title>
    <style>
      :root {
        --surface: ${palette[3] || '#ffffff'};
        --surface-alt: ${palette[4] || '#f8fafc'};
        --accent: ${palette[1] || '#2563eb'};
        --accent-soft: ${palette[2] || '#93c5fd'};
        --text: ${palette[0] || '#0f172a'};
        --muted: ${palette[1] || '#475569'};
        --radius: ${styleProfile.radius};
        --heading-font: "${styleProfile.typography.heading}", sans-serif;
        --body-font: "${styleProfile.typography.body}", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: var(--body-font);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent-soft) 28%, transparent), transparent 24%),
          linear-gradient(180deg, var(--surface-alt), var(--surface));
      }
      .shell {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        min-height: 100vh;
      }
      .sidebar {
        padding: 28px 20px;
        background: rgba(255, 255, 255, 0.84);
        border-right: 1px solid rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(18px);
      }
      .sidebar h1 {
        margin: 0 0 10px;
        font: 700 24px/1.1 var(--heading-font);
      }
      .sidebar p {
        margin: 0 0 20px;
        color: color-mix(in srgb, var(--text) 68%, transparent);
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .nav-link {
        display: block;
        padding: 10px 12px;
        border-radius: 14px;
        text-decoration: none;
        color: var(--text);
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(15, 23, 42, 0.06);
      }
      .nav-link.active {
        background: color-mix(in srgb, var(--accent-soft) 34%, white);
        border-color: color-mix(in srgb, var(--accent) 26%, transparent);
      }
      .main {
        padding: 28px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
      }
      .hero h2 {
        margin: 0 0 6px;
        font: 800 30px/1.05 var(--heading-font);
      }
      .hero p {
        margin: 0;
        color: color-mix(in srgb, var(--text) 68%, transparent);
      }
      .hero-chip {
        padding: 8px 12px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent-soft) 32%, white);
        border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
        white-space: nowrap;
      }
      .board {
        position: relative;
        width: ${preset.width}px;
        min-height: ${preset.height}px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: calc(var(--radius) + 6px);
        box-shadow: 0 24px 56px rgba(15, 23, 42, 0.12);
        overflow: hidden;
      }
      .board::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px);
        background-size: 24px 24px;
        pointer-events: none;
      }
      .module-card {
        position: absolute;
        padding: 14px;
        border-radius: var(--radius);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }
      .module-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .module-card-priority {
        padding: 4px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent-soft) 32%, white);
        color: var(--text);
        font-size: 11px;
        line-height: 1;
        text-transform: uppercase;
      }
      .module-card-purpose {
        margin-bottom: 10px;
        color: color-mix(in srgb, var(--text) 82%, transparent);
        font-size: 13px;
        line-height: 1.5;
      }
      .module-card-body {
        color: color-mix(in srgb, var(--text) 68%, transparent);
        font-size: 14px;
        line-height: 1.6;
      }
      .module-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .module-card-action {
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.12);
        color: color-mix(in srgb, var(--text) 80%, transparent);
        font-size: 11px;
        line-height: 1;
      }
      @media (max-width: 1100px) {
        .shell {
          grid-template-columns: 1fr;
        }
        .sidebar {
          border-right: none;
          border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        }
        .board {
          width: 100%;
          min-height: 780px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <h1>${escapeHTML(styleProfile.name)}</h1>
        <p>${escapeHTML(styleProfile.summary)}</p>
        <nav class="nav">${navigation}</nav>
      </aside>
      <main class="main">
        <div class="hero">
          <div>
            <h2>${escapeHTML(page.name)}</h2>
            <p>${escapeHTML(page.metadata.goal || page.description || 'HTML prototype preview')}</p>
          </div>
          <div class="hero-chip">${escapeHTML(styleProfile.direction)}</div>
        </div>
        <div class="board">${moduleMarkup}</div>
      </main>
    </div>
  </body>
</html>`;

  return {
    id: uuidv4(),
    pageId: page.id,
    pageName: page.name,
    path: `${slugify(page.name)}.html`,
    title: page.name,
    html,
    cssTokensUsed,
  };
};

const buildHTMLPrototypeFallback = (
  projectId: string,
  pageStructure: PageStructureNode[],
  wireframes: Record<string, WireframeDocument>,
  styleProfile: StyleProfile
): HTMLPrototypeDoc => {
  const pages = collectDesignPages(pageStructure).map((page) =>
    buildPrototypeHTML(page, wireframes[page.id], collectDesignPages(pageStructure), styleProfile)
  );
  const manifest = JSON.stringify(
    {
      projectId,
      generatedAt: new Date().toISOString(),
      styleProfileId: styleProfile.id,
      pages: pages.map((page) => ({
        pageId: page.pageId,
        pageName: page.pageName,
        path: page.path,
        title: page.title,
        cssTokensUsed: page.cssTokensUsed,
      })),
    },
    null,
    2
  );

  return {
    id: uuidv4(),
    projectId,
    styleProfileId: styleProfile.id,
    summary: `已基于 ${styleProfile.name} 生成 ${pages.length} 个 HTML 原型页面。`,
    pages,
    manifest,
    status: 'ready',
    updatedAt: new Date().toISOString(),
  };
};

const buildHTMLGeneratedFiles = (
  prototype: HTMLPrototypeDoc,
  sourceRequirementId?: string,
  relatedRequirementIds: string[] = []
): GeneratedFile[] => [
  ...prototype.pages.map((page) => ({
    path: `src/generated/prototypes/${page.path}`,
    content: page.html,
    language: 'html' as const,
    category: 'frontend' as const,
    summary: `${page.pageName} HTML 原型`,
    sourceTaskIds: [],
    sourceRequirementId,
    relatedRequirementIds,
    tags: ['design', 'html-prototype'],
    updatedAt: prototype.updatedAt,
  })),
  {
    path: 'src/generated/prototypes/manifest.json',
    content: prototype.manifest,
    language: 'json' as const,
    category: 'design' as const,
    summary: 'HTML prototype manifest',
    sourceTaskIds: [],
    sourceRequirementId,
    relatedRequirementIds,
    tags: ['design', 'manifest'],
    updatedAt: prototype.updatedAt,
  },
];

const flattenFeatureNames = (nodes: FeatureNode[]): string[] =>
  nodes.flatMap((node) => [node.name, ...flattenFeatureNames(node.children)]);

const buildContextPrompt = (
  projectName: string,
  rawInput: string,
  docs: RequirementDoc[]
) => {
  return trimAndJoin(
    `project: ${projectName}`,
    `raw_requirement:\n${rawInput}`,
    docs.length > 0
      ? `existing_requirement_docs:\n${docs
          .map((doc) => `title: ${doc.title}\nsummary: ${doc.summary}\ncontent:\n${doc.content}`)
          .join('\n\n---\n\n')}`
      : undefined
  );
};

const buildSkillSchema = (skill: AISkillName) => {
  switch (skill) {
    case 'requirements_spec_skill':
      return `{"title":"string","summary":"string","sections":[{"title":"string","content":"string"}],"assumptions":["string"]}`;
    case 'feature_tree_skill':
      return `{"summary":"string","nodes":[{"name":"string","description":"string","acceptanceCriteria":["string"],"children":[...]}],"userStories":[{"asA":"string","iWant":"string","soThat":"string","tasks":["string"]}]}`;
    case 'page_structure_skill':
      return `{"summary":"string","pages":[{"name":"string","description":"string","route":"string","goal":"string","template":"workspace|form|list|detail|dashboard|custom","featureNames":["string"],"children":[...]}]}`;
    case 'wireframe_skill':
      return `{"summary":"string","pages":[{"pageName":"string","modules":[{"name":"string","purpose":"string","actions":["string"],"priority":"critical|high|medium|low","content":"string","x":0,"y":0,"width":0,"height":0}]}]}`;
    case 'html_prototype_skill':
      return `{"summary":"string","pages":[{"path":"string","title":"string","html":"string","cssTokensUsed":["string"]}]}`;
    default:
      return '{}';
  }
};

const executeWithAI = async <T>(
  skill: AISkillName,
  prompt: string,
  validator: (value: unknown) => value is T
): Promise<SkillResult<T>> => {
  const rawText = await aiService.completeText({
    prompt,
    systemPrompt: trimAndJoin(SYSTEM_PROMPT, WORKFLOW_PROMPTS[skill], formatSchemaPrompt(buildSkillSchema(skill))),
  });
  const payloadText = extractJSONObject(rawText);
  if (!payloadText) {
    throw new Error('Model did not return JSON');
  }

  const payload = JSON.parse(payloadText) as unknown;
  if (!validator(payload)) {
    throw new Error('Model returned invalid schema');
  }

  return {
    data: payload,
    summary: typeof (payload as { summary?: unknown }).summary === 'string' ? (payload as { summary: string }).summary : '',
    provider: aiService.getConfig().provider,
    model: aiService.getConfig().model,
    usedFallback: false,
    rawText,
  };
};

const createSkillExecution = (skill: AISkillName, stage: AIWorkflowStage): SkillExecution => ({
  id: uuidv4(),
  skill,
  stage,
  status: 'running',
  promptVersion: WORKFLOW_SKILL_VERSION,
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  retries: 0,
  startedAt: new Date().toISOString(),
});

const upsertRunWithSkill = (run: AIWorkflowRun, execution: SkillExecution) => ({
  ...run,
  skillExecutions: [...run.skillExecutions.filter((item) => item.id !== execution.id), execution],
  updatedAt: new Date().toISOString(),
});

const ensureProjectWorkflowState = (projectId: string, appType: StyleProfile['appType']) => {
  const workflowStore = useAIWorkflowStore.getState();
  workflowStore.ensureProjectState(projectId);

  const projectState = workflowStore.projects[projectId];
  if (!projectState || projectState.styleProfiles.length === 0) {
    workflowStore.setStyleProfiles(projectId, createDefaultStyleProfiles(appType));
  }
};

const getSelectedStyleProfile = (projectId: string, appType: StyleProfile['appType']) => {
  ensureProjectWorkflowState(projectId, appType);
  const workflowStore = useAIWorkflowStore.getState();
  const projectState = workflowStore.projects[projectId];
  const profiles = projectState?.styleProfiles?.length ? projectState.styleProfiles : createDefaultStyleProfiles(appType);
  const selected = profiles.find((profile) => profile.id === projectState?.selectedStyleProfileId) || profiles[0];

  return {
    profiles,
    selected,
  };
};

const buildRun = (projectId: string, targetPackage: AIWorkflowPackage, mode: AIExperienceMode, inputSummary: string): AIWorkflowRun => {
  const workflowStore = useAIWorkflowStore.getState();
  const previousRun = workflowStore.projects[projectId]?.runs?.[0];
  const stages = PACKAGE_STAGES[targetPackage];

  return {
    id: uuidv4(),
    projectId,
    targetPackage,
    mode,
    status: 'running',
    currentStage: stages[0] || 'project_brief',
    completedStages: [],
    confirmedStages: previousRun?.confirmedStages || [],
    skillExecutions: [],
    inputSummary,
    stageSummaries: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const canRunTargetPackage = (projectId: string, targetPackage: AIWorkflowPackage) => {
  void projectId;
  void targetPackage;
  return true;
};

export const runAIWorkflowPackage = async (targetPackage: AIWorkflowPackage) => {
  void buildRequirementsFallback;
  void buildFeatureFallback;
  void buildPageStructureFallback;
  void buildWireframeFallback;
  let projectStore = useProjectStore.getState();
  let featureTreeStore = useFeatureTreeStore.getState();
  const workflowStore = useAIWorkflowStore.getState();
  let project = projectStore.currentProject;

  if (!project) {
    throw new Error('Please open a project before running the AI workflow');
  }

  if (!aiService.isConfigured()) {
    throw buildAIConfigurationError();
  }

  if (targetPackage === 'prototype' && !featureTreeStore.tree) {
    await runAIWorkflowPackage('requirements');
    projectStore = useProjectStore.getState();
    featureTreeStore = useFeatureTreeStore.getState();
    project = projectStore.currentProject;
  }

  if (targetPackage === 'page') {
    if (!featureTreeStore.tree) {
      await runAIWorkflowPackage('requirements');
      projectStore = useProjectStore.getState();
      featureTreeStore = useFeatureTreeStore.getState();
      project = projectStore.currentProject;
    }

    if (projectStore.pageStructure.length === 0 || Object.keys(projectStore.wireframes).length === 0) {
      await runAIWorkflowPackage('prototype');
      projectStore = useProjectStore.getState();
      featureTreeStore = useFeatureTreeStore.getState();
      project = projectStore.currentProject;
    }
  }

  if (!project) {
    throw new Error('Please open a project before running the AI workflow');
  }

  ensureProjectWorkflowState(project.id, project.appType);
  const projectWorkflowState = useAIWorkflowStore.getState().projects[project.id] || {
    runs: [],
    styleProfiles: createDefaultStyleProfiles(project.appType),
    selectedStyleProfileId: null,
    executionMode: 'standard' as AIExperienceMode,
    htmlPrototypes: [],
  };
  const mode = projectWorkflowState.executionMode;

  const inputSummary = summarize(projectStore.rawRequirementInput, 180) || `${project.name} workflow run`;
  let run = buildRun(project.id, targetPackage, mode, inputSummary);
  workflowStore.upsertRun(project.id, run);

  const applyRunUpdate = (nextRun: AIWorkflowRun) => {
    run = nextRun;
    workflowStore.upsertRun(project.id, nextRun);
  };

  try {
    if (targetPackage === 'requirements') {
      const requirementsExecution = createSkillExecution('requirements_spec_skill', 'requirements_spec');
      applyRunUpdate(upsertRunWithSkill(run, requirementsExecution));

      const requirementsPrompt = buildContextPrompt(
        project.name,
        projectStore.rawRequirementInput,
        projectStore.requirementDocs
      );
      const requirementsResult = await executeWithAI(
        'requirements_spec_skill',
        requirementsPrompt,
        validateRequirementsSpec
      );

      const aiRequirementDoc: RequirementDoc = {
        id:
          projectStore.requirementDocs.find(
            (doc) => doc.sourceType === 'ai' && doc.title.includes('需求规格说明书')
          )?.id || uuidv4(),
        title: `${project.name} 需求规格说明书.md`,
        content: toRequirementMarkdown(requirementsResult.data),
        summary: requirementsResult.data.summary,
        authorRole: '产品',
        sourceType: 'ai',
        updatedAt: new Date().toISOString(),
        status: 'ready',
      };
      const mergedDocs = [
        ...projectStore.requirementDocs.filter((doc) => !(doc.sourceType === 'ai' && doc.title.includes('需求规格说明书'))),
        aiRequirementDoc,
      ];
      projectStore.replaceRequirementDocs(mergedDocs);

      applyRunUpdate({
        ...run,
        currentStage: 'requirements_spec',
        completedStages: uniqueStrings([...run.completedStages, 'requirements_spec']) as AIWorkflowStage[],
        stageSummaries: {
          ...run.stageSummaries,
          requirements_spec: requirementsResult.data.summary,
        },
        skillExecutions: run.skillExecutions.map((item) =>
          item.id === requirementsExecution.id
            ? {
                ...item,
                status: 'completed',
                provider: requirementsResult.provider,
                model: requirementsResult.model,
                completedAt: new Date().toISOString(),
                summary: requirementsResult.summary || requirementsResult.data.summary,
                outputSnapshot: requirementsResult.data as Record<string, unknown>,
              }
            : item
        ),
        updatedAt: new Date().toISOString(),
      });

      const featureExecution = createSkillExecution('feature_tree_skill', 'feature_tree');
      applyRunUpdate(upsertRunWithSkill(run, featureExecution));

      const featurePrompt = trimAndJoin(
        buildContextPrompt(
          project.name,
          projectStore.rawRequirementInput,
          mergedDocs
        ),
        `requirement_spec_markdown:\n${aiRequirementDoc.content}`
      );
      const featureResult = await executeWithAI('feature_tree_skill', featurePrompt, validateFeatureTree);

      const nextFeatureTree = buildFeatureTree(project.name, featureResult.data);
      featureTreeStore.setTree(nextFeatureTree);
      const syncedFeatureTree = projectStore.generatePlanningArtifacts(nextFeatureTree);
      if (syncedFeatureTree) {
        featureTreeStore.setTree(syncedFeatureTree);
      }

      applyRunUpdate({
        ...run,
        currentStage: 'feature_tree',
        completedStages: uniqueStrings([...run.completedStages, 'feature_tree']) as AIWorkflowStage[],
        stageSummaries: {
          ...run.stageSummaries,
          feature_tree: featureResult.data.summary,
        },
        skillExecutions: run.skillExecutions.map((item) =>
          item.id === featureExecution.id
            ? {
                ...item,
                status: 'completed',
                provider: featureResult.provider,
                model: featureResult.model,
                completedAt: new Date().toISOString(),
                summary: featureResult.summary || featureResult.data.summary,
                outputSnapshot: featureResult.data as Record<string, unknown>,
              }
            : item
        ),
        status: 'awaiting_confirmation',
        updatedAt: new Date().toISOString(),
      });
    }

    if (targetPackage === 'prototype') {
      const currentFeatureTree = featureTreeStore.tree;
      if (!currentFeatureTree) {
        throw new Error('Feature tree is required before generating the prototype package');
      }

      const pageExecution = createSkillExecution('page_structure_skill', 'page_structure');
      applyRunUpdate(upsertRunWithSkill(run, pageExecution));

      const pagePrompt = trimAndJoin(
        buildContextPrompt(
          project.name,
          projectStore.rawRequirementInput,
          projectStore.requirementDocs
        ),
        `feature_tree_nodes:\n${flattenFeatureNames(currentFeatureTree.children).join('\n')}`
      );
      const pageResult = await executeWithAI('page_structure_skill', pagePrompt, validatePageStructure);

      const featureIdMap = new Map(flattenFeatureNames(currentFeatureTree.children).map((name) => [name, '']));
      const featureNodeQueue = [...currentFeatureTree.children];
      while (featureNodeQueue.length > 0) {
        const node = featureNodeQueue.shift();
        if (!node) {
          continue;
        }
        featureIdMap.set(node.name, node.id);
        featureNodeQueue.push(...node.children);
      }

      const nextPageStructure = pageResult.data.pages.map((page) => buildPageNode(page, featureIdMap));
      projectStore.replacePageStructure(nextPageStructure, currentFeatureTree);
      const pageSyncedTree = projectStore.generatePlanningArtifacts(currentFeatureTree);
      if (pageSyncedTree) {
        featureTreeStore.setTree(pageSyncedTree);
      }

      applyRunUpdate({
        ...run,
        currentStage: 'page_structure',
        completedStages: uniqueStrings([...run.completedStages, 'page_structure']) as AIWorkflowStage[],
        stageSummaries: {
          ...run.stageSummaries,
          page_structure: pageResult.data.summary,
        },
        skillExecutions: run.skillExecutions.map((item) =>
          item.id === pageExecution.id
            ? {
                ...item,
                status: 'completed',
                provider: pageResult.provider,
                model: pageResult.model,
                completedAt: new Date().toISOString(),
                summary: pageResult.summary || pageResult.data.summary,
                outputSnapshot: pageResult.data as Record<string, unknown>,
              }
            : item
        ),
        updatedAt: new Date().toISOString(),
      });

      const wireframeExecution = createSkillExecution('wireframe_skill', 'wireframes');
      applyRunUpdate(upsertRunWithSkill(run, wireframeExecution));

      const wireframePrompt = trimAndJoin(
        `app_type: ${project.appType}`,
        'design_goal: 先拆模块，再输出线框；每个模块都要写清职责、内容、关键操作和优先级。',
        `page_context:
${buildWireframePageContext(nextPageStructure, currentFeatureTree)}`
          + `\n\nfeature_names:\n${flattenFeatureNames(currentFeatureTree.children).join('\n')}`,
      );
      const wireframeResult = await executeWithAI('wireframe_skill', wireframePrompt, validateWireframes);

      const nextWireframes = mapWireframesToDocuments(wireframeResult.data, nextPageStructure, project.appType);
      projectStore.replaceWireframes(nextWireframes, featureTreeStore.tree);
      const wireframeSyncedTree = projectStore.generatePlanningArtifacts(featureTreeStore.tree);
      if (wireframeSyncedTree) {
        featureTreeStore.setTree(wireframeSyncedTree);
      }

      applyRunUpdate({
        ...run,
        currentStage: 'wireframes',
        completedStages: uniqueStrings([...run.completedStages, 'wireframes']) as AIWorkflowStage[],
        stageSummaries: {
          ...run.stageSummaries,
          wireframes: wireframeResult.data.summary,
        },
        skillExecutions: run.skillExecutions.map((item) =>
          item.id === wireframeExecution.id
            ? {
                ...item,
                status: 'completed',
                provider: wireframeResult.provider,
                model: wireframeResult.model,
                completedAt: new Date().toISOString(),
                summary: wireframeResult.summary || wireframeResult.data.summary,
                outputSnapshot: wireframeResult.data as Record<string, unknown>,
              }
            : item
        ),
        status: 'awaiting_confirmation',
        updatedAt: new Date().toISOString(),
      });
    }

    if (targetPackage === 'page') {
      const { selected } = getSelectedStyleProfile(project.id, project.appType);
      if (!selected) {
        throw new Error('Please choose a style profile before generating HTML prototypes');
      }

      const htmlExecution = createSkillExecution('html_prototype_skill', 'html_prototype');
      applyRunUpdate(upsertRunWithSkill(run, htmlExecution));

      const htmlPrompt = trimAndJoin(
        buildContextPrompt(
          project.name,
          projectStore.rawRequirementInput,
          projectStore.requirementDocs
        ),
        `style_profile: ${selected.name}`,
        `style_summary: ${selected.summary}`,
        `page_names:\n${collectDesignPages(projectStore.pageStructure).map((page) => page.name).join('\n')}`,
        `wireframe_modules:\n${buildHTMLWireframeModulePrompt(projectStore.wireframes)}`
      );
      const htmlResult = await executeWithAI('html_prototype_skill', htmlPrompt, validateHTMLPrototype);
      const fallbackPrototype = buildHTMLPrototypeFallback(project.id, projectStore.pageStructure, projectStore.wireframes, selected);
      const pages = collectDesignPages(projectStore.pageStructure);
      const knowledgeSelection = buildKnowledgeContextSelection(
        buildKnowledgeEntries(projectStore.requirementDocs, projectStore.generatedFiles),
        projectStore.activeKnowledgeFileId
      );
      const sourceRequirementId =
        knowledgeSelection.currentFile?.source === 'requirement' ? knowledgeSelection.currentFile.id : undefined;
      const relatedRequirementIds = (knowledgeSelection.currentFile?.relatedIds || []).filter((id) =>
        projectStore.requirementDocs.some((doc) => doc.id === id)
      );
      const htmlPrototype = {
        prototype: {
          ...fallbackPrototype,
          summary: htmlResult.data.summary,
          pages: htmlResult.data.pages.map((page, index) => ({
            id: uuidv4(),
            pageId: pages[index]?.id || '',
            pageName: pages[index]?.name || page.title,
            path: page.path,
            title: page.title,
            html: page.html,
            cssTokensUsed: page.cssTokensUsed,
          })),
          manifest: JSON.stringify(
            {
              projectId: project.id,
              generatedAt: new Date().toISOString(),
              styleProfileId: selected.id,
              pages: htmlResult.data.pages.map((page) => ({
                path: page.path,
                title: page.title,
                cssTokensUsed: page.cssTokensUsed,
              })),
            },
            null,
            2
          ),
          updatedAt: new Date().toISOString(),
        },
        result: htmlResult,
      };

      workflowStore.saveHTMLPrototype(project.id, htmlPrototype.prototype);
      projectStore.mergeGeneratedFilesFromAI(
        buildHTMLGeneratedFiles(htmlPrototype.prototype, sourceRequirementId, relatedRequirementIds)
      );

      applyRunUpdate({
        ...run,
        currentStage: 'html_prototype',
        completedStages: uniqueStrings([...run.completedStages, 'html_prototype']) as AIWorkflowStage[],
        stageSummaries: {
          ...run.stageSummaries,
          html_prototype: htmlPrototype.result.data.summary,
        },
        skillExecutions: run.skillExecutions.map((item) =>
          item.id === htmlExecution.id
            ? {
                ...item,
                status: 'completed',
                provider: htmlPrototype.result.provider,
                model: htmlPrototype.result.model,
                completedAt: new Date().toISOString(),
                summary: htmlPrototype.result.summary || htmlPrototype.result.data.summary,
                outputSnapshot: htmlPrototype.result.data as Record<string, unknown>,
              }
            : item
        ),
        status: 'awaiting_confirmation',
        updatedAt: new Date().toISOString(),
      });
    }

    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun: AIWorkflowRun = {
      ...run,
      status: 'error',
      error: message,
      updatedAt: new Date().toISOString(),
    };
    workflowStore.upsertRun(project.id, failedRun);
    throw error;
  }
};
