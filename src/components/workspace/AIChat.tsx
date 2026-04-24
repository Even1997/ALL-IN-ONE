import React, { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError } from '../../modules/ai/core/configStatus';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { useAIWorkflowStore } from '../../modules/ai/store/workflowStore';
import { runAIWorkflowPackage } from '../../modules/ai/workflow/AIWorkflowService';
import { chooseNextWorkflowPackage } from '../../modules/ai/workflow/chatWorkflowRouting';
import { buildAIStatusCards } from '../../modules/ai/workflow/statusSummary';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { useProjectStore } from '../../store/projectStore';
import type { AIWorkflowPackage, AIWorkflowRun } from '../../types';
import './AIChat.css';

type MemoryTone = 'neutral' | 'success' | 'warning' | 'error';

type MemoryEntry = {
  id: string;
  role: 'user' | 'agent' | 'system';
  title: string;
  content: string;
  tone: MemoryTone;
  createdAt: number;
};

const CONFIRM_COMMANDS = new Set(['继续', '确认', '继续生成', '下一步', 'go', 'continue', 'confirm']);

const PACKAGE_LABELS: Record<AIWorkflowPackage, string> = {
  requirements: '需求整理',
  prototype: '结构与草图',
  page: 'HTML 原型',
};

const createMemoryEntry = (
  role: MemoryEntry['role'],
  title: string,
  content: string,
  tone: MemoryTone = 'neutral'
): MemoryEntry => ({
  id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role,
  title,
  content,
  tone,
  createdAt: Date.now(),
});

const formatTimestamp = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getRunTone = (run: AIWorkflowRun): MemoryTone => {
  if (run.status === 'error') {
    return 'error';
  }

  if (run.status === 'awaiting_confirmation') {
    return 'warning';
  }

  if (run.status === 'completed') {
    return 'success';
  }

  return 'neutral';
};

const getRunTitle = (run: AIWorkflowRun) => {
  const base = PACKAGE_LABELS[run.targetPackage];

  if (run.status === 'awaiting_confirmation') {
    return `${base}已生成`;
  }

  if (run.status === 'completed') {
    return `${base}已确认`;
  }

  if (run.status === 'error') {
    return `${base}执行失败`;
  }

  return `${base}处理中`;
};

const getRunContent = (run: AIWorkflowRun) => {
  const summary = Object.values(run.stageSummaries)
    .filter(Boolean)
    .join(' · ');

  if (summary) {
    return summary;
  }

  if (run.error) {
    return run.error;
  }

  return run.inputSummary || '已进入该阶段处理。';
};

const resolveRequestedPackage = (input: string): AIWorkflowPackage | null => {
  const normalized = input.toLowerCase();

  if (normalized.includes('html') || normalized.includes('原型页面') || normalized.includes('页面原型')) {
    return 'page';
  }

  if (normalized.includes('页面结构') || normalized.includes('线框') || normalized.includes('草图') || normalized.includes('wireframe')) {
    return 'prototype';
  }

  if (normalized.includes('需求') || normalized.includes('功能树') || normalized.includes('功能清单')) {
    return 'requirements';
  }

  return null;
};

const normalizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('AI is not configured')) {
    return 'AI 尚未配置。请先在设置里填写 provider、API Key 和 model。';
  }

  if (raw.includes('Please open a project')) {
    return '请先创建或打开项目，再通过 AI 推进需求和原型。';
  }

  if (raw.includes('Please confirm the previous workflow package')) {
    return '请先确认上一阶段结果，再继续执行下一包。';
  }

  return raw;
};

