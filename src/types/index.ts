export type FeatureStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type FeaturePriority = 'critical' | 'high' | 'medium' | 'low';
export type ChangeType = 'modify' | 'add' | 'delete' | 'replace';
export type ElementType = 'component' | 'page' | 'api' | 'model' | 'style';
export type AIStreamStatus = 'idle' | 'streaming' | 'completed' | 'error';
export type AppType = 'web' | 'mobile' | 'mini_program' | 'desktop' | 'backend' | 'api';
export type GraphNodeType =
  | 'requirement'
  | 'prd'
  | 'feature'
  | 'page'
  | 'wireframe'
  | 'component'
  | 'api'
  | 'database'
  | 'test'
  | 'deploy';

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  appType: AppType;
  frontendFramework: string;
  backendFramework: string;
  database: string;
  uiFramework: string;
  deployment: string;
  createdAt: string;
  updatedAt: string;
}

export interface GraphNodeBase {
  id: string;
  type: GraphNodeType;
  name: string;
  status?: 'draft' | 'ready' | 'in_progress' | 'done' | 'failed';
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: 'derived_from' | 'contains' | 'implements' | 'tests' | 'deploys' | 'depends_on';
}

export interface ProjectGraph {
  nodes: GraphNodeBase[];
  edges: GraphEdge[];
}

export interface ProjectMemory {
  techStack: Record<string, string>;
  designSystem: Record<string, unknown>;
  codeStructure: Record<string, unknown>;
}

