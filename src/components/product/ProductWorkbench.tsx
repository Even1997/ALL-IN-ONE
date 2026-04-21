import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '../canvas/Canvas';
import { ComponentLibrary } from '../canvas/ComponentLibrary';
import { FeatureTree } from '../feature-tree/FeatureTree';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { CanvasElement, FeatureNode, PageStructureNode } from '../../types';
import { featureTreeToMarkdown, markdownToFeatureTree } from '../../utils/featureTreeToMarkdown';

type ProductTab = 'input' | 'feature' | 'wireframe';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const joinLines = (items?: string[]) => (items || []).join('\n');

const parseLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const buildPromptPreview = (feature: FeatureNode, path: FeatureNode[]) => {
  const hierarchy = path.map((item, index) => `${index + 1}级功能：${item.name}`).join('\n');
  const lines = [
    '请围绕下面这个功能节点继续生成更详细的产品与实现建议：',
    '',
    hierarchy,
    '',
    `当前节点：${feature.name}`,
    `功能描述：${feature.description || '待补充'}`,
    `补充说明：${feature.details?.join(' | ') || '待补充'}`,
    `输入：${feature.inputs?.join(' | ') || '待补充'}`,
    `输出：${feature.outputs?.join(' | ') || '待补充'}`,
    `依赖：${feature.dependencies?.join(' | ') || '待补充'}`,
    `验收标准：${feature.acceptanceCriteria?.join(' | ') || '待补充'}`,
  ];

  return lines.join('\n');
};

interface ProductWorkbenchProps {
  onFeatureSelect?: (node: FeatureNode) => void;
}

