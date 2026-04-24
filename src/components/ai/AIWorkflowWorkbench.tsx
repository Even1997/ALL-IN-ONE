import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../store/projectStore';
import { useAIWorkflowStore } from '../../modules/ai/store/workflowStore';
import {
  canRunTargetPackage,
  createDefaultStyleProfiles,
  runAIWorkflowPackage,
} from '../../modules/ai/workflow/AIWorkflowService';
import type {
  AIExperienceMode,
  AIWorkflowPackage,
  AIWorkflowStage,
  HTMLPrototypePage,
} from '../../types';
import './AIWorkflowWorkbench.css';

const PACKAGE_OPTIONS: Array<{ id: AIWorkflowPackage; label: string; description: string }> = [
  { id: 'requirements', label: '需求包', description: '生成需求规格说明书和功能清单' },
  { id: 'prototype', label: '原型包', description: '生成页面结构和页面草图' },
  { id: 'page', label: '页面包', description: '基于草图和风格生成 HTML 原型' },
];

const MODE_OPTIONS: Array<{ id: AIExperienceMode; label: string; description: string }> = [
  { id: 'standard', label: '标准', description: '平衡速度和结构稳定性' },
  { id: 'high_quality_docs', label: '高质量文档', description: '更强调需求整理和文档表达' },
  { id: 'high_quality_execution', label: '高质量执行', description: '更强调原型生成和执行结果' },
];

const STAGE_LABELS: Record<AIWorkflowStage, string> = {
  project_brief: '项目简报',
  requirements_spec: '需求规格说明书',
  feature_tree: '功能清单',
  page_structure: '页面结构',
  wireframes: '页面草图',
  html_prototype: 'HTML 原型',
};

const STAGE_ORDER: AIWorkflowStage[] = [
  'requirements_spec',
  'feature_tree',
  'page_structure',
  'wireframes',
  'html_prototype',
];

