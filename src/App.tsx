import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FeatureTree } from './components/feature-tree/FeatureTree';
import { Canvas } from './components/canvas/Canvas';
import { ComponentLibrary } from './components/canvas/ComponentLibrary';
import { AIPanel } from './components/ai/AIPanel';
import { Workspace } from './components/workspace';
import { ProjectSetup } from './components/project/ProjectSetup';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { useGlobalAIStore } from './modules/ai/store/globalAIStore';
import { useProjectStore } from './store/projectStore';
import {
  CanvasElement,
  FeatureNode,
  GeneratedFile,
  PageStructureNode,
  RequirementDoc,
} from './types';
import './App.css';

type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const renderPageTree = (nodes: PageStructureNode[], depth = 0): React.ReactNode =>
  nodes.map((node) => (
    <div key={node.id} className="page-structure-node" style={{ paddingLeft: `${depth * 18}px` }}>
      <div className="page-structure-row">
        <div>
          <strong>{node.name}</strong>
          <span>{node.kind}</span>
        </div>
        <p>{node.description}</p>
      </div>
      {node.children.length > 0 && renderPageTree(node.children, depth + 1)}
    </div>
  ));

const PAGE_TEMPLATE_OPTIONS: Array<PageStructureNode['metadata']['template']> = [
  'dashboard',
  'form',
  'list',
  'detail',
  'workspace',
  'custom',
];

const PAGE_OWNER_OPTIONS: Array<PageStructureNode['metadata']['ownerRole']> = ['产品经理', 'UI设计', '开发', '测试', '运维'];