export const AIChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [latestInstruction, setLatestInstruction] = useState('');
  const [sessionMemory, setSessionMemory] = useState<MemoryEntry[]>([
    createMemoryEntry(
      'system',
      'Agent Ready',
      '在这里直接说需求、修改意见，或者输入“继续”。结果会显示在上方，记忆会压缩保留在下方。',
      'neutral'
    ),
  ]);

  const { isConfigured, provider, model } = useGlobalAIStore(
    useShallow((state) => ({
      isConfigured: state.isConfigured,
      provider: state.provider,
      model: state.model,
    }))
  );

  const {
    currentProject,
    rawRequirementInput,
    requirementDocs,
    pageStructure,
    wireframes,
    setRawRequirementInput,
  } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      rawRequirementInput: state.rawRequirementInput,
      requirementDocs: state.requirementDocs,
      pageStructure: state.pageStructure,
      wireframes: state.wireframes,
      setRawRequirementInput: state.setRawRequirementInput,
    }))
  );

  const featureTree = useFeatureTreeStore((state) => state.tree);
  const { projectWorkflow, confirmStage } = useAIWorkflowStore(
    useShallow((state) => ({
      projectWorkflow: currentProject ? state.projects[currentProject.id] : undefined,
      confirmStage: state.confirmStage,
    }))
  );

  const runs = projectWorkflow?.runs ?? [];
  const latestRun = runs[0] ?? null;

  const artifactAvailability = useMemo(
    () => ({
      hasRequirementsSpec: requirementDocs.some((doc) => doc.sourceType === 'ai'),
      hasFeatureTree: Boolean(featureTree?.children.length),
      hasPageStructure: pageStructure.length > 0,
      hasWireframes: Object.keys(wireframes).length > 0,
    }),
    [featureTree, pageStructure, requirementDocs, wireframes]
  );

  const statusCards = useMemo(
    () => buildAIStatusCards(latestInstruction || rawRequirementInput, latestRun),
    [latestInstruction, latestRun, rawRequirementInput]
  );

  const memoryEntries = useMemo(() => {
    const persistedMemory: MemoryEntry[] = runs.slice(0, 8).map((run) => ({
      id: `run_${run.id}`,
      role: 'agent',
      title: getRunTitle(run),
      content: getRunContent(run),
      tone: getRunTone(run),
      createdAt: new Date(run.updatedAt).getTime(),
    }));

    return [...sessionMemory, ...persistedMemory]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 16);
  }, [runs, sessionMemory]);

  const pushMemory = useCallback((entry: MemoryEntry) => {
    setSessionMemory((current) => [entry, ...current].slice(0, 12));
  }, []);

  const handleConfirmAndContinue = useCallback(async () => {
    if (!currentProject || !latestRun) {
      return;
    }

    const pendingStages = latestRun.completedStages.filter((stage) => !latestRun.confirmedStages.includes(stage));
    if (pendingStages.length === 0) {
      pushMemory(createMemoryEntry('agent', '无需确认', '当前没有待确认阶段，可以继续输入新的需求。', 'neutral'));
      return;
    }

    pendingStages.forEach((stage) => confirmStage(currentProject.id, latestRun.id, stage));
    pushMemory(
      createMemoryEntry('user', '确认结果', `已确认阶段：${pendingStages.join('、')}`, 'success')
    );

    const nextPackage = chooseNextWorkflowPackage(artifactAvailability);
    const shouldStopHere = nextPackage === 'page' && latestRun.targetPackage === 'page';
    if (shouldStopHere) {
      pushMemory(createMemoryEntry('agent', '流程完成', '当前 HTML 原型阶段已经确认完成。', 'success'));
      return;
    }

    const rerunSamePackage =
      nextPackage === latestRun.targetPackage && latestRun.status === 'awaiting_confirmation';
    if (rerunSamePackage) {
      return;
    }

    await runAIWorkflowPackage(nextPackage);
    pushMemory(
      createMemoryEntry('agent', '继续执行', `已切换到 ${PACKAGE_LABELS[nextPackage]}，新结果会同步刷新。`, 'neutral')
    );
  }, [artifactAvailability, confirmStage, currentProject, latestRun, pushMemory]);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!input.trim() || isLoading) {
        return;
      }

      const content = input.trim();
      setLatestInstruction(content);
      setInput('');
      setIsLoading(true);
      pushMemory(createMemoryEntry('user', '新指令', content, 'neutral'));

      try {
        if (!currentProject) {
          throw new Error('请先创建或打开项目。');
        }

        if (!isConfigured) {
          throw buildAIConfigurationError();
        }

        if (CONFIRM_COMMANDS.has(content.toLowerCase())) {
          await handleConfirmAndContinue();
          return;
        }

        const requestedPackage = resolveRequestedPackage(content);
        const nextPackage = requestedPackage || chooseNextWorkflowPackage(artifactAvailability);
        const nextBrief =
          rawRequirementInput.trim() && !requestedPackage
            ? `${rawRequirementInput.trim()}\n\n用户补充：${content}`
            : content;

        setRawRequirementInput(nextBrief);
        await runAIWorkflowPackage(nextPackage);
        pushMemory(
          createMemoryEntry(
            'agent',
            '结果已刷新',
            `已执行${PACKAGE_LABELS[nextPackage]}，右侧结果区已同步更新。`,
            'success'
          )
        );
      } catch (error) {
        const message = normalizeErrorMessage(error);
        setLatestInstruction(message);
        pushMemory(createMemoryEntry('agent', '执行异常', message, 'error'));
      } finally {
        setIsLoading(false);
      }
    },
    [
      artifactAvailability,
      currentProject,
      handleConfirmAndContinue,
      input,
      isConfigured,
      isLoading,
      pushMemory,
      rawRequirementInput,
      setRawRequirementInput,
    ]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="agent-shell">
      <aside className="agent-rail">
        <section className="agent-panel agent-result-panel">
          <div className="agent-panel-head">
            <div>
              <div className="agent-eyebrow">Agent Result</div>
              <strong>当前结果与推进状态</strong>
            </div>
            <div className="agent-meta">
              <span>{provider}</span>
              <span>{model}</span>
              <span>{latestRun ? PACKAGE_LABELS[latestRun.targetPackage] : '等待指令'}</span>
              <span className={isConfigured ? 'configured' : 'unconfigured'}>
                {isConfigured ? '已连接' : '未配置'}
              </span>
            </div>
          </div>

          <div className="agent-result-stack">
            {statusCards.map((card) => (
              <section key={card.title} className={`status-card ${card.tone}`}>
                <span className="status-card-label">{card.title}</span>
                <div className="status-card-content">
                  {card.content.split('\n').map((line, index) => (
                    <div key={`${card.title}-${index}`}>{line}</div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="agent-action-row">
            <button
              className="doc-action-btn secondary"
              type="button"
              disabled={!latestRun || isLoading}
              onClick={() => void handleConfirmAndContinue()}
            >
              确认并继续
            </button>
            <span className={`chat-status-indicator ${isLoading ? 'loading' : latestRun?.status || 'idle'}`}>
              {isLoading
                ? '执行中'
                : latestRun?.status === 'awaiting_confirmation'
                  ? '等待确认'
                  : latestRun?.status === 'error'
                    ? '执行失败'
                    : latestRun?.status === 'completed'
                      ? '已确认'
                      : '待输入'}
            </span>
          </div>
        </section>

        <section className="agent-panel agent-memory-panel">
          <div className="agent-panel-head">
            <div>
              <div className="agent-eyebrow">Agent Memory</div>
              <strong>压缩记忆时间线</strong>
            </div>
          </div>

          <div className="agent-memory-list">
            {memoryEntries.map((entry) => (
              <article key={entry.id} className={`memory-entry ${entry.tone}`}>
                <div className="memory-dot" />
                <div className="memory-body">
                  <div className="memory-head">
                    <span className={`memory-role ${entry.role}`}>{entry.title}</span>
                    <time>{formatTimestamp(entry.createdAt)}</time>
                  </div>
                  <div className="memory-content">{entry.content}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </aside>

      <form className="agent-prompt-bar" onSubmit={handleSubmit}>
        <div className="agent-prompt-head">
          <div className="agent-prompt-copy">
            <strong>Agent Prompt</strong>
            <span>直接说需求、补充想法或输入“继续”，整个流程都在这里推进。</span>
          </div>
          <div className="agent-prompt-chip-row">
            <span className="agent-prompt-chip">需求</span>
            <span className="agent-prompt-chip">草图</span>
            <span className="agent-prompt-chip">HTML 原型</span>
          </div>
        </div>

        <div className="chat-input-container agent-prompt-shell">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例如：保留当前页面结构，先把需求整理成一版可确认文档；或直接输入“继续”"
            className="chat-input"
            rows={1}
          />
          <button type="submit" className="send-btn" disabled={!input.trim() || isLoading}>
            发送
          </button>
        </div>

        {!isConfigured ? (
          <div className="api-warning">AI 尚未配置。请先在设置里填写 provider、API Key 和 model。</div>
        ) : null}
      </form>
    </div>
  );
};