const collectDesignPages = (nodes: ReturnType<typeof useProjectStore.getState>['pageStructure']): typeof nodes =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const downloadText = (filename: string, content: string, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

interface AIWorkflowWorkbenchProps {
  promptPlacement?: 'inline' | 'external';
  showRunActions?: boolean;
  targetPackage?: AIWorkflowPackage;
  onTargetPackageChange?: (targetPackage: AIWorkflowPackage) => void;
  isRunning?: boolean;
  error?: string | null;
  onRun?: () => Promise<void> | void;
}

export const AIWorkflowWorkbench: React.FC<AIWorkflowWorkbenchProps> = ({
  promptPlacement = 'inline',
  showRunActions = true,
  targetPackage: controlledTargetPackage,
  onTargetPackageChange,
  isRunning: controlledIsRunning,
  error: controlledError,
  onRun,
}) => {
  const {
    currentProject,
    rawRequirementInput,
    requirementDocs,
    pageStructure,
    wireframes,
    setRawRequirementInput,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    rawRequirementInput: state.rawRequirementInput,
    requirementDocs: state.requirementDocs,
    pageStructure: state.pageStructure,
    wireframes: state.wireframes,
    setRawRequirementInput: state.setRawRequirementInput,
  })));
  const {
    projects,
    ensureProjectState,
    setExecutionMode,
    setStyleProfiles,
    selectStyleProfile,
    confirmStage,
  } = useAIWorkflowStore(useShallow((state) => ({
    projects: state.projects,
    ensureProjectState: state.ensureProjectState,
    setExecutionMode: state.setExecutionMode,
    setStyleProfiles: state.setStyleProfiles,
    selectStyleProfile: state.selectStyleProfile,
    confirmStage: state.confirmStage,
  })));
  const [internalTargetPackage, setInternalTargetPackage] = useState<AIWorkflowPackage>('requirements');
  const [internalIsRunning, setInternalIsRunning] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [selectedPreviewPageId, setSelectedPreviewPageId] = useState<string | null>(null);

  const targetPackage = controlledTargetPackage ?? internalTargetPackage;
  const setTargetPackage = onTargetPackageChange ?? setInternalTargetPackage;
  const isRunning = typeof controlledIsRunning === 'boolean' ? controlledIsRunning : internalIsRunning;
  const error = typeof controlledError !== 'undefined' ? controlledError : internalError;

  const projectWorkflowState = currentProject ? projects[currentProject.id] : undefined;
  const latestRun = projectWorkflowState?.runs[0] || null;
  const styleProfiles = projectWorkflowState?.styleProfiles || [];
  const selectedStyleProfile =
    styleProfiles.find((profile) => profile.id === projectWorkflowState?.selectedStyleProfileId) || styleProfiles[0] || null;
  const latestPrototype = projectWorkflowState?.htmlPrototypes[0] || null;
  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const stageSummary = latestRun?.stageSummaries || {};
  const completedStages = new Set(latestRun?.completedStages || []);
  const confirmedStages = new Set(latestRun?.confirmedStages || []);
  const hasProjectWorkflowState = Boolean(projectWorkflowState);
  const hasStyleProfiles = (projectWorkflowState?.styleProfiles.length || 0) > 0;
  const selectedPreviewPage =
    latestPrototype?.pages.find((page) => page.id === selectedPreviewPageId) || latestPrototype?.pages[0] || null;

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    if (!hasProjectWorkflowState) {
      ensureProjectState(currentProject.id);
    }

    if (!hasStyleProfiles) {
      setStyleProfiles(currentProject.id, createDefaultStyleProfiles(currentProject.appType));
    }
  }, [
    currentProject,
    hasProjectWorkflowState,
    hasStyleProfiles,
    ensureProjectState,
    setStyleProfiles,
  ]);

  useEffect(() => {
    if (latestPrototype?.pages.length) {
      setSelectedPreviewPageId((current) =>
        current && latestPrototype.pages.some((page) => page.id === current) ? current : latestPrototype.pages[0].id
      );
    } else {
      setSelectedPreviewPageId(null);
    }
  }, [latestPrototype]);

  if (!currentProject) {
    return null;
  }

  const runDisabled =
    isRunning ||
    !rawRequirementInput.trim() ||
    !canRunTargetPackage(currentProject.id, targetPackage) ||
    (targetPackage === 'page' && !selectedStyleProfile);
  const pendingConfirmations = STAGE_ORDER.filter(
    (stage) => completedStages.has(stage) && !confirmedStages.has(stage)
  );

  const handleRun = async () => {
    if (onRun) {
      await onRun();
      return;
    }

    setInternalIsRunning(true);
    setInternalError(null);
    try {
      await runAIWorkflowPackage(targetPackage);
    } catch (runError) {
      setInternalError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setInternalIsRunning(false);
    }
  };

  const handleConfirmStage = (stage: AIWorkflowStage) => {
    if (!latestRun) {
      return;
    }

    confirmStage(currentProject.id, latestRun.id, stage);
  };

  const previewMetrics = {
    requirements: requirementDocs.length,
    pages: designPages.length,
    wireframes: Object.keys(wireframes).length,
    prototypes: latestPrototype?.pages.length || 0,
  };

  return (
    <section className="pm-card ai-workflow-card">
      <div className="ai-workflow-hero">
        <div>
          <div className="ai-workflow-eyebrow">AI Workflow</div>
          <h3>产品经理 AI 工作流</h3>
          <span>把自然语言需求推进到文档、功能树、草图和 HTML 原型，并在阶段边界等待确认。</span>
        </div>
        <div className="ai-workflow-stats">
          <div>
            <strong>{previewMetrics.requirements}</strong>
            <span>文档</span>
          </div>
          <div>
            <strong>{previewMetrics.pages}</strong>
            <span>页面</span>
          </div>
          <div>
            <strong>{previewMetrics.wireframes}</strong>
            <span>草图</span>
          </div>
          <div>
            <strong>{previewMetrics.prototypes}</strong>
            <span>HTML</span>
          </div>
        </div>
      </div>

      <div className="ai-workflow-grid">
        <div className="ai-workflow-main">
          {promptPlacement === 'inline' ? (
            <label className="ai-workflow-field">
              <span>项目目标 / 需求输入</span>
              <textarea
                value={rawRequirementInput}
                onChange={(event) => setRawRequirementInput(event.target.value)}
                placeholder="例如：用户先创建项目，然后直接告诉 AI 自己要做什么产品，由 AI 自动生成需求规格说明书、功能清单、页面草图和 HTML 原型。"
              />
            </label>
          ) : (
            <div className="ai-workflow-block ai-workflow-input-note">
              <div className="ai-workflow-block-header">
                <strong>AI 输入入口</strong>
                <span>在页面底部输入区描述项目目标、需求边界和期望产物。</span>
              </div>
              <div className="ai-workflow-input-preview">
                {rawRequirementInput.trim() ? rawRequirementInput : '还没有输入内容。先在下方输入，再运行当前批处理目标。'}
              </div>
            </div>
          )}

          <div className="ai-workflow-block">
            <div className="ai-workflow-block-header">
              <strong>运行模式</strong>
              <span>产品层只暴露统一协议，不暴露 Claude / Codex 品牌差异。</span>
            </div>
            <div className="ai-workflow-chip-grid">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`ai-workflow-chip ${projectWorkflowState?.executionMode === option.id ? 'active' : ''}`}
                  onClick={() => setExecutionMode(currentProject.id, option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ai-workflow-block">
            <div className="ai-workflow-block-header">
              <strong>批处理目标</strong>
              <span>一次跑到阶段边界，然后停下来等你确认。</span>
            </div>
            <div className="ai-workflow-chip-grid">
              {PACKAGE_OPTIONS.map((option) => {
                const packageDisabled =
                  !canRunTargetPackage(currentProject.id, option.id) ||
                  (option.id === 'page' && !selectedStyleProfile);

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`ai-workflow-chip ${targetPackage === option.id ? 'active' : ''}`}
                    onClick={() => setTargetPackage(option.id)}
                    disabled={packageDisabled}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {showRunActions ? (
            <div className="ai-workflow-actions">
              <button className="doc-action-btn" type="button" onClick={handleRun} disabled={runDisabled}>
                {isRunning ? 'AI 运行中...' : `运行 ${PACKAGE_OPTIONS.find((item) => item.id === targetPackage)?.label}`}
              </button>
              <span className="ai-workflow-run-note">
                {latestRun
                  ? `最近一次运行：${new Date(latestRun.updatedAt).toLocaleString()}`
                  : '还没有运行记录，先执行需求包即可开始。'}
              </span>
            </div>
          ) : null}

          {error ? <div className="ai-workflow-error">{error}</div> : null}

          <div className="ai-workflow-stage-row">
            {STAGE_ORDER.map((stage) => {
              const stateClass = confirmedStages.has(stage)
                ? 'confirmed'
                : completedStages.has(stage)
                  ? 'completed'
                  : latestRun?.currentStage === stage && latestRun.status === 'running'
                    ? 'running'
                    : 'idle';

              return (
                <div key={stage} className={`ai-workflow-stage ${stateClass}`}>
                  <div className="ai-workflow-stage-head">
                    <strong>{STAGE_LABELS[stage]}</strong>
                    <span>
                      {confirmedStages.has(stage)
                        ? '已确认'
                        : completedStages.has(stage)
                          ? '待确认'
                          : latestRun?.currentStage === stage && latestRun.status === 'running'
                            ? '进行中'
                            : '未开始'}
                    </span>
                  </div>
                  <p>{stageSummary[stage] || '等待该阶段产物生成。'}</p>
                </div>
              );
            })}
          </div>

          {pendingConfirmations.length > 0 ? (
            <div className="ai-workflow-block">
              <div className="ai-workflow-block-header">
                <strong>待确认阶段</strong>
                <span>只有确认后，后续批处理才会继续解锁。</span>
              </div>
              <div className="ai-workflow-confirm-list">
                {pendingConfirmations.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="doc-action-btn secondary"
                    onClick={() => handleConfirmStage(stage)}
                  >
                    确认 {STAGE_LABELS[stage]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {latestRun?.skillExecutions.length ? (
            <div className="ai-workflow-block">
              <div className="ai-workflow-block-header">
                <strong>最近执行记录</strong>
                <span>用于追踪技能、模型和 fallback 情况。</span>
              </div>
              <div className="ai-workflow-history">
                {latestRun.skillExecutions
                  .slice()
                  .reverse()
                  .map((execution) => (
                    <div key={execution.id} className="ai-workflow-history-item">
                      <div>
                        <strong>{execution.skill}</strong>
                        <span>{STAGE_LABELS[execution.stage]}</span>
                      </div>
                      <div>
                        <span className={`history-status ${execution.status}`}>{execution.status}</span>
                        <span>{execution.model || execution.provider || 'local'}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="ai-workflow-side">
          <div className="ai-workflow-block">
            <div className="ai-workflow-block-header">
              <strong>样式方向</strong>
              <span>原型包确认后，选择一个风格再生成 HTML 页面。</span>
            </div>
            <div className="ai-style-list">
              {styleProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`ai-style-card ${selectedStyleProfile?.id === profile.id ? 'active' : ''}`}
                  onClick={() => selectStyleProfile(currentProject.id, profile.id)}
                >
                  <div className="ai-style-card-head">
                    <strong>{profile.name}</strong>
                    <span>{profile.direction}</span>
                  </div>
                  <p>{profile.summary}</p>
                  <div className="ai-style-swatches">
                    {profile.palette.map((color) => (
                      <span key={`${profile.id}-${color}`} style={{ background: color }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="ai-workflow-block">
            <div className="ai-workflow-block-header">
              <strong>HTML 预览</strong>
              <span>导出只做静态 HTML + manifest，不生成生产级业务逻辑。</span>
            </div>
            {latestPrototype && selectedPreviewPage ? (
              <div className="ai-prototype-shell">
                <div className="ai-prototype-tabs">
                  {latestPrototype.pages.map((page: HTMLPrototypePage) => (
                    <button
                      key={page.id}
                      type="button"
                      className={selectedPreviewPage.id === page.id ? 'active' : ''}
                      onClick={() => setSelectedPreviewPageId(page.id)}
                    >
                      {page.pageName}
                    </button>
                  ))}
                </div>
                <iframe
                  className="ai-prototype-frame"
                  sandbox="allow-same-origin"
                  srcDoc={selectedPreviewPage.html}
                  title={selectedPreviewPage.title}
                />
                <div className="ai-prototype-actions">
                  <button
                    className="doc-action-btn secondary"
                    type="button"
                    onClick={() => downloadText(selectedPreviewPage.path, selectedPreviewPage.html, 'text/html;charset=utf-8')}
                  >
                    下载当前 HTML
                  </button>
                  <button
                    className="doc-action-btn secondary"
                    type="button"
                    onClick={() => downloadText('manifest.json', latestPrototype.manifest, 'application/json;charset=utf-8')}
                  >
                    下载 Manifest
                  </button>
                </div>
              </div>
            ) : (
              <div className="ai-prototype-empty">
                还没有 HTML 原型。先确认“页面结构”和“页面草图”，再选择风格运行页面包。
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
};