const renderGeneratedFileLabel = (file: GeneratedFile) => file.path.split('/').pop() || file.path;

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<RoleView>('product');
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [selectedDesignPageId, setSelectedDesignPageId] = useState<string | null>(null);
  const { isDirty, selectedElementId, elements, clearCanvas, loadFromCode, updateElement, deleteElement } = usePreviewStore();
  const { setTree, tree: featureTree, clearTree, getAllFeatures } = useFeatureTreeStore();
  const { togglePanel, isStreaming } = useGlobalAIStore();
  const {
    currentProject,
    graph,
    memory,
    rawRequirementInput,
    requirementDocs,
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
    clearProject,
    setRawRequirementInput,
    updateRequirementDoc,
    addRequirementDoc,
    generatePlanningArtifacts,
    upsertWireframe,
    updatePageStructureNode,
    generateDeliveryArtifacts,
  } = useProjectStore();

  const allFeatures = getAllFeatures();
  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedDesignPage = designPages.find((page) => page.id === selectedDesignPageId) || designPages[0] || null;
  const currentWireframe = selectedDesignPage ? wireframes[selectedDesignPage.id] : null;
  const selectedCanvasElement = elements.find((element) => element.id === selectedElementId) || null;
  const selectedRequirement =
    requirementDocs.find((doc) => doc.id === selectedRequirementId) || requirementDocs[0] || null;
  const selectedUISpec = uiSpecs.find((spec) => spec.pageId === selectedDesignPage?.id) || null;
  const hydratedPageIdRef = useRef<string | null>(null);
  const lastWireframeSnapshotRef = useRef<string>('[]');

  const graphSummary = useMemo(
    () => ({
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    }),
    [graph.edges.length, graph.nodes.length]
  );

  const handleCreateProject = (input: Parameters<typeof createProject>[0]) => {
    const { featureTree: starterFeatureTree } = createProject(input);
    setTree(starterFeatureTree);
    clearCanvas();
    setSelectedFeature(starterFeatureTree.children[0] || null);
    setSelectedRequirementId(null);
    setSelectedDesignPageId(null);
    setCurrentRole('product');
  };

  const handleResetProject = () => {
    clearProject();
    clearTree();
    clearCanvas();
    setSelectedFeature(null);
    setSelectedRequirementId(null);
    setSelectedDesignPageId(null);
    setCurrentRole('product');
  };

  const handleFeatureSelect = (node: FeatureNode) => {
    setSelectedFeature(node);
    setCurrentRole('design');
  };

  const handleAddElement = (type: string) => {
    usePreviewStore.getState().addElement(type, 100, 100);
  };

  useEffect(() => {
    if (designPages.length === 0) {
      setSelectedDesignPageId(null);
      return;
    }

    setSelectedDesignPageId((currentPageId) =>
      currentPageId && designPages.some((page) => page.id === currentPageId) ? currentPageId : designPages[0].id
    );
  }, [designPages]);

  useEffect(() => {
    const nextElements = currentWireframe?.elements || [];
    const snapshot = JSON.stringify(nextElements);

    hydratedPageIdRef.current = selectedDesignPage?.id || null;
    lastWireframeSnapshotRef.current = snapshot;
    loadFromCode(nextElements);
  }, [currentWireframe, loadFromCode, selectedDesignPage]);

  useEffect(() => {
    if (!selectedDesignPage || hydratedPageIdRef.current !== selectedDesignPage.id) {
      return;
    }

    const snapshot = JSON.stringify(elements);
    if (snapshot === lastWireframeSnapshotRef.current) {
      return;
    }

    upsertWireframe(
      {
        id: selectedDesignPage.id,
        name: selectedDesignPage.name,
      },
      elements as CanvasElement[]
    );
    lastWireframeSnapshotRef.current = snapshot;
  }, [elements, selectedDesignPage, upsertWireframe]);

  const handleGeneratePlanning = () => {
    const nextTree = generatePlanningArtifacts(featureTree);
    if (nextTree) {
      setTree(nextTree);
    }
  };

  const handleGenerateDelivery = () => {
    generateDeliveryArtifacts(featureTree);
  };

  const renderRequirementDoc = (doc: RequirementDoc) => (
    <button
      key={doc.id}
      className={`doc-item product-doc-button ${selectedRequirement?.id === doc.id ? 'active' : ''}`}
      onClick={() => setSelectedRequirementId(doc.id)}
      type="button"
    >
      <span className="doc-icon">📄</span>
      <div className="doc-info">
        <span className="doc-title">{doc.title}</span>
        <span className="doc-meta">
          {formatDate(doc.updatedAt)} · {doc.authorRole}
        </span>
      </div>
    </button>
  );

  const renderProductView = () => (
    <div className="product-view">
      <div className="product-sidebar">
        <FeatureTree onFeatureSelect={handleFeatureSelect} />
      </div>
      <div className="product-content product-content-stage-two">
        <div className="requirements-doc">
          <div className="doc-header">
            <div>
              <h2>需求输入</h2>
              <div className="section-meta">第二阶段：需求 → PRD → Page Structure</div>
            </div>
            <div className="header-actions">
              <button className="doc-action-btn secondary" onClick={addRequirementDoc}>
                + 条目
              </button>
              <button className="doc-action-btn" onClick={handleGeneratePlanning}>
                生成规划产物
              </button>
            </div>
          </div>
          <div className="product-stage-grid">
            <div className="product-panel">
              <div className="product-panel-header">
                <h3>原始需求</h3>
                <span>Raw Input</span>
              </div>
              <textarea
                className="product-textarea"
                value={rawRequirementInput}
                onChange={(e) => setRawRequirementInput(e.target.value)}
                placeholder="在这里记录项目目标、用户、流程、约束和 MVP 范围。"
              />
            </div>

            <div className="product-panel">
              <div className="product-panel-header">
                <h3>需求条目</h3>
                <span>{requirementDocs.length} 条</span>
              </div>
              <div className="product-doc-list">{requirementDocs.map(renderRequirementDoc)}</div>
              {selectedRequirement && (
                <div className="requirement-editor">
                  <input
                    className="product-input"
                    value={selectedRequirement.title}
                    onChange={(e) =>
                      updateRequirementDoc(selectedRequirement.id, {
                        title: e.target.value,
                      })
                    }
                  />
                  <textarea
                    className="product-textarea compact"
                    value={selectedRequirement.summary}
                    onChange={(e) =>
                      updateRequirementDoc(selectedRequirement.id, {
                        summary: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="product-preview product-planning-preview">
          <div className="preview-header">
            <h3>规划产物</h3>
            <div className="preview-actions">
              <button>PRD</button>
              <button>Page Structure</button>
              <button>Graph</button>
              <button onClick={handleGenerateDelivery}>交付产物</button>
            </div>
          </div>
          <div className="preview-content planning-preview-content">
            <div className="graph-summary-card">
              <strong>{currentProject?.name}</strong>
              <span>
                {currentProject?.appType} / {currentProject?.frontendFramework} / {currentProject?.backendFramework}
              </span>
            </div>

            <div className="graph-metrics">
              <div className="graph-metric">
                <span>Graph Nodes</span>
                <strong>{graphSummary.nodeCount}</strong>
              </div>
              <div className="graph-metric">
                <span>Graph Edges</span>
                <strong>{graphSummary.edgeCount}</strong>
              </div>
              <div className="graph-metric">
                <span>Feature Count</span>
                <strong>{allFeatures.length}</strong>
              </div>
              <div className="graph-metric">
                <span>Generated Files</span>
                <strong>{generatedFiles.length}</strong>
              </div>
            </div>

            <div className="product-output-section">
              <div className="product-panel-header">
                <h3>{prd?.title || 'PRD'}</h3>
                <span>{prd?.status || 'draft'}</span>
              </div>
              <p className="product-prd-summary">{prd?.summary || '点击“生成规划产物”后会生成 PRD。'}</p>
              <div className="prd-section-list">
                {prd?.sections.map((section) => (
                  <div key={section.id} className="prd-section-card">
                    <strong>{section.title}</strong>
                    <pre>{section.content}</pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="product-output-section">
              <div className="product-panel-header">
                <h3>Page Structure</h3>
                <span>{pageStructure.length} 个根节点</span>
              </div>
              <div className="page-structure-list">
                {pageStructure.length > 0 ? (
                  renderPageTree(pageStructure)
                ) : (
                  <div className="empty-state">生成 PRD 后，这里会同步页面结构。</div>
                )}
              </div>
            </div>

            <div className="product-output-section">
              <div className="product-panel-header">
                <h3>Wireframe Registry</h3>
                <span>{designPages.length} 个页面</span>
              </div>
              <div className="wireframe-registry-list">
                {designPages.length > 0 ? (
                  designPages.map((page) => {
                    const wireframe = wireframes[page.id];

                    return (
                      <div key={page.id} className="wireframe-registry-card">
                        <div>
                          <strong>{page.name}</strong>
                          <span>{wireframe?.status || 'draft'}</span>
                        </div>
                        <p>
                          {wireframe?.elements.length || 0} 个组件 · 最近更新{' '}
                          {wireframe ? formatDate(wireframe.updatedAt) : '--'}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">生成 Page Structure 后，这里会建立页面级 wireframe 档案。</div>
                )}
              </div>
            </div>

            <div className="product-output-section">
              <div className="product-panel-header">
                <h3>Delivery Overview</h3>
                <span>Phase 4-6</span>
              </div>
              <div className="graph-metrics">
                <div className="graph-metric">
                  <span>UI Spec</span>
                  <strong>{uiSpecs.length}</strong>
                </div>
                <div className="graph-metric">
                  <span>Dev Tasks</span>
                  <strong>{devTasks.length}</strong>
                </div>
                <div className="graph-metric">
                  <span>Test Cases</span>
                  <strong>{testPlan?.coverage.caseCount || 0}</strong>
                </div>
                <div className="graph-metric">
                  <span>Deploy Steps</span>
                  <strong>{deployPlan?.steps.length || 0}</strong>
                </div>
              </div>
            </div>

            <div className="preview-note">
              {selectedFeature ? (
                <span>
                  当前聚焦功能：{selectedFeature.name} · 已关联页面 {selectedFeature.linkedPrototypePageIds.length} 个
                </span>
              ) : (
                <span>需求和页面结构生成后，左侧功能节点会自动带上页面关联信息。</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDesignView = () => (
    <div className="design-view">
      <div className="design-sidebar">
        <div className="design-page-panel">
          <div className="design-page-panel-header">
            <div>
              <strong>页面 Wireframe</strong>
              <span>{designPages.length} 个页面</span>
            </div>
            <button className="mini-action-btn" onClick={handleGenerateDelivery} type="button">
              生成 Spec
            </button>
          </div>
          <div className="design-page-list">
            {designPages.length > 0 ? (
              designPages.map((page) => {
                const pageWireframe = wireframes[page.id];
                const isActive = selectedDesignPage?.id === page.id;

                return (
                  <button
                    key={page.id}
                    className={`design-page-card ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedDesignPageId(page.id)}
                    type="button"
                  >
                    <div>
                      <strong>{page.name}</strong>
                      <span>{pageWireframe?.status || 'draft'}</span>
                    </div>
                    <p>{page.description}</p>
                    <small>{pageWireframe?.elements.length || 0} 个组件</small>
                  </button>
                );
              })
            ) : (
              <div className="empty-state design-empty-state">先在产品工作区生成页面结构，再进入设计阶段。</div>
            )}
          </div>
        </div>
        <div className="design-tabs">
          <button className="design-tab active">组件</button>
        </div>
        <ComponentLibrary onComponentSelect={handleAddElement} />
      </div>
      <div className="design-canvas">
        <Canvas />
      </div>
      <div className="design-properties">
        <div className="properties-header">
          <h3>属性</h3>
        </div>
        <div className="properties-content">
          <div className="property-group">
            <label>当前页面</label>
            <input
              type="text"
              value={selectedDesignPage?.name || '未选择'}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  name: e.target.value,
                })
              }
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>页面标题</label>
            <input
              type="text"
              value={selectedDesignPage?.metadata?.title || ''}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    title: e.target.value,
                  },
                })
              }
              placeholder="页面标题"
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>页面路由</label>
            <input
              type="text"
              value={selectedDesignPage?.metadata?.route || ''}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    route: e.target.value,
                  },
                })
              }
              placeholder="/design/page"
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>页面目标</label>
            <textarea
              className="property-textarea"
              value={selectedDesignPage?.metadata?.goal || ''}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    goal: e.target.value,
                  },
                })
              }
              placeholder="这页要解决什么问题"
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>页面描述</label>
            <textarea
              className="property-textarea"
              value={selectedDesignPage?.description || ''}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  description: e.target.value,
                })
              }
              placeholder="描述页面结构和职责"
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>页面模板</label>
            <select
              value={selectedDesignPage?.metadata?.template || 'workspace'}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    template: e.target.value as PageStructureNode['metadata']['template'],
                  },
                })
              }
              disabled={!selectedDesignPage}
            >
              {PAGE_TEMPLATE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="property-group">
            <label>负责人角色</label>
            <select
              value={selectedDesignPage?.metadata?.ownerRole || 'UI设计'}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    ownerRole: e.target.value as PageStructureNode['metadata']['ownerRole'],
                  },
                })
              }
              disabled={!selectedDesignPage}
            >
              {PAGE_OWNER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="property-group">
            <label>页面备注</label>
            <textarea
              className="property-textarea"
              value={selectedDesignPage?.metadata?.notes || ''}
              onChange={(e) =>
                selectedDesignPage &&
                updatePageStructureNode(selectedDesignPage.id, {
                  metadata: {
                    notes: e.target.value,
                  },
                })
              }
              placeholder="记录交互约束、布局想法或设计说明"
              readOnly={!selectedDesignPage}
            />
          </div>
          <div className="property-group">
            <label>关联功能</label>
            <input type="text" value={selectedFeature?.name || '未选择'} readOnly />
          </div>
          <div className="property-group">
            <label>Wireframe 状态</label>
            <input
              type="text"
              value={
                selectedDesignPage
                  ? `${currentWireframe?.status || 'draft'} / ${currentWireframe?.elements.length || 0} 个组件`
                  : '未选择'
              }
              readOnly
            />
          </div>
          <div className="property-group">
            <label>UI Spec</label>
            <input
              type="text"
              value={
                selectedUISpec
                  ? `${selectedUISpec.components.length} 个组件 / ${selectedUISpec.sections.length} 个区块`
                  : '未生成'
              }
              readOnly
            />
          </div>
          <div className="property-group">
            <label>当前元素</label>
            <input
              type="text"
              value={
                selectedCanvasElement ? `${selectedCanvasElement.type} · ${selectedCanvasElement.id.slice(0, 8)}` : '未选择'
              }
              readOnly
            />
          </div>
          {selectedCanvasElement && (
            <>
              <div className="property-grid">
                <div className="property-group">
                  <label>X</label>
                  <input
                    type="number"
                    value={selectedCanvasElement.x}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        x: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="property-group">
                  <label>Y</label>
                  <input
                    type="number"
                    value={selectedCanvasElement.y}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        y: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="property-grid">
                <div className="property-group">
                  <label>宽度</label>
                  <input
                    type="number"
                    value={selectedCanvasElement.width}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        width: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="property-group">
                  <label>高度</label>
                  <input
                    type="number"
                    value={selectedCanvasElement.height}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        height: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              {'text' in selectedCanvasElement.props && (
                <div className="property-group">
                  <label>文本</label>
                  <input
                    type="text"
                    value={String(selectedCanvasElement.props.text || '')}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        props: {
                          ...selectedCanvasElement.props,
                          text: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}
              {'placeholder' in selectedCanvasElement.props && (
                <div className="property-group">
                  <label>占位文案</label>
                  <input
                    type="text"
                    value={String(selectedCanvasElement.props.placeholder || '')}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        props: {
                          ...selectedCanvasElement.props,
                          placeholder: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}
              {'title' in selectedCanvasElement.props && (
                <div className="property-group">
                  <label>标题</label>
                  <input
                    type="text"
                    value={String(selectedCanvasElement.props.title || '')}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        props: {
                          ...selectedCanvasElement.props,
                          title: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}
              {'content' in selectedCanvasElement.props && (
                <div className="property-group">
                  <label>内容</label>
                  <textarea
                    className="property-textarea"
                    value={String(selectedCanvasElement.props.content || '')}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        props: {
                          ...selectedCanvasElement.props,
                          content: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}
              {'fontSize' in selectedCanvasElement.props && (
                <div className="property-group">
                  <label>字号</label>
                  <input
                    type="number"
                    value={Number(selectedCanvasElement.props.fontSize) || 16}
                    onChange={(e) =>
                      updateElement(selectedCanvasElement.id, {
                        props: {
                          ...selectedCanvasElement.props,
                          fontSize: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
              <div className="property-group">
                <label>组件语义</label>
                <input type="text" value={selectedCanvasElement.type} readOnly />
              </div>
              <button
                className="property-danger-btn"
                onClick={() => deleteElement(selectedCanvasElement.id)}
                type="button"
              >
                删除当前组件
              </button>
            </>
          )}
          <div className="property-group">
            <label>UI 框架</label>
            <input type="text" value={currentProject?.uiFramework || ''} readOnly />
          </div>
          <div className="property-group">
            <label>项目状态</label>
            <div className="color-picker">
              <span className="color-swatch" style={{ background: isDirty ? '#ff9500' : '#30d158' }}></span>
              <span>{isDirty ? '有待确认变更' : '已同步到工作区上下文'}</span>
            </div>
          </div>
          {selectedUISpec && (
            <div className="property-card-list">
              {designSystem && (
                <div className="property-card">
                  <strong>Design System</strong>
                  <ul>
                    <li>{designSystem.componentPatterns.length} 个组件模式</li>
                    <li>{designSystem.principles[0]}</li>
                  </ul>
                </div>
              )}
              <div className="property-card">
                <strong>Page Sections</strong>
                <ul>
                  {selectedUISpec.sections.map((section) => (
                    <li key={section}>{section}</li>
                  ))}
                </ul>
              </div>
              <div className="property-card">
                <strong>Interaction Notes</strong>
                <ul>
                  {selectedUISpec.interactionNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
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
          recommendedCommands={deployPlan?.commands || ['npm run build', 'npm run preview']}
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
          {testPlan?.cases.map((testCase) => (
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
              {deployPlan.steps.map((step, index) => (
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
          <h1 className="app-title">{currentProject.name}</h1>
          <span className="app-subtitle">
            {currentProject.appType} · {currentProject.frontendFramework} · {currentProject.backendFramework}
          </span>
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
          <button className={`ai-header-btn ${isStreaming ? 'streaming' : ''}`} onClick={togglePanel}>
            ◎ AI
          </button>
          <span className="status-indicator">{isDirty ? '● 设计变更中' : '✓ 项目上下文已保存'}</span>
          {selectedFeature && <span className="current-feature">当前: {selectedFeature.name}</span>}
          <button className="reset-project-btn" onClick={handleResetProject}>
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
