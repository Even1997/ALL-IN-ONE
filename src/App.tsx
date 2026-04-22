import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AIPanel } from './components/ai/AIPanel';
import { Workspace } from './components/workspace';
import { ProjectSetup } from './components/project/ProjectSetup';
import { ProductWorkbench } from './components/product/ProductWorkbench';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { useGlobalAIStore } from './modules/ai/store/globalAIStore';
import { useProjectStore } from './store/projectStore';
import {
  FeatureNode,
  GeneratedFile,
  PageStructureNode,
} from './types';
import './App.css';

type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations';
type ThemeMode = 'dark' | 'light';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const THEME_PACKS = [
  {
    id: 'clarity-light',
    name: 'Clarity Light',
    tone: '清晰企业风',
    summary: '适合后台、工作台和数据产品，强调高对比层级与信息效率。',
    tokens: ['主色 #0f766e', '字体 14/16 系统 sans', '圆角 12', '间距 8/12/16'],
  },
  {
    id: 'warm-editorial',
    name: 'Warm Editorial',
    tone: '内容产品风',
    summary: '适合文档、需求和协作产品，强调阅读舒适度与内容层次。',
    tokens: ['主色 #9a3412', '字体 衬线标题 + sans 正文', '圆角 16', '间距 12/16/24'],
  },
  {
    id: 'midnight-ops',
    name: 'Midnight Ops',
    tone: '运维控制台风',
    summary: '适合运维、监控和开发者工具，强调状态色和密度控制。',
    tokens: ['主色 #2563eb', '字体 Mono + Sans', '圆角 10', '间距 6/10/14'],
  },
];