export const ProductWorkbench: React.FC<ProductWorkbenchProps> = ({ onFeatureSelect }) => {
  const [activeTab, setActiveTab] = useState<ProductTab>('input');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedPageIdRef = useRef<string | null>(null);
  const lastWireframeSnapshotRef = useRef<string>('[]');
  const skipMarkdownHydrateRef = useRef(false);
  const markdownApplyTimerRef = useRef<number | null>(null);

  const {
    currentProject,
    rawRequirementInput,
    featuresMarkdown,
    wireframesMarkdown,
    requirementDocs,
    pageStructure,
    wireframes,
    prd,
    generatedFiles,
    setRawRequirementInput,
    setFeaturesMarkdown,
    ingestRequirementDoc,
    generateProductArtifactsFromRequirements,
    upsertWireframe,
  } = useProjectStore();

  const {
    tree,
    setTree,
    selectedFeatureId,
    selectFeature,
    updateFeature,
    getFeaturePath,
    getSelectedFeature,
  } = useFeatureTreeStore();

  const { elements, clearCanvas, loadFromCode } = usePreviewStore();

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedPage = designPages.find((page) => page.id === selectedPageId) || designPages[0] || null;
  const currentWireframe = selectedPage ? wireframes[selectedPage.id] : null;
  const planningFiles = generatedFiles.filter((file) => file.path.startsWith('src/generated/planning/'));
  const selectedFeature = getSelectedFeature();
  const selectedFeaturePath = selectedFeatureId ? getFeaturePath(selectedFeatureId) : [];
  const promptPreview = selectedFeature ? buildPromptPreview(selectedFeature, selectedFeaturePath) : '';

  useEffect(() => {
    if (!tree) {
      return;
    }
    skipMarkdownHydrateRef.current = true;
    setFeaturesMarkdown(featureTreeToMarkdown(tree));
  }, [tree, setFeaturesMarkdown]);

  useEffect(() => {
    if (!featuresMarkdown.trim()) {
      return;
    }

    if (skipMarkdownHydrateRef.current) {
      skipMarkdownHydrateRef.current = false;
      return;
    }

    if (markdownApplyTimerRef.current) {
      window.clearTimeout(markdownApplyTimerRef.current);
    }

    markdownApplyTimerRef.current = window.setTimeout(() => {
      const nextTree = markdownToFeatureTree(
        featuresMarkdown,
        currentProject ? `${currentProject.name} 产品规划` : '功能清单'
      );
      setTree(nextTree);
      if (selectedFeatureId) {
        const nextPath = useFeatureTreeStore.getState().getFeaturePath(selectedFeatureId);
        if (nextPath.length === 0 && nextTree.children[0]) {
          selectFeature(nextTree.children[0].id);
          onFeatureSelect?.(nextTree.children[0]);
        }
      }
    }, 500);

    return () => {
      if (markdownApplyTimerRef.current) {
        window.clearTimeout(markdownApplyTimerRef.current);
        markdownApplyTimerRef.current = null;
      }
    };
  }, [currentProject, featuresMarkdown, onFeatureSelect, selectFeature, selectedFeatureId, setTree]);

  useEffect(() => {
    if (designPages.length === 0) {
      setSelectedPageId(null);
      clearCanvas();
      return;
    }

    setSelectedPageId((currentId) =>
      currentId && designPages.some((page) => page.id === currentId) ? currentId : designPages[0].id
    );
  }, [clearCanvas, designPages]);

  useEffect(() => {
    const nextElements = currentWireframe?.elements || [];
    const snapshot = JSON.stringify(nextElements);
    hydratedPageIdRef.current = selectedPage?.id || null;
    lastWireframeSnapshotRef.current = snapshot;
    loadFromCode(nextElements);
  }, [currentWireframe, loadFromCode, selectedPage]);

  useEffect(() => {
    if (!selectedPage || hydratedPageIdRef.current !== selectedPage.id) {
      return;
    }

    const snapshot = JSON.stringify(elements);
    if (snapshot === lastWireframeSnapshotRef.current) {
      return;
    }

    upsertWireframe(
      {
        id: selectedPage.id,
        name: selectedPage.name,
      },
      elements as CanvasElement[]
    );
    lastWireframeSnapshotRef.current = snapshot;
  }, [elements, selectedPage, upsertWireframe]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      const content = await file.text();
      ingestRequirementDoc({
        title: file.name,
        content,
        sourceType: 'upload',
      });
    }
    event.target.value = '';
  };

  const handleGenerate = () => {
    const nextTree = generateProductArtifactsFromRequirements();
    if (nextTree) {
      setTree(nextTree);
      if (nextTree.children[0]) {
        selectFeature(nextTree.children[0].id);
        onFeatureSelect?.(nextTree.children[0]);
      }
      setActiveTab('feature');
    }
  };

  const handleApplyMarkdownNow = () => {
    if (!featuresMarkdown.trim()) {
      return;
    }
    const nextTree = markdownToFeatureTree(
      featuresMarkdown,
      currentProject ? `${currentProject.name} 产品规划` : '功能清单'
    );
    setTree(nextTree);
    if (nextTree.children[0]) {
      selectFeature(nextTree.children[0].id);
      onFeatureSelect?.(nextTree.children[0]);
    }
  };

  const handleAddElement = (type: string) => {
    usePreviewStore.getState().addElement(type, 120, 120);
  };

  return (
    <div className="product-workbench">
      <div className="product-workbench-toolbar">
        <div className="product-workbench-toolbar-main">
          <strong>{currentProject?.name || '产品工作台'}</strong>
          <span>{requirementDocs.length + (rawRequirementInput.trim() ? 1 : 0)} 条需求来源</span>
          <span>{tree?.children.length || 0} 个一级功能</span>
          <span>{designPages.length} 个线稿页面</span>
        </div>
        <div className="product-workbench-actions">
          <button className="doc-action-btn secondary" type="button" onClick={handleUploadClick}>
            上传文档
          </button>
          <button className="doc-action-btn" type="button" onClick={handleGenerate}>
            AI生成规划
          </button>
          <input
            ref={fileInputRef}
            className="product-hidden-input"
            type="file"
            accept=".txt,.md,.markdown,.json"
            multiple
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div className="product-workbench-tabs">
        <button className={activeTab === 'input' ? 'active' : ''} onClick={() => setActiveTab('input')} type="button">
          需求输入
        </button>
        <button className={activeTab === 'feature' ? 'active' : ''} onClick={() => setActiveTab('feature')} type="button">
          功能清单
        </button>
        <button className={activeTab === 'wireframe' ? 'active' : ''} onClick={() => setActiveTab('wireframe')} type="button">
          线稿图
        </button>
      </div>

      {activeTab === 'input' && (
        <div className="product-workbench-grid">
          <section className="product-workbench-panel">
            <div className="product-panel-title">
              <div>
                <h3>需求输入</h3>
                <span>可以粘贴原始需求，也可以让 AI 基于这些内容生成规划产物</span>
              </div>
            </div>
            <textarea
              className="product-textarea"
              value={rawRequirementInput}
              onChange={(event) => setRawRequirementInput(event.target.value)}
              placeholder="例如：用户可以上传需求文档，也可以在 AI 窗口里直接描述需求；系统自动输出树状功能清单和可拖拽线稿图。"
            />
          </section>

          <section className="product-workbench-panel">
            <div className="product-panel-title">
              <div>
                <h3>需求资料池</h3>
                <span>上传文档后会先进入这里，作为后续规划生成的上下文</span>
              </div>
            </div>
            <div className="product-doc-stack">
              {requirementDocs.map((doc) => (
                <article key={doc.id} className="product-doc-card">
                  <div>
                    <strong>{doc.title}</strong>
                    <span>{doc.sourceType || 'manual'}</span>
                  </div>
                  <p>{doc.summary}</p>
                </article>
              ))}
            </div>
            <div className="product-output-section">
              <strong>PRD 摘要</strong>
              {prd ? (
                <div className="prd-section-list">
                  {prd.sections.slice(0, 2).map((section) => (
                    <div key={section.id} className="prd-section-card">
                      <strong>{section.title}</strong>
                      <pre>{section.content}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="product-prd-summary">点击“AI生成规划”后，会自动产出 PRD 和规划文件。</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'feature' && (
        <div className="product-feature-grid">
          <section className="product-workbench-panel">
            <div className="product-panel-title">
              <div>
                <h3>树状功能清单</h3>
                <span>支持无限层级嵌套，功能节点可以持续追加</span>
              </div>
            </div>
            <div className="product-tree-shell">
              <FeatureTree onFeatureSelect={onFeatureSelect} />
            </div>
          </section>

          <section className="product-workbench-panel">
            <div className="product-panel-title">
              <div>
                <h3>节点规格与 Markdown</h3>
                <span>Markdown 会自动回灌到树结构，也会同步记录固定字段</span>
              </div>
              <div className="product-inline-actions">
                <button className="doc-action-btn secondary" type="button" onClick={handleApplyMarkdownNow}>
                  立即识别
                </button>
              </div>
            </div>

            {selectedFeature ? (
              <div className="product-feature-editor">
                <div className="product-feature-meta">
                  <span>层级：{selectedFeaturePath.length || 1} 级</span>
                  <span>{selectedFeaturePath.map((item) => item.name).join(' / ')}</span>
                </div>
                <input
                  className="product-input"
                  value={selectedFeature.name}
                  onChange={(event) => updateFeature(selectedFeature.id, { name: event.target.value })}
                  placeholder="功能名称"
                />
                <textarea
                  className="product-textarea compact"
                  value={selectedFeature.description || ''}
                  onChange={(event) => updateFeature(selectedFeature.id, { description: event.target.value })}
                  placeholder="功能描述：说明这个功能解决什么问题、面向谁、关键价值是什么。"
                />
                <textarea
                  className="product-textarea compact"
                  value={joinLines(selectedFeature.details)}
                  onChange={(event) => updateFeature(selectedFeature.id, { details: parseLines(event.target.value) })}
                  placeholder={'补充说明：\n业务背景\n交互规则\n边界条件'}
                />
                <textarea
                  className="product-textarea compact"
                  value={joinLines(selectedFeature.inputs)}
                  onChange={(event) => updateFeature(selectedFeature.id, { inputs: parseLines(event.target.value) })}
                  placeholder={'输入：\n用户输入什么\n依赖什么上游数据'}
                />
                <textarea
                  className="product-textarea compact"
                  value={joinLines(selectedFeature.outputs)}
                  onChange={(event) => updateFeature(selectedFeature.id, { outputs: parseLines(event.target.value) })}
                  placeholder={'输出：\n页面输出什么\n返回什么结果'}
                />
                <textarea
                  className="product-textarea compact"
                  value={joinLines(selectedFeature.dependencies)}
                  onChange={(event) =>
                    updateFeature(selectedFeature.id, { dependencies: parseLines(event.target.value) })
                  }
                  placeholder={'依赖：\n依赖哪个模块\n依赖哪些接口或组件'}
                />
                <textarea
                  className="product-textarea compact"
                  value={joinLines(selectedFeature.acceptanceCriteria)}
                  onChange={(event) =>
                    updateFeature(selectedFeature.id, { acceptanceCriteria: parseLines(event.target.value) })
                  }
                  placeholder={'验收标准：\n用户完成什么算成功\n边界情况怎么判定'}
                />
                <div className="product-output-section">
                  <strong>AI Prompt 预览</strong>
                  <pre className="product-markdown-preview">{promptPreview}</pre>
                </div>
              </div>
            ) : (
              <div className="empty-state">先在左侧树状功能清单中选择一个节点。</div>
            )}

            <div className="product-output-section">
              <strong>结构化 Markdown</strong>
              <textarea
                className="product-textarea product-textarea-compact"
                value={featuresMarkdown}
                onChange={(event) => setFeaturesMarkdown(event.target.value)}
                placeholder="# 功能清单"
              />
            </div>

            <div className="product-output-section">
              <strong>当前存放的规划文件</strong>
              <pre className="product-markdown-preview">
                {planningFiles.length > 0
                  ? planningFiles.map((file) => file.path).join('\n')
                  : '点击“AI生成规划”后，会生成到 src/generated/planning/*.md'}
              </pre>
            </div>

            <div className="product-output-section">
              <strong>线稿说明 Markdown</strong>
              <pre className="product-markdown-preview">{wireframesMarkdown || '生成后会自动出现线稿说明。'}</pre>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'wireframe' && (
        <div className="product-wireframe-shell">
          <aside className="product-wireframe-pages">
            <div className="product-panel-title">
              <div>
                <h3>页面清单</h3>
                <span>选择一个页面继续调整线稿</span>
              </div>
            </div>
            <div className="product-page-list">
              {designPages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className={`product-page-item ${selectedPage?.id === page.id ? 'active' : ''}`}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <strong>{page.name}</strong>
                  <span>{wireframes[page.id]?.elements.length || 0} 个组件</span>
                  <p>{page.description}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="product-wireframe-canvas">
            <div className="product-panel-title">
              <div>
                <h3>{selectedPage?.name || '线稿图画布'}</h3>
                <span>{selectedPage?.metadata.route || '选择页面后可编辑'}</span>
              </div>
            </div>
            <Canvas />
          </section>

          <aside className="product-wireframe-library">
            <div className="product-panel-title">
              <div>
                <h3>组件库</h3>
                <span>拖拽或点击继续微调 AI 结果</span>
              </div>
            </div>
            <ComponentLibrary onComponentSelect={handleAddElement} />
          </aside>
        </div>
      )}
    </div>
  );
};