export interface RequirementDoc {
  id: string;
  title: string;
  content: string;
  summary: string;
  filePath?: string;
  authorRole: '产品' | 'UI设计' | '开发' | '测试' | '运维';
  sourceType?: 'manual' | 'upload' | 'ai';
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface PRDSection {
  id: string;
  title: string;
  content: string;
}

export interface ProductPRD {
  id: string;
  title: string;
  summary: string;
  sections: PRDSection[];
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface PageStructureNode {
  id: string;
  name: string;
  kind: 'page' | 'flow' | 'module';
  description: string;
  featureIds: string[];
  metadata: {
    route: string;
    title: string;
    goal: string;
    template: 'dashboard' | 'form' | 'list' | 'detail' | 'workspace' | 'custom';
    ownerRole: '产品' | 'UI设计' | '开发' | '测试' | '运维';
    notes: string;
    status: 'draft' | 'ready';
  };
  children: PageStructureNode[];
}

export interface WireframeDocument {
  id: string;
  pageId: string;
  pageName: string;
  elements: CanvasElement[];
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface DesignTokenGroup {
  label: string;
  values: string[];
}

export interface DesignSystemDoc {
  id: string;
  name: string;
  summary: string;
  principles: string[];
  tokens: {
    color: DesignTokenGroup;
    typography: DesignTokenGroup;
    spacing: DesignTokenGroup;
    radius: DesignTokenGroup;
  };
  componentPatterns: Array<{
    id: string;
    name: string;
    description: string;
    sourcePageIds: string[];
  }>;
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface UISpecDoc {
  id: string;
  pageId: string;
  pageName: string;
  route: string;
  template: PageStructureNode['metadata']['template'];
  sections: string[];
  interactionNotes: string[];
  components: Array<{
    id: string;
    type: string;
    label: string;
    behavior: string;
  }>;
  status: 'draft' | 'ready';
  updatedAt: string;
}

export interface DevTask {
  id: string;
  title: string;
  summary: string;
  owner: 'frontend' | 'backend' | 'qa' | 'devops';
  status: 'draft' | 'ready';
  pageId?: string;
  featureId?: string;
  relatedFilePaths: string[];
  acceptanceCriteria: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: 'tsx' | 'ts' | 'css' | 'json' | 'md' | 'sh' | 'yml' | 'html';
  category: 'design' | 'frontend' | 'backend' | 'test' | 'deploy';
  summary: string;
  sourceTaskIds: string[];
  updatedAt: string;
}

export type AIWorkflowStage =
  | 'project_brief'
  | 'requirements_spec'
  | 'feature_tree'
  | 'page_structure'
  | 'wireframes'
  | 'html_prototype';

export type AIWorkflowPackage = 'requirements' | 'prototype' | 'page';

export type AISkillName =
  | 'requirements_spec_skill'
  | 'feature_tree_skill'
  | 'page_structure_skill'
  | 'wireframe_skill'
  | 'html_prototype_skill';

export type AIExperienceMode = 'standard' | 'high_quality_docs' | 'high_quality_execution';

export interface SkillExecution {
  id: string;
  skill: AISkillName;
  stage: AIWorkflowStage;
  status: 'pending' | 'running' | 'completed' | 'error' | 'fallback';
  promptVersion: string;
  schemaVersion: string;
  provider?: string;
  model?: string;
  retries: number;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  error?: string;
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
}

export interface AIWorkflowRun {
  id: string;
  projectId: string;
  targetPackage: AIWorkflowPackage;
  mode: AIExperienceMode;
  status: 'idle' | 'running' | 'awaiting_confirmation' | 'completed' | 'error';
  currentStage: AIWorkflowStage;
  completedStages: AIWorkflowStage[];
  confirmedStages: AIWorkflowStage[];
  skillExecutions: SkillExecution[];
  inputSummary: string;
  stageSummaries: Partial<Record<AIWorkflowStage, string>>;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  summary: string;
  industry: string;
  direction: string;
  colorMood: string;
  referenceBrand?: string;
  appType: AppType;
  palette: string[];
  typography: {
    heading: string;
    body: string;
  };
  radius: string;
  notes: string[];
  status: 'draft' | 'ready';
  updatedAt: string;
}

export interface HTMLPrototypePage {
  id: string;
  pageId: string;
  pageName: string;
  path: string;
  title: string;
  html: string;
  cssTokensUsed: string[];
}

export interface HTMLPrototypeDoc {
  id: string;
  projectId: string;
  styleProfileId?: string;
  summary: string;
  pages: HTMLPrototypePage[];
  manifest: string;
  status: 'draft' | 'ready';
  updatedAt: string;
}

export interface TestPlanCase {
  id: string;
  title: string;
  type: 'unit' | 'integration' | 'e2e';
  module: string;
  priority: 'high' | 'medium' | 'low';
  steps: string[];
  expected: string;
  status: 'draft' | 'ready';
}

export interface TestPlanDoc {
  id: string;
  summary: string;
  coverage: {
    featureCount: number;
    pageCount: number;
    caseCount: number;
  };
  cases: TestPlanCase[];
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface DeployPlanDoc {
  id: string;
  target: string;
  summary: string;
  environments: string[];
  envVars: string[];
  steps: string[];
  artifacts: string[];
  commands: string[];
  updatedAt: string;
  status: 'draft' | 'ready';
}

export interface CodeFileRef {
  path: string;
  elementCount: number;
  lastModified: Date;
}

export interface FeatureNode {
  id: string;
  name: string;
  description?: string;
  details?: string[];
  inputs?: string[];
  outputs?: string[];
  dependencies?: string[];
  acceptanceCriteria?: string[];
  status: FeatureStatus;
  priority: FeaturePriority;
  progress: number;
  linkedRequirementId?: string;
  linkedPrototypePageIds: string[];
  linkedCodeFiles: CodeFileRef[];
  aiContextId?: string;
  children: FeatureNode[];
}

export interface FeatureTree {
  id: string;
  name: string;
  children: FeatureNode[];
}

export interface ChangeScope {
  target: {
    type: ElementType;
    id: string;
    filePath: string;
  };
  change: {
    type: ChangeType;
    before?: string;
    after: string;
  };
  related: {
    files: string[];
    elements: string[];
  };
  tokenBudget?: number;
}

export interface UserStory {
  id: string;
  asA: string;
  iWant: string;
  soThat: string;
  tasks: string[];
}

export interface Requirement {
  id: string;
  rawText: string;
  parsed: {
    features: FeatureNode[];
    userStories: UserStory[];
    acceptanceCriteria: string[];
  };
  status: 'draft' | 'parsed' | 'approved';
  linkedTreeNodeId?: string;
}

export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  children: string[];
}

export interface PreviewState {
  isDirty: boolean;
  pendingChanges: CanvasElement[];
  selectedElementId: string | null;
}

export interface AIStreamChunk {
  type: 'text' | 'code' | 'progress' | 'error' | 'artifact';
  content: string;
  timestamp: number;
}

export interface MiniContext {
  requestId: string;
  scope: ChangeScope;
}

export interface ModuleMessage {
  id: string;
  type: string;
  source: string;
  target: string;
  payload: Record<string, unknown>;
}