const renderGeneratedFileLabel = (file: GeneratedFile) => file.path.split('/').pop() || file.path;

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<RoleView>('product');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const storedTheme = window.localStorage.getItem('devflow-theme-mode');
    return storedTheme === 'light' ? 'light' : 'dark';
  });
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const { isDirty, clearCanvas } = usePreviewStore();
  const { setTree, tree: featureTree, clearTree } = useFeatureTreeStore();
  const { togglePanel, isStreaming } = useGlobalAIStore();
  const {
    currentProject,
    graph,
    memory,
    requirementDocs,
    pageStructure,
    designSystem,
    uiSpecs,
    devTasks,
    generatedFiles,
    testPlan,
    deployPlan,
    createProject,
    clearProject,
    updateProject,
    generateDeliveryArtifacts,
  } = useProjectStore();

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedDesignPage = designPages[0] || null;
  const selectedUISpec = uiSpecs.find((spec) => spec.pageId === selectedDesignPage?.id) || null;
  const designSystemPatterns = designSystem?.componentPatterns ?? [];
  const designPrinciples = designSystem?.principles ?? [];
  const designTokens = designSystem?.tokens ?? {
    color: { label: 'Color', values: [] },
    typography: { label: 'Typography', values: [] },
    spacing: { label: 'Spacing', values: [] },
    radius: { label: 'Radius', values: [] },
  };
  const testCases = testPlan?.cases ?? [];
  const deploySteps = deployPlan?.steps ?? [];
  const recommendedCommands = deployPlan?.commands ?? ['npm run build', 'npm run preview'];

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem('devflow-theme-mode', themeMode);
  }, [themeMode]);

  const handleCreateProject = (input: Parameters<typeof createProject>[0]) => {
    const { featureTree: starterFeatureTree } = createProject(input);
    setTree(starterFeatureTree);
    clearCanvas();
    setSelectedFeature(starterFeatureTree.children[0] || null);
    setCurrentRole('product');
  };

  const handleResetProject = () => {
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

  const renderProductView = () => (
    <ProductWorkbench onFeatureSelect={handleFeatureSelect} />
  );

  const renderDesignView = () => (
    <div className="design-system-view">
      <div className="design-system-header">
        <div>
          <h2>UI 标准与主题包</h2>
          <p>设计页只负责规范 UI 标准，原型绘制和草图调整都留在产品原型页。</p>
        </div>
        <button className="doc-action-btn" onClick={handleGenerateDelivery} type="button">
          刷新 UI 标准
        </button>
      </div>

      <div className="design-system-grid">
        <section className="design-system-panel">
          <div className="design-system-panel-header">
            <strong>推荐主题包</strong>
            <span>{THEME_PACKS.length} 套</span>
          </div>
          <div className="theme-pack-list">
            {THEME_PACKS.map((pack) => {
              const active = currentProject?.uiFramework === pack.name;
              return (
                <button
                  key={pack.id}
                  className={`theme-pack-card ${active ? 'active' : ''}`}
                  onClick={() =>
                    updateProject({
                      uiFramework: pack.name,
                    })
                  }
                  type="button"
                >
                  <div>
                    <strong>{pack.name}</strong>
                    <span>{pack.tone}</span>
                  </div>
                  <p>{pack.summary}</p>
                  <small>{pack.tokens.join(' · ')}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="design-system-panel">
          <div className="design-system-panel-header">
            <strong>当前 UI 标准</strong>
            <span>{currentProject?.uiFramework || '未选择'}</span>
          </div>
          <div className="theme-standard-grid">
            <div className="theme-standard-card">
              <span>设计系统</span>
              <strong>{designSystem?.name || '未生成'}</strong>
              <p>{designSystem?.summary || '先在原型页完善功能和草图后，再生成 UI 标准。'}</p>
            </div>
            <div className="theme-standard-card">
              <span>组件模式</span>
              <strong>{designSystemPatterns.length}</strong>
              <p>来自原型页线稿中的结构化组件模式。</p>
            </div>
            <div className="theme-standard-card">
              <span>页面规格</span>
              <strong>{uiSpecs.length}</strong>
              <p>UI 页面规格是从原型自动推导出来的，不在这里绘制。</p>
            </div>
            <div className="theme-standard-card">
              <span>当前页面</span>
              <strong>{selectedDesignPage?.name || '未选择'}</strong>
              <p>{selectedUISpec?.route || '到原型页中选择具体页面并维护草图。'}</p>
            </div>
          </div>
        </section>

        <section className="design-system-panel">
          <div className="design-system-panel-header">
            <strong>设计原则</strong>
            <span>{designPrinciples.length} 条</span>
          </div>
          <div className="design-principle-list">
            {(designPrinciples.length > 0 ? designPrinciples : ['统一间距系统', '统一组件语义', '统一主题包应用']).map((item) => (
              <div key={item} className="design-principle-card">
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="design-system-panel">
          <div className="design-system-panel-header">
            <strong>Token 摘要</strong>
            <span>由主题包和设计系统共同决定</span>
          </div>
          <div className="theme-token-list">
            <div className="theme-token-card">
              <span>Color</span>
              <p>{designTokens.color.values.join(' · ') || '未生成'}</p>
            </div>
            <div className="theme-token-card">
              <span>Typography</span>
              <p>{designTokens.typography.values.join(' · ') || '未生成'}</p>
            </div>
            <div className="theme-token-card">
              <span>Spacing</span>
              <p>{designTokens.spacing.values.join(' · ') || '未生成'}</p>
            </div>
            <div className="theme-token-card">
              <span>Radius</span>
              <p>{designTokens.radius.values.join(' · ') || '未生成'}</p>
            </div>
          </div>
        </section>
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
          <button className="doc-action-btn" onClick={handleGenerateDelivery}>
            刷新开发产物
          </button>
        </div>
        <div className="delivery-card-grid">
          {devTasks.map((task) => (
            <div key={task.id} className="delivery-card">
              <strong>{task.title}</strong>
              <p>{task.summary}</p>
              <span>{task.owner} · {task.relatedFilePaths.length} files</span>
            </div>
          ))}
        </div>
        <Workspace
          files={generatedFiles}
          tasks={devTasks}
          recommendedCommands={recommendedCommands}
        />
      </div>
    </div>
  );

  const renderTestView = () => (
    <div className="test-view">
      <div className="test-sidebar">
        <div className="test-nav">
          <button className="test-nav-item active">
            <span className="nav-icon">📋</span>
            <span>测试计划</span>
          </button>
          <button className="test-nav-item">
            <span className="nav-icon">🐛</span>
            <span>Bug 追踪</span>
          </button>
          <button className="test-nav-item">
            <span className="nav-icon">📊</span>
            <span>测试报告</span>
          </button>
        </div>
      </div>
      <div className="test-content">
        <div className="test-header">
          <div className="test-stats">
            <div className="stat-card">
              <span className="stat-num">{graph.nodes.filter((node) => node.type === 'feature').length}</span>
              <span className="stat-label">待覆盖功能</span>
            </div>
            <div className="stat-card success">
              <span className="stat-num">{requirementDocs.length}</span>
              <span className="stat-label">需求输入</span>
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
            <button className="test-btn primary" onClick={handleGenerateDelivery}>生成测试计划</button>
            <button className="test-btn">建立 QA 流程</button>
          </div>
        </div>
        <div className="test-cases">
          {testCases.map((testCase) => (
            <div key={testCase.id} className="case-item">
              <div className={`case-status ${testCase.priority === 'high' ? 'pending' : 'passed'}`}></div>
              <div className="case-info">
                <span className="case-name">{testCase.title}</span>
                <span className="case-module">{testCase.module} · {testCase.type}</span>
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
          <button className="ops-nav-item active">
            <span className="nav-icon">🚀</span>
            <span>部署</span>
          </button>
          <button className="ops-nav-item">
            <span className="nav-icon">📦</span>
            <span>构建</span>
          </button>
          <button className="ops-nav-item">
            <span className="nav-icon">📈</span>
            <span>监控</span>
          </button>
          <button className="ops-nav-item">
            <span className="nav-icon">⚙️</span>
            <span>配置</span>
          </button>
        </div>
      </div>
      <div className="ops-content">
        <div className="ops-header">
          <h2>部署中心</h2>
          <div className="ops-actions">
            <button className="ops-btn primary" onClick={handleGenerateDelivery}>生成部署脚本</button>
            <button className="ops-btn success">规划发布流程</button>
          </div>
        </div>
        <div className="deploy-targets">
          <div className="target-card">
            <div className="target-icon">☁️</div>
            <div className="target-info">
              <span className="target-name">{currentProject?.deployment}</span>
              <span className="target-desc">当前项目部署目标</span>
            </div>
            <span className="target-status connected">已配置</span>
          </div>
          <div className="target-card">
            <div className="target-icon">🧠</div>
            <div className="target-info">
              <span className="target-name">Project Memory</span>
              <span className="target-desc">{Object.keys(memory?.techStack || {}).length} 项技术上下文</span>
            </div>
            <span className="target-status connected">已建立</span>
          </div>
        </div>
        <div className="deploy-history">
          <h3>阶段进度</h3>
          <div className="history-list">
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 1</span>
              <span className="history-time">项目创建与上下文</span>
              <span className="history-target">{currentProject?.name}</span>
            </div>
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 2-6</span>
              <span className="history-time">规划 / 设计 / 开发 / 测试 / 部署产物链路</span>
              <span className="history-target">{deployPlan?.target || 'Workspace'}</span>
            </div>
          </div>
        </div>
        {deployPlan && (
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
        )}
        {generatedFiles.length > 0 && (
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
        )}
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
          <button className={`role-tab ${currentRole === 'product' ? 'active' : ''}`} onClick={() => setCurrentRole('product')}>
            <span className="role-icon">📋</span>
            <span className="role-name">产品经理</span>
          </button>
          <button className={`role-tab ${currentRole === 'design' ? 'active' : ''}`} onClick={() => setCurrentRole('design')}>
            <span className="role-icon">🎨</span>
            <span className="role-name">设计</span>
          </button>
          <button className={`role-tab ${currentRole === 'develop' ? 'active' : ''}`} onClick={() => setCurrentRole('develop')}>
            <span className="role-icon">💻</span>
            <span className="role-name">开发</span>
          </button>
          <button className={`role-tab ${currentRole === 'test' ? 'active' : ''}`} onClick={() => setCurrentRole('test')}>
            <span className="role-icon">🧪</span>
            <span className="role-name">测试</span>
          </button>
          <button
            className={`role-tab ${currentRole === 'operations' ? 'active' : ''}`}
            onClick={() => setCurrentRole('operations')}
          >
            <span className="role-icon">🚀</span>
            <span className="role-name">运维</span>
          </button>
        </nav>

        <div className="header-right">
          <label className="header-search">
            <span className="header-search-icon">⌕</span>
            <input placeholder="Search workbench..." type="text" />
          </label>
          <button className="header-icon-btn" type="button" aria-label="通知中心">
            ○
          </button>
          <button className="header-icon-btn" type="button" aria-label="设置">
            ✦
          </button>
          <button
            className="theme-mode-btn"
            type="button"
            onClick={() => setThemeMode((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={themeMode === 'dark' ? '切换到白天主题' : '切换到夜间主题'}
          >
            {themeMode === 'dark' ? '白天' : '夜间'}
          </button>
          <button className={`ai-header-btn ${isStreaming ? 'streaming' : ''}`} onClick={togglePanel} type="button">
            ◎ AI
          </button>
          <span className="status-indicator">{isDirty ? '● 设计变更中' : '✓ 项目上下文已保存'}</span>
          {selectedFeature && <span className="current-feature">当前: {selectedFeature.name}</span>}
          <button className="reset-project-btn" onClick={handleResetProject} type="button">
            重新创建
          </button>
        </div>
      </header>

      <main className="app-main">
        {currentRole === 'product' && renderProductView()}
        {currentRole === 'design' && renderDesignView()}
        {currentRole === 'develop' && renderDevelopView()}
        {currentRole === 'test' && renderTestView()}
        {currentRole === 'operations' && renderOperationsView()}
      </main>

      <AIPanel />
    </div>
  );
};

export default App;
