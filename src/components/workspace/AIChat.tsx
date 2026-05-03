import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError, listModelsSupportMode } from '../../modules/ai/core/configStatus';
import { aiService, type AIProviderType } from '../../modules/ai/core/AIService';
import { ToolExecutor } from './tools';
import { buildDirectChatPrompt } from '../../modules/ai/chat/directChatPrompt';
import type { ChatStructuredCard } from '../../modules/ai/chat/chatCards';
import { buildContextUsageSummary } from '../../modules/ai/chat/contextBudget';
import { buildReferencePromptContext } from '../../modules/ai/chat/referencePromptContext';
import {
  CHAT_AGENTS,
  type ChatAgentId,
  type LocalAgentCommandResult,
} from '../../modules/ai/chat/chatAgents';
import {
  buildChatContextSnapshot,
  collectDesignPages,
  getSelectedElementLabel,
  resolveReferenceScopeSelection,
} from '../../modules/ai/chat/chatContext';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import type { ActivityEntry } from '../../modules/ai/skills/activityLog';
import {
  getDefaultRuntimeSkillDefinitions,
  loadRuntimeSkillDefinitions,
} from '../../modules/ai/skills/skillLibrary';
import { type AIConfigEntry, hasUsableAIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { toRuntimeAIConfig } from '../../modules/ai/store/aiConfigState';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../modules/ai/gn-agent/localConfig';
import {
  appendAgentTimelineEvent as persistRuntimeTimelineEvent,
  createAgentThread as persistRuntimeThread,
  executePrompt as executeRuntimePrompt,
  getAgentTurnCheckpointDiff,
  enqueueAgentApproval,
  getAgentSandboxPolicy,
  listAgentTurnCheckpoints,
  listAgentApprovals,
  rewindAgentTurn,
  resolveAgentApproval,
  saveAgentTurnCheckpoint,
} from '../../modules/ai/runtime/agentRuntimeClient';
import { useApprovalStore } from '../../modules/ai/runtime/approval/approvalStore';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes';
import { buildProjectMemoryEntry } from '../../modules/ai/runtime/memory/projectMemoryRuntime';
import {
  createRuntimeStreamingMessageAssembler,
  createRuntimeReplayExecutionController,
} from '../../modules/ai/runtime/orchestration/agentTurnRunner';
import type { RuntimeToolStep } from '../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import { executeRuntimeBuiltInAgentTurn } from '../../modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn';
import { executeRuntimeMcpTurn } from '../../modules/ai/runtime/orchestration/executeRuntimeMcpTurn';
import { runRuntimeLocalAgentExecution } from '../../modules/ai/runtime/orchestration/runRuntimeLocalAgentExecution';
import { buildAgentContext } from '../../modules/ai/runtime/context/buildAgentContext';
import {
  buildRuntimeLocalAgentPlan,
  buildRuntimeLocalAgentDecisionState,
  denyRuntimeLocalAgentApproval,
  handleRuntimeLocalAgentDecision,
  prepareRuntimeLocalAgentFlow,
  resolveRuntimeLocalAgentDecisionFeedback,
  requestRuntimeLocalAgentApproval,
  updateRuntimeLocalAgentPlanApprovalStatus,
} from '../../modules/ai/runtime/orchestration/runtimeLocalAgentFlow';
import {
  applyRuntimeProjectFileProposalToPlan,
  buildRuntimeProjectFileAutoExecuteSummary,
  buildRuntimeProjectFilePlan,
  buildProjectFileDecisionState,
  denyRuntimeProjectFileApproval,
  executeRuntimeProjectFileRead,
  executeRuntimeProjectFilePlanning,
  handleRuntimeProjectFileDecision,
  prepareProjectFileProposalFlow,
  requestRuntimeProjectFileApproval,
  resolveRuntimeProjectFileDecisionFeedback,
  updateRuntimeProjectFilePlanApprovalStatus,
} from '../../modules/ai/runtime/orchestration/runtimeProjectFileFlow';
import {
  resolveRuntimeApproval,
  requestRuntimeApproval as requestRuntimeApprovalFlow,
  type RuntimePendingApprovalAction,
} from '../../modules/ai/runtime/orchestration/runtimeApprovalCoordinator';
import {
  cancelRuntimeProjectFileProposal,
  executeRuntimeApprovedProjectFileProposal,
  executeRuntimeProjectFileOperations,
  type RuntimeProjectFileToolResponse,
} from '../../modules/ai/runtime/orchestration/runtimeProjectFileExecutionFlow';
import {
  buildRuntimeChangedPathActivityEntry,
} from '../../modules/ai/runtime/orchestration/runtimeTurnOutcomeFlow';
import {
  applyRuntimeTurnClassifying,
  applyRuntimeTurnBlocked,
  applyRuntimeTurnCompleted,
  applyRuntimeTurnExecuting,
  applyRuntimeTurnFailed,
  buildRuntimeTurnReviewPlan,
} from '../../modules/ai/runtime/orchestration/runtimeTurnSessionFlow';
import { executeRuntimeWorkflowPackage } from '../../modules/ai/runtime/orchestration/runtimeWorkflowFlow';
import type {
  AgentProviderId,
  AgentTurnCheckpointDiff,
  AgentTurnCheckpointRecord,
} from '../../modules/ai/runtime/agentRuntimeTypes';
import {
  invokeRuntimeMcpTool,
  listRuntimeMcpServers,
  listRuntimeMcpToolCalls,
} from '../../modules/ai/runtime/mcp/runtimeMcpClient';
import {
  parseRuntimeMcpCommand,
} from '../../modules/ai/runtime/mcp/runtimeMcpFlow';
import {
  appendRuntimeReplayEvent,
  listRuntimeReplayEvents,
} from '../../modules/ai/runtime/replay/runtimeReplayClient';
import {
  buildReplayRecoveryState,
  createReplayRecoveryController,
  getLatestReplaySkillSnapshot,
} from '../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { buildRuntimeReplayTurnStartPayload } from '../../modules/ai/runtime/replay/runtimeReplayPayload';
import { decideAgentTurnMode } from '../../modules/ai/runtime/session/agentSessionController';
import { getLatestTurnSession } from '../../modules/ai/runtime/session/agentSessionSelectors';
import { reduceAgentTurnSession } from '../../modules/ai/runtime/session/agentSessionStateMachine';
import { createEmptyAgentTurnSession, type AgentTurnSession } from '../../modules/ai/runtime/session/agentSessionTypes';
import { useRuntimeMcpStore } from '../../modules/ai/runtime/mcp/runtimeMcpStore';
import { createRuntimeSkillRegistry } from '../../modules/ai/runtime/skills/runtimeSkillRegistry';
import { useAgentRuntimeStore } from '../../modules/ai/runtime/agentRuntimeStore';
import { runAgentTeamTurn } from '../../modules/ai/runtime/teams/teamOrchestrator';
import {
  createChatSession,
  createStoredChatMessage,
  type StoredChatMessage,
  useAIChatStore,
} from '../../modules/ai/store/aiChatStore';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { useAIWorkflowStore } from '../../modules/ai/store/workflowStore';
import { AI_CHAT_COMMAND_EVENT, type AIChatCommandDetail } from '../../modules/ai/chat/chatCommands';
import { resolveSkillIntent, type SkillIntent } from '../../modules/ai/workflow/skillRouting';
import {
  detectProjectFileReadIntent,
  detectTaskAuthorizedProjectWriteIntent,
  detectProjectFileWriteIntent,
  type ProjectFileOperation,
  type ProjectFileOperationMode,
  type ProjectFileProposal,
  parseProjectFileOperationsPlan,
  resolveProjectOperationPath,
  isSupportedProjectTextFilePath,
} from '../../modules/ai/chat/projectFileOperations';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
import { emitKnowledgeFilesystemChanged } from '../../features/knowledge/workspace/knowledgeFilesystemEvents';
import { useProjectStore } from '../../store/projectStore';
import { usePreviewStore } from '../../store/previewStore';
import {
  getProjectDir,
  readProjectTextFile,
  writeProjectTextFile,
} from '../../utils/projectPersistence';
import { getDirectoryPath } from '../../utils/fileSystemPaths';
import { runAIWorkflowPackage } from '../../modules/ai/workflow/AIWorkflowService';
import {
  GNAgentEmbeddedComposer,
  GNAgentHistoryMenu,
  GNAgentMessageList,
} from '../ai/gn-agent/GNAgentEmbeddedPieces';
import { GNAgentSkillsPage } from '../ai/gn-agent-shell/GNAgentSkillsPage';
import { AIChatReferenceSearchMenu } from './AIChatReferenceSearchMenu';
import {
  buildWelcomeMessage,
  getChatShellLayoutClassName,
  getChatViewportClassName,
  getComposerPlaceholder,
} from './aiChatViewState';
import { parseAIChatMessageParts, type AIChatMessagePart } from './aiChatMessageParts';
import './AIChat.css';

type AISettingsDraft = {
  id: string | null;
  name: string;
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};

type ModelCatalog = Record<string, string[]>;
type AIProviderTypeOption = {
  value: AIProviderType;
  label: string;
  description: string;
};

type AIChatProps = {
  variant?: 'default' | 'provider-embedded' | 'gn-agent-embedded';
  runtimeConfigIdOverride?: string | null;
  providerExecutionMode?: 'claude' | 'codex' | null;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

type ChatAgentAvailability = {
  ready: boolean;
  title: string;
  fallbackMessage: string | null;
};

type RunDiffState = {
  loading: boolean;
  diff?: AgentTurnCheckpointDiff | null;
  error?: string;
};

const EMPTY_MESSAGES: StoredChatMessage[] = [];
const EMPTY_ACTIVITY_ENTRIES: ActivityEntry[] = [];

const GNAgentSkillsEntryButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    className="chat-shell-icon-btn chat-skills-entry-btn"
    aria-haspopup="dialog"
    aria-label="打开技能页"
    title="打开技能页"
    onClick={onClick}
  >
    <SkillsIcon />
  </button>
);

const formatTimestamp = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const normalizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('AI is not configured')) {
    return 'AI 还没有配置。请先在右上角打开设置，填写 provider、API Key 和模型。';
  }

  if (raw.includes('Please create or open a project first') || raw.includes('Please open a project')) {
    return '请先创建或打开一个项目。';
  }

  return raw;
};

const READ_ONLY_CHAT_TOOLS = ['glob', 'grep', 'ls', 'view'];
const normalizeReferencePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');
const summarizeReferenceContent = (value: string, fallback = '', maxLength = 120) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const createProjectFileProposalId = () => `file-proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const modeLabelMap: Record<ProjectFileOperationMode, string> = {
  manual: '手动确认',
  auto: '自动确认',
};

const approvalStatusLabelMap: Record<ApprovalRecord['status'], string> = {
  pending: '待确认',
  approved: '已批准',
  denied: '已拒绝',
};

const approvalRiskLabelMap: Record<ApprovalRecord['riskLevel'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const approvalActionLabelMap: Record<string, string> = {
  run_local_agent_prompt: '本地 Agent',
  tool_bash: '命令执行',
  tool_remove: '删除操作',
  tool_write: '写入操作',
};

const projectFileOperationTypeLabel: Record<ProjectFileOperation['type'], string> = {
  create_file: '新建',
  edit_file: '编辑',
  delete_file: '删除',
};

const projectFileProposalStatusLabel: Record<ProjectFileProposal['status'], string> = {
  pending: '待确认',
  executing: '执行中',
  executed: '已执行',
  cancelled: '已取消',
  failed: '执行失败',
};

const buildProjectFilePlanningStatusMessage = (mode: ProjectFileOperationMode) =>
  mode === 'auto' ? '正在分析需要改动的文件，确认范围后会直接写入...' : '正在分析需要改动的文件，并生成可确认的改动方案...';

const buildProjectFileClarificationCards = (message: string): ChatStructuredCard[] => [
  {
    type: 'summary',
    title: '还需要补充一点信息',
    body: message,
  },
  {
    type: 'next-step',
    title: '你可以这样继续',
    actions: [
      {
        id: 'file-path',
        label: '补充文件路径',
        prompt: '我想改的文件是 ',
      },
      {
        id: 'file-content',
        label: '说明要改什么',
        prompt: '请把这个文件改成：',
      },
    ],
  },
];

const summarizeProjectFileOperationPreview = (operation: ProjectFileOperation, maxLength = 220) => {
  const raw =
    operation.type === 'delete_file'
      ? ''
      : operation.newString || operation.content || operation.summary || '';
  const normalized = raw.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const summarizeProjectFilePath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 3) {
    return normalized;
  }

  return `.../${parts.slice(-3).join('/')}`;
};

const buildRunDiffKey = (runId: string, path: string) => `${runId}::${path}`;

const extractCheckpointFilesFromToolCalls = (toolCalls: RuntimeToolStep[] | null | undefined) => {
  const fileChangesByPath = new Map<
    string,
    {
      path: string;
      beforeContent: string | null;
      afterContent: string | null;
    }
  >();

  for (const toolCall of toolCalls || []) {
    for (const change of toolCall.fileChanges || []) {
      if (!change.path.trim()) {
        continue;
      }

      const existing = fileChangesByPath.get(change.path);
      fileChangesByPath.set(change.path, {
        path: change.path,
        beforeContent: existing ? existing.beforeContent : change.beforeContent ?? null,
        afterContent: change.afterContent ?? existing?.afterContent ?? null,
      });
    }
  }

  return Array.from(fileChangesByPath.values());
};

const resolveProjectFileProposalPresentation = (
  proposal: ProjectFileProposal,
  decision: 'blocked' | 'approval-required' | 'auto-execute'
): ProjectFileProposal => {
  if (decision === 'blocked') {
    return {
      ...proposal,
      assistantMessage: '改动方案已生成，但当前权限策略不允许直接执行。',
      executionMessage: '当前策略拦截了这次文件改动。你可以调整需求后重试。',
    };
  }

  if (decision === 'approval-required') {
    return {
      ...proposal,
      assistantMessage: '改动方案已准备好，确认后我就会写入文件。',
      executionMessage: '请先确认这次改动范围。',
    };
  }

  return {
    ...proposal,
    assistantMessage: '改动范围已确认，正在写入文件并校验结果...',
    executionMessage: '正在写入文件并校验结果...',
  };
};

const buildProjectFileStageItems = (proposal: ProjectFileProposal) => {
  const analysisState: 'done' | 'current' | 'pending' = 'done';
  const reviewState: 'done' | 'current' | 'pending' =
    proposal.status === 'pending'
      ? 'current'
      : proposal.status === 'executing' || proposal.status === 'executed' || proposal.status === 'cancelled' || proposal.status === 'failed'
        ? 'done'
        : 'pending';
  const applyState: 'done' | 'current' | 'pending' =
    proposal.status === 'executing'
      ? 'current'
      : proposal.status === 'executed'
        ? 'done'
        : 'pending';

  return [
    { key: 'analysis', label: '分析文件', state: analysisState },
    { key: 'review', label: proposal.mode === 'auto' ? '确认范围' : '等待确认', state: reviewState },
    { key: 'apply', label: proposal.status === 'executed' ? '写入完成' : '写入文件', state: applyState },
  ];
};

const resolveProjectFileProposalNote = (proposal: ProjectFileProposal) => {
  if (proposal.status === 'executing') {
    return '正在写入文件并校验结果...';
  }

  if (proposal.status === 'cancelled') {
    return '这次文件改动已取消，没有写入任何内容。';
  }

  return proposal.executionMessage || '';
};

const groupActivityEntriesByRunId = (entries: ActivityEntry[]) =>
  entries.reduce<Record<string, ActivityEntry[]>>((accumulator, entry) => {
    if (!accumulator[entry.runId]) {
      accumulator[entry.runId] = [];
    }
    accumulator[entry.runId]?.push(entry);
    return accumulator;
  }, {});

const groupTurnCheckpointsByRunId = (entries: AgentTurnCheckpointRecord[]) =>
  entries.reduce<Record<string, AgentTurnCheckpointRecord>>((accumulator, entry) => {
    const existing = accumulator[entry.runId];
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      accumulator[entry.runId] = entry;
    }
    return accumulator;
  }, {});

const createWelcomeSession = (
  projectId: string,
  projectName?: string | null,
  providerId: AgentProviderId = 'built-in'
) => {
  const session = createChatSession(projectId, '新对话', providerId);
  return {
    ...session,
    messages: [buildWelcomeMessage(projectName)],
  };
};

const summarizeSessionTitle = (value: string) => {
  const normalized = value.replace(/^@\S+\s*/, '').trim();
  if (!normalized) {
    return '新对话';
  }

  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
};

const buildSessionPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized;
};

const createActivityEntryId = () => `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createRunId = () => `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const KnowledgeTruthStructuredCards: React.FC<{
  cards: ChatStructuredCard[];
  onSelectNextStep: (prompt: string) => void;
}> = ({ cards, onSelectNextStep }) => (
  <div className="chat-structured-cards">
    {cards.map((card, index) => {
      if (card.type === 'summary') {
        return (
          <section key={`${card.type}-${index}`} className="chat-structured-card summary">
            <strong>{card.title}</strong>
            <p>{card.body}</p>
          </section>
        );
      }

      if (card.type === 'conflict') {
        return (
          <section key={card.id} className="chat-structured-card conflict">
            <strong>{card.title}</strong>
            <p>{card.previousLabel}</p>
            <p>{card.nextLabel}</p>
            <small>{card.sourceTitles.join(' / ')}</small>
          </section>
        );
      }

      if (card.type === 'temporary-content') {
        return (
          <section key={card.artifactId} className="chat-structured-card temporary-content">
            <strong>{card.title}</strong>
            <p>{card.summary}</p>
            <pre>{card.body}</pre>
          </section>
        );
      }

      return (
        <section key={`${card.type}-${index}`} className="chat-structured-card next-step">
          <strong>{card.title}</strong>
          <div className="chat-next-step-actions">
            {card.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="chat-next-step-action"
                onClick={() => onSelectNextStep(action.prompt)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

const CUSTOM_PROVIDER_PRESET: ProviderPreset = {
  id: 'custom',
  label: '自定义 Provider',
  type: 'openai-compatible',
  baseURL: '',
  docsUrl: 'https://platform.openai.com/docs/api-reference',
  iconText: 'CU',
  accent: 'gray',
  enabled: true,
  models: [],
  keyHint: '填写你的平台 API Key',
  note: '用于接入未内置的平台。你可以自行切换 API 类型、Base URL、模型和自定义请求头。',
};

const SETTINGS_PROVIDER_PRESETS = [...PROVIDER_PRESETS, CUSTOM_PROVIDER_PRESET];

const AI_PROVIDER_TYPE_OPTIONS: AIProviderTypeOption[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: '适用于 OpenAI、OpenRouter、DeepSeek、Ollama 等兼容 chat/completions 的平台。',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: '适用于 Claude 原生 /messages 协议。',
  },
];

const findPresetByConfig = (provider: AIProviderType, baseURL: string) =>
  SETTINGS_PROVIDER_PRESETS.find(
    (item) => item.id !== CUSTOM_PROVIDER_PRESET.id && item.type === provider && item.baseURL === baseURL
  ) || null;

const providerTypeLabel = (provider: AIProviderType) =>
  provider === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible';

const buildProviderEndpointPreview = (provider: AIProviderType, baseURL: string) =>
  `${baseURL.replace(/\/+$/, '')}/${provider === 'anthropic' ? 'messages' : 'chat/completions'}`;

const getSuggestedBaseURL = (provider: AIProviderType, preset: ProviderPreset) => {
  if (preset.baseURL.trim()) {
    return preset.baseURL;
  }

  return provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
};

const buildProviderKey = (provider: AIProviderType, baseURL: string) =>
  `${provider}::${baseURL.trim().replace(/\/+$/, '')}`;

const HistoryIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M3.5 10A6.5 6.5 0 1 0 5.4 5.36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3.5 4.75V7.75H6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M10 6.7V10L12.55 11.55" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const SkillsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M6.25 4.25H13.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M5.25 8.25H14.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M7.25 12.25H12.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M8.5 16L10 14.5L11.5 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ComposeIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M4.5 14.8L5.05 11.85L12.85 4.05C13.43 3.47 14.37 3.47 14.95 4.05L15.95 5.05C16.53 5.63 16.53 6.57 15.95 7.15L8.15 14.95L5.2 15.5L4.5 14.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M10 6.75A3.25 3.25 0 1 0 10 13.25A3.25 3.25 0 1 0 10 6.75Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 2.9V4.35M10 15.65V17.1M17.1 10H15.65M4.35 10H2.9M14.98 5.02L13.95 6.05M6.05 13.95L5.02 14.98M14.98 14.98L13.95 13.95M6.05 6.05L5.02 5.02" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    {collapsed ? (
      <path d="M7 4.5L12.5 10L7 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M12.5 4.5L7 10L12.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const SendIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M3.35 9.65L15.95 4.55C16.56 4.3 17.16 4.9 16.91 5.51L11.81 18.11C11.53 18.81 10.52 18.75 10.33 18.02L8.92 12.56L3.44 11.13C2.72 10.94 2.66 9.94 3.35 9.65Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const normalizeSearchToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const summarizeReferencePath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 2) {
    return normalized;
  }

  return `.../${parts.slice(-2).join('/')}`;
};

const renderMessagePart = (messageId: string, part: AIChatMessagePart, index: number) => {
  if (part.type === 'thinking') {
    const previewLine =
      part.content
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    const preview =
      previewLine.length > 88 ? `${previewLine.slice(0, 88)}...` : previewLine;

    return (
      <details
        className={`chat-thinking-block ${part.collapsed ? 'collapsed' : 'expanded'}`}
        key={`${messageId}-thinking-${index}`}
        open={!part.collapsed}
      >
        <summary>
          <span className="chat-thinking-pulse" aria-hidden="true" />
          <span>{part.collapsed ? '思考过程' : '正在思考'}</span>
          {!part.collapsed ? (
            <span className="chat-thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : preview ? (
            <span className="chat-thinking-preview">{preview}</span>
          ) : null}
        </summary>
        {part.content ? <pre>{part.content}</pre> : <div className="chat-thinking-empty">等待模型输出思考内容...</div>}
      </details>
    );
  }

  if (part.type === 'tool') {
    return (
      <details className={`chat-tool-card ${part.status}`} key={`${messageId}-tool-${index}`}>
        <summary className="chat-tool-card-header chat-tool-card-summary">
          <span className="chat-tool-icon" aria-hidden="true" />
          <div>
            <strong>{part.title}</strong>
            <span>{part.status === 'running' ? '正在执行' : part.status === 'error' ? '执行失败' : '已完成'}</span>
          </div>
        </summary>
        {part.command ? (
          <div className="chat-tool-section">
            <span className="chat-tool-section-label">Command</span>
            <pre className="chat-tool-command">{part.command}</pre>
          </div>
        ) : null}
        {part.input && part.input !== part.command ? (
          <div className="chat-tool-section">
            <span className="chat-tool-section-label">Input</span>
            <pre className="chat-tool-command">{part.input}</pre>
          </div>
        ) : null}
        {part.output ? (
          <div className="chat-tool-section">
            <span className="chat-tool-section-label">Output</span>
            <pre className="chat-tool-output">{part.output}</pre>
          </div>
        ) : null}
      </details>
    );
  }

  return (
    <div className="chat-answer-text" key={`${messageId}-text-${index}`}>
      {part.content.split('\n').map((line, lineIndex) => (
        <div key={`${messageId}-text-${index}-${lineIndex}`}>{line}</div>
      ))}
    </div>
  );
};

const mergeModelCandidates = (...groups: string[][]) =>
  Array.from(
    new Set(
      groups
        .flat()
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const buildSettingsDraft = (config: AIConfigEntry | null): AISettingsDraft => ({
  id: config?.id || null,
  name: config?.name || '',
  provider: config?.provider || 'openai-compatible',
  apiKey: config?.apiKey || '',
  baseURL: config?.baseURL || PROVIDER_PRESETS[0]?.baseURL || '',
  model: config?.model || PROVIDER_PRESETS[0]?.models[0] || '',
  contextWindowTokens: config?.contextWindowTokens || 258000,
  customHeaders: config?.customHeaders || '',
  enabled: config?.enabled || false,
});

const createRuntimeEventId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const AIChat: React.FC<AIChatProps> = ({
  variant = 'default',
  runtimeConfigIdOverride = null,
  providerExecutionMode = null,
  collapsed,
  onCollapsedChange,
}) => {
  const isProviderEmbedded = variant === 'provider-embedded';
  const isGNAgentEmbedded = variant === 'gn-agent-embedded';
  const isEmbedded = isProviderEmbedded || isGNAgentEmbedded;
  const lockExpandedForEmbedded = isProviderEmbedded;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({});
  const [selectedSettingsConfigId, setSelectedSettingsConfigId] = useState<string | null>(null);
  const [selectedChatAgentId, setSelectedChatAgentId] = useState<ChatAgentId>('built-in');
  const [localAgentSnapshot, setLocalAgentSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AISettingsDraft>(buildSettingsDraft(null));
  const [jsonImportText, setJsonImportText] = useState('');
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [streamingDraftContents, setStreamingDraftContents] = useState<Record<string, string>>({});
  const [projectFileOperationMode, setProjectFileOperationMode] = useState<ProjectFileOperationMode>('auto');
  const [referenceSearchOpen, setReferenceSearchOpen] = useState(false);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('');
  const [referenceTriggerIndex, setReferenceTriggerIndex] = useState(-1);
  const [referenceSearchIndex, setReferenceSearchIndex] = useState(0);
  const [turnCheckpoints, setTurnCheckpoints] = useState<AgentTurnCheckpointRecord[]>([]);
  const [expandedRunDiffKey, setExpandedRunDiffKey] = useState<string | null>(null);
  const [runDiffsByKey, setRunDiffsByKey] = useState<Record<string, RunDiffState>>({});
  const [rewindTargetRunId, setRewindTargetRunId] = useState<string | null>(null);
  const [isRewindingRunId, setIsRewindingRunId] = useState<string | null>(null);
  const [rewindError, setRewindError] = useState('');
  const isControlledCollapse = typeof collapsed === 'boolean';
  const isCollapsed = isControlledCollapse ? Boolean(collapsed) : internalIsCollapsed;
  const showExpandedShell = !isCollapsed || lockExpandedForEmbedded;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingDraftBufferRef = useRef<Record<string, string>>({});
  const streamingFlushFrameRef = useRef<number | null>(null);
  const pendingApprovalActionsRef = useRef<Record<string, RuntimePendingApprovalAction>>({});
  const runtimeSkillRegistryRef = useRef(
    createRuntimeSkillRegistry(getDefaultRuntimeSkillDefinitions())
  );

  const setCollapsedState = (nextValue: boolean) => {
    if (!isControlledCollapse) {
      setInternalIsCollapsed(nextValue);
    }
    onCollapsedChange?.(nextValue);
  };

  const {
    aiConfigs,
    selectedConfigId,
    addConfig,
    updateConfig,
    deleteConfig,
    setConfigEnabled,
    selectConfig,
  } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
      addConfig: state.addConfig,
      updateConfig: state.updateConfig,
      deleteConfig: state.deleteConfig,
      setConfigEnabled: state.setConfigEnabled,
      selectConfig: state.selectConfig,
    }))
  );

  const {
    currentProject,
    memory,
    requirementDocs,
    activeKnowledgeFileId,
    generatedFiles,
    pageStructure,
    setRawRequirementInput,
  } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      memory: state.memory,
      requirementDocs: state.requirementDocs,
      activeKnowledgeFileId: state.activeKnowledgeFileId,
      generatedFiles: state.generatedFiles,
      pageStructure: state.pageStructure,
      setRawRequirementInput: state.setRawRequirementInput,
    }))
  );
  const projectRoot = currentProject?.vaultPath || '';
  const previewElements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const serverNotes = useKnowledgeStore((state) => state.notes);
  const aiContextState = useAIContextStore((state) =>
    currentProject ? state.projects[currentProject.id] : undefined
  );
  const setSelectedReferenceFileIds = useAIContextStore((state) => state.setSelectedReferenceFileIds);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const snapshot = await getLocalAgentConfigSnapshot();
      if (!alive) {
        return;
      }

      setLocalAgentSnapshot(snapshot);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const projectChatState = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id] : undefined
  );
  const {
    ensureProjectState,
    upsertSession,
    bindRuntimeThread,
    setActiveSession,
    appendMessage,
    appendActivityEntry,
    setActivityEntries,
    updateMessage,
    replaceSessionMessages,
    renameSession,
    removeSession,
  } = useAIChatStore(
    useShallow((state) => ({
      ensureProjectState: state.ensureProjectState,
      upsertSession: state.upsertSession,
      bindRuntimeThread: state.bindRuntimeThread,
      setActiveSession: state.setActiveSession,
      appendMessage: state.appendMessage,
      appendActivityEntry: state.appendActivityEntry,
      setActivityEntries: state.setActivityEntries,
      updateMessage: state.updateMessage,
      replaceSessionMessages: state.replaceSessionMessages,
      renameSession: state.renameSession,
      removeSession: state.removeSession,
    }))
  );
  const {
    createThread: recordRuntimeThread,
    setRuntimeBinding,
    submitTurn: submitRuntimeTurn,
    appendTimelineEvent: appendRuntimeTimelineEvent,
    setMemoryEntries: setRuntimeMemoryEntries,
    setReplayEvents: setRuntimeReplayEvents,
    appendReplayEvent: appendRuntimeReplayEventToStore,
    setRecoveryState: setRuntimeRecoveryState,
    clearReplayResumeRequest,
    activeSkillsByThread,
    setActiveSkills,
    setThreadContext,
    setThreadToolCalls,
    setThreadMemoryCandidates,
    upsertTeamRun,
    pruneThreadHistorySince,
    startRun: startRuntimeRun,
    finishRun: finishRuntimeRun,
    failRun: failRuntimeRun,
    upsertTurnSession,
    patchTurnSession,
  } = useAgentRuntimeStore(
    useShallow((state) => ({
      createThread: state.createThread,
      setRuntimeBinding: state.setRuntimeBinding,
      submitTurn: state.submitTurn,
      appendTimelineEvent: state.appendTimelineEvent,
      setMemoryEntries: state.setMemoryEntries,
      setReplayEvents: state.setReplayEvents,
      appendReplayEvent: state.appendReplayEvent,
      setRecoveryState: state.setRecoveryState,
      clearReplayResumeRequest: state.clearReplayResumeRequest,
      activeSkillsByThread: state.activeSkillsByThread,
      setActiveSkills: state.setActiveSkills,
      setThreadContext: state.setThreadContext,
      setThreadToolCalls: state.setThreadToolCalls,
      setThreadMemoryCandidates: state.setThreadMemoryCandidates,
      upsertTeamRun: state.upsertTeamRun,
      pruneThreadHistorySince: state.pruneThreadHistorySince,
      startRun: state.startRun,
      finishRun: state.finishRun,
      failRun: state.failRun,
      upsertTurnSession: state.upsertTurnSession,
      patchTurnSession: state.patchTurnSession,
    }))
  );
  const { runtimeMcpServers, setRuntimeMcpServers, setRuntimeMcpToolCalls, appendRuntimeMcpToolCall } =
    useRuntimeMcpStore(
    useShallow((state) => ({
      runtimeMcpServers: state.servers,
      setRuntimeMcpServers: state.setServers,
      setRuntimeMcpToolCalls: state.setToolCalls,
      appendRuntimeMcpToolCall: state.appendToolCall,
    }))
    );
  const {
    approvalsByThread,
    sandboxPolicy,
    setThreadApprovals,
    enqueueApproval,
    resolveApproval: resolveStoredApproval,
    setSandboxPolicy,
  } = useApprovalStore(
    useShallow((state) => ({
      approvalsByThread: state.approvalsByThread,
      sandboxPolicy: state.sandboxPolicy,
      setThreadApprovals: state.setThreadApprovals,
      enqueueApproval: state.enqueueApproval,
      resolveApproval: state.resolveApproval,
      setSandboxPolicy: state.setSandboxPolicy,
    }))
  );
  const runtimeProviderId = (providerExecutionMode || 'built-in') as AgentProviderId;

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    ensureProjectState(currentProject.id);

    const projectState = useAIChatStore.getState().projects[currentProject.id];
    if (!projectState || projectState.sessions.length === 0) {
      const session = createWelcomeSession(currentProject.id, currentProject.name, runtimeProviderId);
      upsertSession(currentProject.id, session);
      setActiveSession(currentProject.id, session.id);
    }
  }, [currentProject, ensureProjectState, runtimeProviderId, setActiveSession, upsertSession]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const policy = await getAgentSandboxPolicy();
      if (!alive) {
        return;
      }

      setSandboxPolicy(policy);
    })();

    return () => {
      alive = false;
    };
  }, [setSandboxPolicy]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const servers = await listRuntimeMcpServers();
      if (!alive) {
        return;
      }

      setRuntimeMcpServers(servers);
    })();

    return () => {
      alive = false;
    };
  }, [setRuntimeMcpServers]);

  const sessions = projectChatState?.sessions || [];
  const activeSessionId = projectChatState?.activeSessionId || sessions[0]?.id || null;
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [activeSessionId, sessions]
  );
  const activeApprovalThreadId = activeSession?.runtimeThreadId || activeSessionId || null;
  const activeCheckpointThreadId = activeSession?.runtimeThreadId || activeSession?.id || null;
  const messages = activeSession?.messages || EMPTY_MESSAGES;
  const activityEntries = projectChatState?.activityEntries || EMPTY_ACTIVITY_ENTRIES;
  const pendingApprovals = useMemo(
    () =>
      activeApprovalThreadId
        ? (approvalsByThread[activeApprovalThreadId] || []).filter(
            (approval) => approval.status === 'pending',
          )
        : [],
    [activeApprovalThreadId, approvalsByThread]
  );
  const activeSkills = useMemo(
    () => (activeSessionId ? activeSkillsByThread[activeSessionId] || [] : []),
    [activeSessionId, activeSkillsByThread]
  );
  const latestTurnSession = useAgentRuntimeStore((state) =>
    activeSessionId ? getLatestTurnSession(state.sessionsByThread[activeSessionId]) : null
  );
  const activeReplayResumeRequest = useAgentRuntimeStore((state) =>
    activeSessionId ? state.resumeRequestsByThread[activeSessionId] || null : null
  );
  const replayRecoveryController = useMemo(
    () =>
      createReplayRecoveryController({
        appendReplayEvent: appendRuntimeReplayEvent,
        appendReplayEventToStore: appendRuntimeReplayEventToStore,
        getReplayEvents: (threadId) => useAgentRuntimeStore.getState().replayEventsByThread[threadId] || [],
        setRecoveryState: setRuntimeRecoveryState,
      }),
    [appendRuntimeReplayEventToStore, setRuntimeRecoveryState]
  );

  useEffect(() => {
    if (!activeReplayResumeRequest) {
      return;
    }

    if (activeSessionId && activeReplayResumeRequest.skillSnapshot?.activeSkillIds?.length) {
      setActiveSkills(
        activeSessionId,
        runtimeSkillRegistryRef.current.restoreActiveSkills(
          activeSessionId,
          activeReplayResumeRequest.skillSnapshot.activeSkillIds,
        ),
      );
    }

    setInput(activeReplayResumeRequest.prompt);
    clearReplayResumeRequest(activeReplayResumeRequest.threadId);
  }, [activeReplayResumeRequest, activeSessionId, clearReplayResumeRequest, setActiveSkills]);

  useEffect(() => {
    if (!activeApprovalThreadId) {
      return;
    }

    let alive = true;

    void (async () => {
      const approvals = await listAgentApprovals(activeApprovalThreadId);
      if (!alive) {
        return;
      }

      setThreadApprovals(activeApprovalThreadId, approvals);
    })();

    return () => {
      alive = false;
    };
  }, [activeApprovalThreadId, setThreadApprovals]);

  useEffect(() => {
    const runtimeThreadId = activeSession?.runtimeThreadId;
    if (!runtimeThreadId) {
      return;
    }

    let alive = true;

    void (async () => {
      const toolCalls = await listRuntimeMcpToolCalls(runtimeThreadId);
      if (!alive) {
        return;
      }

      setRuntimeMcpToolCalls(runtimeThreadId, toolCalls);
    })();

    return () => {
      alive = false;
    };
  }, [activeSession?.runtimeThreadId, setRuntimeMcpToolCalls]);
  useEffect(() => {
    const runtimeThreadId = activeSession?.runtimeThreadId;
    if (!runtimeThreadId) {
      return;
    }

    let alive = true;

    void (async () => {
      const replayEvents = await listRuntimeReplayEvents(runtimeThreadId);
      if (!alive) {
        return;
      }

      setRuntimeReplayEvents(runtimeThreadId, replayEvents);
      if (activeSession?.id) {
        const recoveryState = replayRecoveryController.syncFromEvents(
          activeSession.id,
          runtimeThreadId,
          replayEvents,
        );
        const latestSkillSnapshot = getLatestReplaySkillSnapshot(recoveryState);
        setActiveSkills(
          activeSession.id,
          runtimeSkillRegistryRef.current.restoreActiveSkills(
            activeSession.id,
            latestSkillSnapshot?.activeSkillIds || [],
          ),
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeSession?.id, activeSession?.runtimeThreadId, replayRecoveryController, setActiveSkills, setRuntimeReplayEvents]);
  useEffect(() => {
    if (!activeCheckpointThreadId) {
      setTurnCheckpoints([]);
      return;
    }

    let alive = true;

    void (async () => {
      const checkpoints = await listAgentTurnCheckpoints(activeCheckpointThreadId);
      if (!alive) {
        return;
      }

      setTurnCheckpoints(checkpoints);
    })();

    return () => {
      alive = false;
    };
  }, [activeCheckpointThreadId]);
  const requestRuntimeApproval = useCallback(
    async ({
      threadId,
      actionType,
      riskLevel,
      summary,
      messageId,
      onApprove,
      onDeny,
    }: {
      threadId: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high';
      summary: string;
      messageId?: string | null;
      onApprove: () => Promise<void>;
      onDeny?: () => void | Promise<void>;
    }) => {
      const approval = await requestRuntimeApprovalFlow({
        threadId,
        actionType,
        riskLevel,
        summary,
        messageId,
        onApprove,
        onDeny,
        enqueueAgentApproval,
        enqueueApproval,
        pendingApprovalActions: pendingApprovalActionsRef.current,
      });
      return approval;
    },
    [enqueueAgentApproval, enqueueApproval]
  );
  const handleApproveRuntimeApproval = useCallback(
    async (approvalId: string) => {
      const pendingAction = await resolveRuntimeApproval({
        approvalId,
        status: 'approved',
        pendingApprovalActions: pendingApprovalActionsRef.current,
        resolveStoredApproval,
        resolveAgentApproval,
      });
      if (pendingAction) {
        await pendingAction.onApprove();
      }
    },
    [resolveAgentApproval, resolveStoredApproval]
  );
  const handleDenyRuntimeApproval = useCallback(
    async (approvalId: string) => {
      const pendingAction = await resolveRuntimeApproval({
        approvalId,
        status: 'denied',
        pendingApprovalActions: pendingApprovalActionsRef.current,
        resolveStoredApproval,
        resolveAgentApproval,
      });
      if (pendingAction?.onDeny) {
        await pendingAction.onDeny();
      }
    },
    [resolveAgentApproval, resolveStoredApproval]
  );
  const renderRuntimeApprovalCard = useCallback(
    (message: { id: string; role: StoredChatMessage['role']; projectFileProposal?: ProjectFileProposal }) => {
      if (!activeApprovalThreadId || message.role !== 'assistant' || message.projectFileProposal) {
        return null;
      }

      const messageApprovals = (approvalsByThread[activeApprovalThreadId] || []).filter(
        (approval) => approval.messageId === message.id
      );
      if (messageApprovals.length === 0) {
        return null;
      }

      return (
        <div className="chat-runtime-approval-list">
          {messageApprovals.map((approval) => {
            const actionLabel = approvalActionLabelMap[approval.actionType] || approval.actionType;
            return (
              <section key={approval.id} className={`chat-runtime-approval-card ${approval.riskLevel}`}>
                <div className="chat-runtime-approval-head">
                  <strong>{approval.summary}</strong>
                  <span>{approvalStatusLabelMap[approval.status]}</span>
                </div>
                <div className="chat-runtime-approval-meta">
                  <span>{actionLabel}</span>
                  <span>{approvalRiskLabelMap[approval.riskLevel]}</span>
                </div>
                {approval.status === 'pending' ? (
                  <div className="chat-runtime-approval-actions">
                    <button type="button" onClick={() => void handleApproveRuntimeApproval(approval.id)}>
                      批准执行
                    </button>
                    <button type="button" onClick={() => void handleDenyRuntimeApproval(approval.id)}>
                      拒绝
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      );
    },
    [activeApprovalThreadId, approvalsByThread, handleApproveRuntimeApproval, handleDenyRuntimeApproval]
  );
  const renderStructuredCards = useCallback(
    (message: { structuredCards?: ChatStructuredCard[] }) => {
      if (!message.structuredCards || message.structuredCards.length === 0) {
        return null;
      }

      return (
        <KnowledgeTruthStructuredCards
          cards={message.structuredCards}
          onSelectNextStep={setInput}
        />
      );
    },
    [setInput]
  );

  const executeProjectFileOperations = useCallback(
    async (projectRoot: string, operations: ProjectFileOperation[]) => {
      const result = await executeRuntimeProjectFileOperations({
        projectRoot,
        operations,
        resolveProjectOperationPath,
        isSupportedProjectTextFilePath,
        readProjectTextFile,
        writeProjectTextFile,
        getDirectoryPath,
        invokeTool: async (command, params) =>
          invoke<RuntimeProjectFileToolResponse>(command, {
            params,
          }),
      });

      if (currentProject && result.ok && result.changedPaths.length > 0) {
        emitKnowledgeFilesystemChanged({
          projectId: currentProject.id,
          changedPaths: result.changedPaths,
        });

        if (activeSessionId) {
          const nextActiveSkills = runtimeSkillRegistryRef.current.activateSkillsForPaths(
            activeSessionId,
            result.changedPaths
          );
          setActiveSkills(activeSessionId, nextActiveSkills);
        }
      }

      return result;
    },
    [activeSessionId, currentProject, setActiveSkills]
  );
  const persistTurnCheckpointForRun = useCallback(
    async (input: {
      threadId: string;
      runId: string;
      messageId?: string | null;
      summary: string;
      files: Array<{
        path: string;
        beforeContent?: string | null;
        afterContent?: string | null;
      }>;
    }) => {
      const normalizedFiles = input.files.filter((file) => file.path.trim().length > 0);
      if (normalizedFiles.length === 0) {
        return null;
      }

      const checkpoint = await saveAgentTurnCheckpoint({
        threadId: input.threadId,
        runId: input.runId,
        messageId: input.messageId || null,
        summary: input.summary,
        files: normalizedFiles,
      });

      if (!checkpoint) {
        return null;
      }

      setTurnCheckpoints((current) => {
        const next = [checkpoint, ...current.filter((entry) => entry.id !== checkpoint.id && entry.runId !== checkpoint.runId)];
        next.sort((left, right) => right.updatedAt - left.updatedAt);
        return next;
      });

      return checkpoint;
    },
    []
  );
  const captureCheckpointFilesFromPaths = useCallback(
    async (projectId: string, changedPaths: string[]) => {
      if (changedPaths.length === 0) {
        return [];
      }

      const uniquePaths = Array.from(new Set(changedPaths));
      const projectRoot = await getProjectDir(projectId);
      const results = await Promise.all(
        uniquePaths.map(async (relativePath) => {
          try {
            const absolutePath = resolveProjectOperationPath(projectRoot, relativePath);
            const content = await readProjectTextFile(absolutePath);
            return {
              path: relativePath,
              beforeContent: null,
              afterContent: content,
            };
          } catch {
            return {
              path: relativePath,
              beforeContent: null,
              afterContent: null,
            };
          }
        })
      );

      return results;
    },
    []
  );

  const handleCancelProjectFileProposal = useCallback(
    async (messageId: string) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      await cancelRuntimeProjectFileProposal({
        projectId: currentProject.id,
        sessionId: activeSessionId,
        messageId,
        activeApprovalThreadId,
        approvalsByThread,
        updateMessage,
        resolveStoredApproval,
        clearPendingApprovalAction: (approvalId) => {
          delete pendingApprovalActionsRef.current[approvalId];
        },
        resolveAgentApproval,
      });
    },
    [
      activeApprovalThreadId,
      activeSessionId,
      approvalsByThread,
      currentProject,
      resolveAgentApproval,
      resolveStoredApproval,
      updateMessage,
    ]
  );

  const handleExecuteProjectFileProposal = useCallback(
    async (messageId: string, proposal: ProjectFileProposal) => {
      if (!currentProject || !activeSessionId) {
        return false;
      }
      const targetMessage = activeSession?.messages.find((message) => message.id === messageId) || null;
      const proposalRunId = targetMessage?.runId || createRunId();
      const approvalThreadId = activeSession?.runtimeThreadId || activeSessionId;

      return executeRuntimeApprovedProjectFileProposal({
        projectId: currentProject.id,
        sessionId: activeSessionId,
        messageId,
        proposal,
        activeApprovalThreadId,
        approvalsByThread,
        updateMessage,
        resolveStoredApproval,
        clearPendingApprovalAction: (approvalId) => {
          delete pendingApprovalActionsRef.current[approvalId];
        },
        resolveAgentApproval,
        runId: proposalRunId,
        createActivityEntryId,
        getProjectDir,
        executeProjectFileOperations,
        appendActivityEntry,
        normalizeErrorMessage,
        onExecutionSuccess: async ({ runId, messageId: executedMessageId, summary, fileChanges }) => {
          await persistTurnCheckpointForRun({
            threadId: approvalThreadId,
            runId,
            messageId: executedMessageId,
            summary,
            files: fileChanges,
          });
        },
      });
    },
    [
      activeSession,
      activeApprovalThreadId,
      activeSessionId,
      appendActivityEntry,
      approvalsByThread,
      currentProject,
      executeProjectFileOperations,
      persistTurnCheckpointForRun,
      resolveAgentApproval,
      resolveStoredApproval,
      updateMessage,
    ]
  );

  const renderProjectFileProposal = useCallback(
    (message: { id: string; projectFileProposal?: ProjectFileProposal }) => {
      const proposal = message.projectFileProposal;
      if (!proposal) {
        return null;
      }

      const stageItems = buildProjectFileStageItems(proposal);

      return (
        <section className={`chat-project-file-proposal-card ${proposal.status}`}>
          <div className="chat-project-file-proposal-head">
            <strong>{proposal.summary}</strong>
            <span className={`chat-project-file-proposal-badge ${proposal.status}`}>
              {projectFileProposalStatusLabel[proposal.status]}
            </span>
          </div>
          <div className="chat-project-file-proposal-meta">
            <span>模式：{modeLabelMap[proposal.mode]}</span>
            <span>{proposal.operations.length} 项操作</span>
          </div>
          <div className="chat-project-file-proposal-stages" aria-label="文件操作进度">
            {stageItems.map((stage) => (
              <div key={stage.key} className={`chat-project-file-proposal-stage ${stage.state}`}>
                <span />
                <strong>{stage.label}</strong>
              </div>
            ))}
          </div>
          <div className="chat-project-file-proposal-list">
            {proposal.operations.map((operation) => (
              <div className="chat-project-file-proposal-operation" key={operation.id}>
                <strong>
                  {projectFileOperationTypeLabel[operation.type]}{' '}
                  <code title={operation.targetPath}>{summarizeProjectFilePath(operation.targetPath)}</code>
                </strong>
                <span>{operation.summary || '等待执行'}</span>
                {summarizeProjectFileOperationPreview(operation) ? (
                  <pre>{summarizeProjectFileOperationPreview(operation)}</pre>
                ) : null}
              </div>
            ))}
          </div>
          {resolveProjectFileProposalNote(proposal) ? (
            <div className="chat-project-file-proposal-note">{resolveProjectFileProposalNote(proposal)}</div>
          ) : null}
          <div className="chat-project-file-proposal-actions">
            {proposal.status === 'pending' ? (
              <>
                <button type="button" onClick={() => void handleExecuteProjectFileProposal(message.id, proposal)}>
                  确认写入
                </button>
                <button type="button" onClick={() => void handleCancelProjectFileProposal(message.id)}>
                  取消这次改动
                </button>
              </>
            ) : null}
          </div>
        </section>
      );
    },
    [handleCancelProjectFileProposal, handleExecuteProjectFileProposal]
  );
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth', block: 'end' });
  }, [messages, isLoading, streamingDraftContents]);

  useEffect(
    () => () => {
      if (streamingFlushFrameRef.current !== null) {
        cancelAnimationFrame(streamingFlushFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const viewportClassName = getChatViewportClassName(isCollapsed);
    document.body.classList.remove('ai-chat-sidebar-expanded', 'ai-chat-sidebar-collapsed');
    document.body.classList.add(viewportClassName);

    return () => {
      document.body.classList.remove('ai-chat-sidebar-expanded', 'ai-chat-sidebar-collapsed');
    };
  }, [isCollapsed]);

  useEffect(() => {
    let cancelled = false;

    void loadRuntimeSkillDefinitions({
      projectRoot: currentProject?.vaultPath || null,
    }).then((skills) => {
      if (cancelled) {
        return;
      }

      runtimeSkillRegistryRef.current = createRuntimeSkillRegistry(skills);
    });

    return () => {
      cancelled = true;
    };
  }, [currentProject?.vaultPath]);

  const filteredConfigs = useMemo(() => {
    const keyword = providerSearch.trim().toLowerCase();
    if (!keyword) {
      return aiConfigs;
    }

    return aiConfigs.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.provider.toLowerCase().includes(keyword) ||
        item.baseURL.toLowerCase().includes(keyword) ||
        item.model.toLowerCase().includes(keyword)
    );
  }, [aiConfigs, providerSearch]);

  const selectedRuntimeConfig = useMemo(
    () =>
      (runtimeConfigIdOverride ? aiConfigs.find((item) => item.id === runtimeConfigIdOverride) : null) ||
      aiConfigs.find((item) => item.id === selectedConfigId) ||
      null,
    [aiConfigs, runtimeConfigIdOverride, selectedConfigId]
  );
  const isRuntimeConfigured = Boolean(
    selectedRuntimeConfig && selectedRuntimeConfig.enabled && hasUsableAIConfigEntry(selectedRuntimeConfig)
  );

  const selectedSettingsConfig = useMemo(
    () => aiConfigs.find((item) => item.id === selectedSettingsConfigId) || aiConfigs[0] || null,
    [aiConfigs, selectedSettingsConfigId]
  );

  const selectedSettingsPreset = useMemo(
    () => findPresetByConfig(settingsDraft.provider, settingsDraft.baseURL) || CUSTOM_PROVIDER_PRESET,
    [settingsDraft.baseURL, settingsDraft.provider]
  );

  const selectedProviderTypeOption = useMemo(
    () => AI_PROVIDER_TYPE_OPTIONS.find((item) => item.value === settingsDraft.provider) || AI_PROVIDER_TYPE_OPTIONS[0],
    [settingsDraft.provider]
  );

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const agentAvailability: Record<ChatAgentId, ChatAgentAvailability> = useMemo(() => ({
    claude: {
      ready: Boolean(localAgentSnapshot?.claudeHome.exists || localAgentSnapshot?.claudeSettings.exists),
      title:
        localAgentSnapshot?.claudeHome.exists || localAgentSnapshot?.claudeSettings.exists
          ? 'Claude CLI 已就绪'
          : '未检测到本地 Claude 配置，将回退到内置 AI',
      fallbackMessage:
        localAgentSnapshot?.claudeHome.exists || localAgentSnapshot?.claudeSettings.exists
          ? null
          : '未检测到本地 Claude 配置，已回退到内置 AI。',
    },
    codex: {
      ready: Boolean(localAgentSnapshot?.codexHome.exists),
      title: localAgentSnapshot?.codexHome.exists ? 'Codex Agent 已就绪' : '未检测到本地 Codex 配置，将回退到内置 AI',
      fallbackMessage: localAgentSnapshot?.codexHome.exists ? null : '未检测到本地 Codex 配置，已回退到内置 AI。',
    },
    team: {
      ready: Boolean(
        localAgentSnapshot?.codexHome.exists ||
          localAgentSnapshot?.claudeHome.exists ||
          localAgentSnapshot?.claudeSettings.exists
      ),
      title:
        localAgentSnapshot?.codexHome.exists ||
        localAgentSnapshot?.claudeHome.exists ||
        localAgentSnapshot?.claudeSettings.exists
          ? 'Multi-Agent Team 已就绪'
          : '未检测到可用的本地 Claude/Codex Agent，无法启动 Team',
      fallbackMessage:
        localAgentSnapshot?.codexHome.exists ||
        localAgentSnapshot?.claudeHome.exists ||
        localAgentSnapshot?.claudeSettings.exists
          ? null
          : '未检测到可用的本地 Claude/Codex Agent，已回退到内置 AI。',
    },
    'built-in': {
      ready: true,
      title: 'Built-in AI',
      fallbackMessage: null,
    },
  }), [localAgentSnapshot]);
  const selectedPage = useMemo(
    () => designPages.find((page) => page.id === aiContextState?.selectedPageId) || null,
    [aiContextState?.selectedPageId, designPages]
  );
  const selectedElementLabel = useMemo(
    () => getSelectedElementLabel(previewElements, selectedElementId),
    [previewElements, selectedElementId]
  );
  const visibleContextFiles = useMemo(() => {
    const vaultFiles =
      serverNotes.length > 0
        ? serverNotes.map((note) => ({
            id: note.id,
            path: normalizeReferencePath(note.sourceUrl || `${note.title}.md`),
            title: note.title,
            content: note.bodyMarkdown,
            type: 'md' as const,
            group:
              note.kind === 'design' ? ('design' as const) : note.kind === 'sketch' ? ('sketch' as const) : ('project' as const),
            source: 'user' as const,
            updatedAt: note.updatedAt,
            readableByAI: true,
            summary: summarizeReferenceContent(note.matchSnippet || note.bodyMarkdown, note.title),
            relatedIds: [],
            tags: note.tags.slice(),
          }))
        : requirementDocs.map((doc) => ({
            id: doc.id,
            path: normalizeReferencePath(doc.filePath || `${doc.title}.md`),
            title: doc.title,
            content: doc.content,
            type: 'md' as const,
            group: doc.kind === 'sketch' ? ('sketch' as const) : ('project' as const),
            source: doc.sourceType === 'ai' ? ('ai' as const) : ('user' as const),
            updatedAt: doc.updatedAt,
            readableByAI: true,
            summary: doc.summary || summarizeReferenceContent(doc.content, doc.title),
            relatedIds: (doc.relatedIds || []).slice(),
            tags: (doc.tags || []).slice(),
          }));

    const generatedContextFiles = generatedFiles
      .filter((file) => file.language === 'html' || file.language === 'md')
      .map((file) => ({
        id: `generated:${file.path}`,
        path: normalizeReferencePath(file.path),
        title: file.path.split('/').pop() || file.path,
        content: file.content,
        type: file.language === 'html' ? ('html' as const) : ('md' as const),
        group: file.category === 'design' ? ('design' as const) : ('project' as const),
        source: 'ai' as const,
        updatedAt: file.updatedAt,
        readableByAI: true,
        summary: file.summary || summarizeReferenceContent(file.content, file.path),
        relatedIds: (file.relatedRequirementIds || []).slice(),
        tags: (file.tags || []).slice(),
      }));

    return [...vaultFiles, ...generatedContextFiles];
  }, [generatedFiles, requirementDocs, serverNotes]);
  const visibleContextFileId = aiContextState?.selectedKnowledgeEntryId || activeKnowledgeFileId || null;
  const displayContextFile = useMemo(
    () => visibleContextFiles.find((entry) => entry.id === visibleContextFileId) || null,
    [visibleContextFileId, visibleContextFiles]
  );
  const currentFileLabel = displayContextFile ? `Current file / ${displayContextFile.title}` : null;
  const vaultLabel = projectRoot ? `Vault / ${projectRoot}` : null;
  const contextSnapshot = useMemo(
    () =>
      buildChatContextSnapshot({
        scene: aiContextState?.scene || 'vault',
        pageTitle: selectedPage?.name || null,
        selectedElementLabel,
        currentFileLabel,
        vaultLabel,
      }),
    [aiContextState?.scene, currentFileLabel, selectedElementLabel, selectedPage?.name, vaultLabel]
  );
  const explicitReferenceLabels = useMemo(() => {
    const labels: string[] = [];
    const selectedReferenceIds = aiContextState?.selectedReferenceFileIds || [];
    const visibleFileById = new Map(visibleContextFiles.map((file) => [file.id, file]));

    for (const referenceId of selectedReferenceIds) {
      const file = visibleFileById.get(referenceId);
      if (file) {
        labels.push(`Reference / ${file.title}`);
      }
    }

    if (aiContextState?.referenceScopeMode === 'directory' && aiContextState.selectedReferenceDirectory) {
      labels.push(`Reference dir / ${aiContextState.selectedReferenceDirectory}`);
    } else if (aiContextState?.referenceScopeMode === 'all') {
      labels.push('Reference scope / all visible files');
    } else if (aiContextState?.referenceScopeMode === 'open-tabs' && (aiContextState.openedKnowledgeEntryIds?.length || 0) > 0) {
      labels.push(`Reference scope / ${aiContextState.openedKnowledgeEntryIds.length} open tabs`);
    }

    return labels;
  }, [
    aiContextState?.openedKnowledgeEntryIds,
    aiContextState?.referenceScopeMode,
    aiContextState?.selectedReferenceDirectory,
    aiContextState?.selectedReferenceFileIds,
    visibleContextFiles,
  ]);
  const resolvedReferenceContextFiles = useMemo(() => {
    const visibleFileById = new Map(visibleContextFiles.map((file) => [file.id, file]));
    const scopedReferenceIds = resolveReferenceScopeSelection({
      mode: aiContextState?.referenceScopeMode || 'current',
      currentFileIds: visibleContextFileId ? [visibleContextFileId] : [],
      openTabFileIds: aiContextState?.openedKnowledgeEntryIds || [],
      directoryPath: aiContextState?.selectedReferenceDirectory || null,
      allFiles: visibleContextFiles.map((file) => ({
        id: file.id,
        path: file.path,
        readableByAI: file.readableByAI,
      })),
    });
    const selectedReferenceIds = aiContextState?.selectedReferenceFileIds || [];

    return Array.from(new Set([...selectedReferenceIds, ...scopedReferenceIds]))
      .map((referenceId) => visibleFileById.get(referenceId) || null)
      .filter((file): file is NonNullable<typeof file> => Boolean(file));
  }, [
    aiContextState?.openedKnowledgeEntryIds,
    aiContextState?.referenceScopeMode,
    aiContextState?.selectedReferenceDirectory,
    aiContextState?.selectedReferenceFileIds,
    visibleContextFileId,
    visibleContextFiles,
  ]);
  const explicitSelectedReferenceFiles = useMemo(() => {
    const selectedReferenceIds = aiContextState?.selectedReferenceFileIds || [];
    const visibleFileById = new Map(visibleContextFiles.map((file) => [file.id, file]));

    return selectedReferenceIds
      .map((referenceId) => visibleFileById.get(referenceId) || null)
      .filter((file): file is NonNullable<typeof file> => Boolean(file));
  }, [aiContextState?.selectedReferenceFileIds, visibleContextFiles]);
  const filteredReferenceSearchFiles = useMemo(() => {
    if (!referenceSearchOpen) {
      return [];
    }

    const normalizedQuery = normalizeSearchToken(referenceSearchQuery);
    const selectedReferenceIds = new Set(aiContextState?.selectedReferenceFileIds || []);
    const candidates = visibleContextFiles.filter(
      (file) => file.readableByAI && !selectedReferenceIds.has(file.id)
    );

    if (!normalizedQuery) {
      return candidates.slice(0, 8);
    }

    return candidates
      .filter((file) => {
        const haystack = normalizeSearchToken(`${file.title} ${file.path} ${file.summary || ''}`);
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [
    aiContextState?.selectedReferenceFileIds,
    referenceSearchOpen,
    referenceSearchQuery,
    visibleContextFiles,
  ]);
  const visibleContextFileById = useMemo(
    () => new Map(visibleContextFiles.map((file) => [file.id, file])),
    [visibleContextFiles]
  );
  const previewReferenceContext = useMemo(
    () =>
      resolvedReferenceContextFiles.length > 0
        ? buildReferencePromptContext({
            userInput: input.trim() || '继续当前对话',
            selectedFiles: resolvedReferenceContextFiles,
          })
        : null,
    [input, resolvedReferenceContextFiles]
  );

  const currentContextUsage = useMemo(() => {
    const previewPrompt = buildDirectChatPrompt({
      userInput: input.trim() || '继续当前对话',
      currentProjectName: currentProject?.name,
      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
      skillIntent: null,
      conversationHistory: activeSession?.messages || [],
      referenceContext: previewReferenceContext,
      contextLabels: [
        selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
        contextSnapshot.primaryLabel,
        contextSnapshot.secondaryLabel,
        contextSnapshot.currentFileLabel,
        contextSnapshot.vaultLabel,
        ...explicitReferenceLabels,
      ].filter((item): item is string => Boolean(item)),
    });

    return buildContextUsageSummary(
      [previewPrompt.systemPrompt, previewPrompt.prompt],
      selectedRuntimeConfig?.contextWindowTokens || 258000
    );
  }, [
    contextSnapshot.currentFileLabel,
    contextSnapshot.primaryLabel,
    contextSnapshot.secondaryLabel,
    contextSnapshot.vaultLabel,
    currentProject?.name,
    explicitReferenceLabels,
    input,
    activeSession?.messages,
    previewReferenceContext,
    selectedRuntimeConfig,
  ]);
  const selectedAgent = useMemo(
    () => CHAT_AGENTS.find((agent) => agent.id === selectedChatAgentId) || CHAT_AGENTS[0],
    [selectedChatAgentId]
  );
  const preferredForkAgentId = useMemo<Extract<ChatAgentId, 'claude' | 'codex'> | null>(() => {
    if (
      (selectedChatAgentId === 'claude' || selectedChatAgentId === 'codex') &&
      agentAvailability[selectedChatAgentId].ready
    ) {
      return selectedChatAgentId;
    }

    if (agentAvailability.codex.ready) {
      return 'codex';
    }

    if (agentAvailability.claude.ready) {
      return 'claude';
    }

    return null;
  }, [agentAvailability, selectedChatAgentId]);
  const latestActivityEntry = activityEntries[0] || null;
  const activityEntriesByRunId = useMemo(() => groupActivityEntriesByRunId(activityEntries), [activityEntries]);
  const turnCheckpointsByRunId = useMemo(() => groupTurnCheckpointsByRunId(turnCheckpoints), [turnCheckpoints]);
  const latestCheckpointRunId = turnCheckpoints[0]?.runId || null;
  const expandedDiffTarget = useMemo(() => {
    if (!expandedRunDiffKey) {
      return null;
    }

    const separatorIndex = expandedRunDiffKey.indexOf('::');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      runId: expandedRunDiffKey.slice(0, separatorIndex),
      path: expandedRunDiffKey.slice(separatorIndex + 2),
    };
  }, [expandedRunDiffKey]);
  const selectedChangedPathHistory = useMemo(
    () =>
      expandedDiffTarget
        ? turnCheckpoints.filter((entry) =>
            entry.filesChanged.some((file) => file.path === expandedDiffTarget.path)
          )
        : [],
    [expandedDiffTarget, turnCheckpoints]
  );
  const pendingApprovalCount = pendingApprovals.length;
  const latestTurnSessionStatus = latestTurnSession?.status || null;
  const runStateLabel =
    latestTurnSessionStatus === 'planning'
      ? 'Planning'
      : latestTurnSessionStatus === 'waiting_approval'
        ? 'Approval required'
        : latestTurnSessionStatus === 'executing'
          ? 'Executing'
          : latestTurnSessionStatus === 'resumable'
            ? 'Resume ready'
            : latestTurnSessionStatus === 'completed'
              ? 'Completed'
              : latestTurnSessionStatus === 'failed'
                ? 'Failed'
                : pendingApprovalCount > 0
      ? 'Approval required'
      : isLoading
        ? 'Running'
        : latestActivityEntry?.type === 'failed'
          ? 'Failed'
          : 'Ready';
  const runStateTone =
    latestTurnSessionStatus === 'waiting_approval' || latestTurnSessionStatus === 'resumable'
      ? 'warning'
      : latestTurnSessionStatus === 'failed'
        ? 'error'
        : latestTurnSessionStatus === 'completed'
          ? 'success'
          : pendingApprovalCount > 0
      ? 'warning'
      : isLoading
        ? 'running'
        : latestActivityEntry?.type === 'failed'
          ? 'error'
          : 'success';
  const clearStreamingDraft = useCallback((messageId: string) => {
    if (!(messageId in streamingDraftBufferRef.current)) {
      return;
    }

    const nextDrafts = { ...streamingDraftBufferRef.current };
    delete nextDrafts[messageId];
    streamingDraftBufferRef.current = nextDrafts;
    if (streamingFlushFrameRef.current !== null) {
      cancelAnimationFrame(streamingFlushFrameRef.current);
      streamingFlushFrameRef.current = null;
    }
    setStreamingDraftContents(nextDrafts);
  }, []);
  const pushStreamingDraft = useCallback((messageId: string, content: string) => {
    streamingDraftBufferRef.current = {
      ...streamingDraftBufferRef.current,
      [messageId]: content,
    };

    if (streamingFlushFrameRef.current !== null) {
      return;
    }

    streamingFlushFrameRef.current = requestAnimationFrame(() => {
      streamingFlushFrameRef.current = null;
      setStreamingDraftContents({ ...streamingDraftBufferRef.current });
    });
  }, []);
  const loadCheckpointDiff = useCallback(
    async (runId: string, relativePath: string) => {
      if (!activeCheckpointThreadId) {
        return;
      }
      const diffKey = buildRunDiffKey(runId, relativePath);
      const existingDiffState = runDiffsByKey[diffKey];

      if (expandedRunDiffKey === diffKey) {
        setExpandedRunDiffKey(null);
        return;
      }

      setExpandedRunDiffKey(diffKey);
      if (existingDiffState?.loading || existingDiffState?.diff || existingDiffState?.error) {
        return;
      }

      setRunDiffsByKey((current) => ({
        ...current,
        [diffKey]: {
          loading: true,
        },
      }));

      try {
        const diff = await getAgentTurnCheckpointDiff({
          threadId: activeCheckpointThreadId,
          runId,
          path: relativePath,
        });
        setRunDiffsByKey((current) => ({
          ...current,
          [diffKey]: {
            loading: false,
            diff,
          },
        }));
      } catch (error) {
        setRunDiffsByKey((current) => ({
          ...current,
          [diffKey]: {
            loading: false,
            error: normalizeErrorMessage(error),
          },
        }));
      }
    },
    [activeCheckpointThreadId, expandedRunDiffKey, runDiffsByKey]
  );
  const handleRewindRun = useCallback(
    async (checkpoint: AgentTurnCheckpointRecord) => {
      if (!currentProject || !activeSessionId || !activeCheckpointThreadId || isRewindingRunId) {
        return;
      }

      setIsRewindingRunId(checkpoint.runId);
      setRewindError('');

      try {
        const projectRoot = await getProjectDir(currentProject.id);
        const result = await rewindAgentTurn({
          threadId: activeCheckpointThreadId,
          runId: checkpoint.runId,
          projectRoot,
        });
        const removedRunIds = new Set(result.removedRunIds);
        const activeMessages = activeSession?.messages || [];
        const nextMessages = activeMessages.filter((message) => !message.runId || !removedRunIds.has(message.runId));
        replaceSessionMessages(currentProject.id, activeSessionId, nextMessages);
        setActivityEntries(
          currentProject.id,
          activityEntries.filter((entry) => !removedRunIds.has(entry.runId))
        );
        setTurnCheckpoints((current) => current.filter((entry) => !removedRunIds.has(entry.runId)));
        setRunDiffsByKey((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([key]) => !Array.from(removedRunIds).some((runId) => key.startsWith(`${runId}::`)))
          )
        );
        pruneThreadHistorySince(activeSessionId, checkpoint.createdAt);
        setRuntimeRecoveryState(
          activeSessionId,
          buildReplayRecoveryState(
            activeCheckpointThreadId,
            useAgentRuntimeStore.getState().replayEventsByThread[activeSessionId] || []
          )
        );
        if (expandedDiffTarget && removedRunIds.has(expandedDiffTarget.runId)) {
          setExpandedRunDiffKey(null);
        }
        if (result.restoredPaths.length > 0) {
          emitKnowledgeFilesystemChanged({
            projectId: currentProject.id,
            changedPaths: result.restoredPaths,
          });
        }
        setRewindTargetRunId(null);
      } catch (error) {
        setRewindError(normalizeErrorMessage(error));
      } finally {
        setIsRewindingRunId(null);
      }
    },
    [
      activeCheckpointThreadId,
      activeSession?.messages,
      activeSessionId,
      activityEntries,
      currentProject,
      expandedDiffTarget,
      isRewindingRunId,
      pruneThreadHistorySince,
      replaceSessionMessages,
      setActivityEntries,
      setRuntimeRecoveryState,
    ]
  );
  const renderRunSummaryCard = useCallback(
    (message: StoredChatMessage) => {
      if (message.role !== 'assistant' || !message.runId) {
        return null;
      }

      const checkpoint = turnCheckpointsByRunId[message.runId];
      if (checkpoint) {
        const isLatestCheckpoint = checkpoint.runId === latestCheckpointRunId;
        return (
          <section className="chat-run-summary-card">
            <div className="chat-run-summary-head">
              <div className="chat-run-summary-title">
                <strong>{checkpoint.filesChanged.length} 个文件已变更</strong>
                <span>
                  {isLatestCheckpoint ? '当前轮改动' : '历史轮改动'}
                  {' · '}+{checkpoint.insertions} / -{checkpoint.deletions}
                </span>
              </div>
              <div className="chat-run-summary-actions">
                <button
                  type="button"
                  className="chat-run-summary-action"
                  onClick={() => {
                    setRewindError('');
                    setRewindTargetRunId(checkpoint.runId);
                  }}
                  disabled={Boolean(isRewindingRunId)}
                >
                  {isRewindingRunId === checkpoint.runId
                    ? '回退中...'
                    : isLatestCheckpoint
                      ? '撤销本轮改动'
                      : '回到这轮之前'}
                </button>
              </div>
            </div>
            <div className="chat-run-summary-list">
              {checkpoint.filesChanged.map((file) => {
                const diffKey = buildRunDiffKey(checkpoint.runId, file.path);
                const diffState = runDiffsByKey[diffKey];
                const isExpanded = expandedRunDiffKey === diffKey;

                return (
                  <div key={`${checkpoint.runId}:${file.path}`} className="chat-run-summary-file">
                    <button
                      type="button"
                      className="chat-run-summary-item"
                      onClick={() => void loadCheckpointDiff(checkpoint.runId, file.path)}
                    >
                      <strong title={file.path}>{summarizeProjectFilePath(file.path)}</strong>
                      <span>
                        {file.changeType === 'created'
                          ? '新建'
                          : file.changeType === 'deleted'
                            ? '删除'
                            : '修改'}
                        {' · '}+{file.insertions} / -{file.deletions}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="chat-run-summary-diff">
                        <div className="chat-run-summary-diff-head">
                          <strong>Diff</strong>
                          <span>
                            {diffState?.loading
                              ? '加载中'
                              : diffState?.error
                                ? '读取失败'
                                : diffState?.diff
                                  ? `${diffState.diff.changeType} · +${diffState.diff.insertions} / -${diffState.diff.deletions}`
                                  : '暂无数据'}
                          </span>
                        </div>
                        {diffState?.loading ? (
                          <div className="chat-run-summary-empty">正在读取这次改动的 diff...</div>
                        ) : diffState?.error ? (
                          <div className="chat-run-summary-empty">{diffState.error}</div>
                        ) : (
                          <pre className="chat-run-summary-diff-content">
                            {diffState?.diff?.diff || '这次改动没有可展示的 diff。'}
                          </pre>
                        )}
                        <div className="chat-run-summary-history">
                          <div className="chat-run-summary-diff-head">
                            <strong>该文件历史</strong>
                            <span>{selectedChangedPathHistory.length} 条</span>
                          </div>
                          <div className="chat-run-summary-history-list">
                            {selectedChangedPathHistory
                              .filter((entry) => entry.filesChanged.some((changedFile) => changedFile.path === file.path))
                              .map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className={`chat-file-preview-history-item ${entry.runId === checkpoint.runId ? 'active' : ''}`}
                                  onClick={() => void loadCheckpointDiff(entry.runId, file.path)}
                                >
                                  <strong>{entry.summary}</strong>
                                  <span>
                                    {formatTimestamp(entry.createdAt)}
                                    {' · '}+{entry.insertions} / -{entry.deletions}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {rewindError && rewindTargetRunId === checkpoint.runId ? (
              <div className="chat-run-summary-error">{rewindError}</div>
            ) : null}
          </section>
        );
      }

      const relatedEntries = activityEntriesByRunId[message.runId] || EMPTY_ACTIVITY_ENTRIES;
      const changedPaths = Array.from(new Set(relatedEntries.flatMap((entry) => entry.changedPaths)));

      if (changedPaths.length === 0) {
        return null;
      }

      return (
        <section className="chat-run-summary-card">
          <div className="chat-run-summary-head">
            <strong>{changedPaths.length} 个文件已变更</strong>
            <span>
              {relatedEntries.some((entry) => entry.type === 'failed') ? '包含失败记录' : '可查看文件与记录'}
            </span>
          </div>
          <div className="chat-run-summary-list">
            {changedPaths.map((changedPath) => {
              const latestForPath = relatedEntries.find((entry) => entry.changedPaths.includes(changedPath)) || null;
              return (
                <button
                  key={changedPath}
                  type="button"
                  className="chat-run-summary-item"
                  onClick={() => void loadCheckpointDiff(message.runId!, changedPath)}
                >
                  <strong title={changedPath}>{summarizeProjectFilePath(changedPath)}</strong>
                  <span>{latestForPath?.summary || '查看当前内容与更改记录'}</span>
                </button>
              );
            })}
          </div>
        </section>
      );
    },
    [
      activityEntriesByRunId,
      expandedRunDiffKey,
      isRewindingRunId,
      latestCheckpointRunId,
      loadCheckpointDiff,
      rewindError,
      rewindTargetRunId,
      runDiffsByKey,
      selectedChangedPathHistory,
      turnCheckpointsByRunId,
    ]
  );
  const renderToolExecutionCard = useCallback((message: StoredChatMessage) => {
    const toolCalls = message.toolCalls || [];
    const teamRun = message.teamRun || null;

    if (toolCalls.length === 0 && !teamRun) {
      return null;
    }

    if (teamRun) {
      return (
        <section className="chat-tool-trace-card">
          <div className="chat-tool-trace-head">
            <strong>多 Agent 执行轨迹</strong>
            <span>{teamRun.phases.length} phases / {teamRun.members.length} agents</span>
          </div>
          <div className="chat-tool-trace-list">
            {teamRun.phases.map((phase) => {
              const phaseMembers = teamRun.members.filter((member) => member.phaseId === phase.id);
              return (
                <details key={phase.id} className="chat-tool-trace-phase" open={phase.status === 'running'}>
                  <summary>
                    <strong>{phase.title}</strong>
                    <span>{phase.status}</span>
                  </summary>
                  <div className="chat-tool-trace-members">
                    {phaseMembers.map((member) => (
                      <details key={member.id} className="chat-tool-trace-member">
                        <summary>
                          <strong>{member.title}</strong>
                          <span>{member.agentId} / {member.status}</span>
                        </summary>
                        <pre>{member.error || member.result || 'No output yet.'}</pre>
                      </details>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      );
    }

    const completedCount = toolCalls.filter((toolCall) => toolCall.status === 'completed').length;
    const failedCount = toolCalls.filter((toolCall) => toolCall.status === 'failed').length;
    const blockedCount = toolCalls.filter((toolCall) => toolCall.status === 'blocked').length;

    return (
      <section className="chat-tool-trace-card">
        <div className="chat-tool-trace-head">
          <strong>工具执行轨迹</strong>
          <span>
            {toolCalls.length} steps
            {' · '}完成 {completedCount}
            {failedCount > 0 ? ` · 失败 ${failedCount}` : ''}
            {blockedCount > 0 ? ` · 阻止 ${blockedCount}` : ''}
          </span>
        </div>
        <div className="chat-tool-trace-list">
          {toolCalls.map((toolCall, index) => (
            <details
              key={toolCall.id}
              className={`chat-tool-trace-step ${toolCall.status}`}
              open={toolCall.status === 'running' || toolCall.status === 'failed'}
            >
              <summary>
                <strong>{index + 1}. {toolCall.name}</strong>
                <span>{toolCall.status === 'completed' ? '已完成' : toolCall.status === 'failed' ? '失败' : toolCall.status === 'blocked' ? '已阻止' : '执行中'}</span>
              </summary>
              <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
              {toolCall.resultPreview ? (
                <pre className="chat-tool-trace-result">{toolCall.resultPreview}</pre>
              ) : null}
            </details>
          ))}
        </div>
      </section>
    );
  }, []);
  const syncModelCatalog = useCallback((nextProvider: AIProviderType, nextBaseURL: string, models: string[]) => {
    const key = buildProviderKey(nextProvider, nextBaseURL);
    setModelCatalog((current) => {
      const merged = mergeModelCandidates(current[key] || [], models);
      const previous = current[key] || [];
      if (merged.length === previous.length && merged.every((item, index) => item === previous[index])) {
        return current;
      }

      return {
        ...current,
        [key]: merged,
      };
    });
  }, []);

  useEffect(() => {
    if (!selectedRuntimeConfig) {
      return;
    }

    const matched = findPresetByConfig(selectedRuntimeConfig.provider, selectedRuntimeConfig.baseURL) || CUSTOM_PROVIDER_PRESET;
    syncModelCatalog(selectedRuntimeConfig.provider, selectedRuntimeConfig.baseURL, [...matched.models, selectedRuntimeConfig.model]);
  }, [selectedRuntimeConfig, syncModelCatalog]);

  useEffect(() => {
    if (selectedSettingsConfigId && !aiConfigs.some((item) => item.id === selectedSettingsConfigId)) {
      setSelectedSettingsConfigId(aiConfigs[0]?.id || null);
      return;
    }

    if (!selectedSettingsConfigId && aiConfigs[0]?.id) {
      setSelectedSettingsConfigId(aiConfigs[0].id);
    }
  }, [aiConfigs, selectedSettingsConfigId]);

  useEffect(() => {
    setSettingsDraft(buildSettingsDraft(selectedSettingsConfig));
  }, [selectedSettingsConfig]);

  const settingsModelOptions = useMemo(
    () =>
      mergeModelCandidates(
        selectedSettingsPreset.models,
        modelCatalog[buildProviderKey(settingsDraft.provider, settingsDraft.baseURL)] || [],
        [settingsDraft.model]
      ),
    [modelCatalog, selectedSettingsPreset.models, settingsDraft.baseURL, settingsDraft.model, settingsDraft.provider]
  );

  const selectedProviderListMode = useMemo(
    () => listModelsSupportMode(settingsDraft.provider),
    [settingsDraft.provider]
  );

  const selectedProviderEndpoint = useMemo(
    () => buildProviderEndpointPreview(settingsDraft.provider, settingsDraft.baseURL),
    [settingsDraft.baseURL, settingsDraft.provider]
  );

  const isSettingsDraftComplete = hasUsableAIConfigEntry(settingsDraft);
  const isSettingsDraftSelected = settingsDraft.id === selectedConfigId;
  const customHeadersJsonValid = !settingsDraft.customHeaders.trim()
    || (() => { try { JSON.parse(settingsDraft.customHeaders); return true; } catch { return false; } })();

  const handleTestConnection = useCallback(async () => {
    setTestState('testing');
    setTestMessage('');

    const result = await aiService.testConnection(settingsDraft);
    setTestState(result.ok ? 'success' : 'error');
    setTestMessage(result.message);
  }, [settingsDraft]);

  const handleLoadModels = useCallback(async () => {
    setIsLoadingModels(true);
    setTestState('idle');
    setTestMessage('');

    try {
      if (selectedProviderListMode === 'preset-only') {
        const fallbackModels = mergeModelCandidates(selectedSettingsPreset.models, [settingsDraft.model]);
        syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, fallbackModels);
        setTestState('success');
        setTestMessage('当前 provider 不支持远程拉取模型列表，已回退到内置模型候选。');
        return;
      }

      const list = await aiService.listModels(settingsDraft);
      syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, list);
      setSettingsDraft((current) => ({
        ...current,
        model: current.model.trim() && list.includes(current.model) ? current.model : list[0] || current.model,
      }));
      setTestState('success');
      setTestMessage(`已加载 ${list.length} 个模型。`);
    } catch (error) {
      setTestState('error');
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingModels(false);
    }
  }, [selectedProviderListMode, selectedSettingsPreset.models, settingsDraft, syncModelCatalog]);

  const handleApplySettings = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    updateConfig(settingsDraft.id, {
      name: settingsDraft.name.trim() || '未命名 AI',
      provider: settingsDraft.provider,
      apiKey: settingsDraft.apiKey,
      baseURL: settingsDraft.baseURL,
      model: settingsDraft.model,
      contextWindowTokens: settingsDraft.contextWindowTokens,
      customHeaders: settingsDraft.customHeaders,
    });
    syncModelCatalog(settingsDraft.provider, settingsDraft.baseURL, settingsModelOptions);
    setTestState('success');
    setTestMessage(`已保存 ${settingsDraft.name.trim() || '当前 AI 配置'}。`);
  }, [settingsDraft, settingsModelOptions, syncModelCatalog, updateConfig]);

  const handleToggleEnabled = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    if (!settingsDraft.enabled && !isSettingsDraftComplete) {
      setTestState('error');
      setTestMessage('请先补全 API Key 和模型，再启用该 AI。');
      return;
    }

    if (!settingsDraft.enabled) {
      updateConfig(settingsDraft.id, {
        name: settingsDraft.name.trim() || '未命名 AI',
        provider: settingsDraft.provider,
        apiKey: settingsDraft.apiKey,
        baseURL: settingsDraft.baseURL,
        model: settingsDraft.model,
        contextWindowTokens: settingsDraft.contextWindowTokens,
        customHeaders: settingsDraft.customHeaders,
      });
    }

    const changed = setConfigEnabled(settingsDraft.id, !settingsDraft.enabled);
    if (!changed) {
      setTestState('error');
      setTestMessage('当前配置还不完整，不能启用。');
      return;
    }

    setTestState('success');
    setTestMessage(!settingsDraft.enabled ? '已启用当前 AI。' : '已关闭当前 AI。');
  }, [isSettingsDraftComplete, setConfigEnabled, settingsDraft, updateConfig]);

  const handleCreateConfig = useCallback(() => {
    const nextId = addConfig({
      name: `AI 配置 ${aiConfigs.length + 1}`,
      provider: settingsDraft.provider,
      baseURL: settingsDraft.baseURL || getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset),
      model: settingsDraft.model,
      contextWindowTokens: settingsDraft.contextWindowTokens,
    });
    setSelectedSettingsConfigId(nextId);
    setTestState('idle');
    setTestMessage('');
  }, [addConfig, aiConfigs.length, selectedSettingsPreset, settingsDraft.baseURL, settingsDraft.model, settingsDraft.provider]);

  const handleDeleteConfig = useCallback(() => {
    if (!settingsDraft.id || aiConfigs.length <= 1) {
      setTestState('error');
      setTestMessage(aiConfigs.length <= 1 ? '至少保留一个 AI 配置。' : '');
      return;
    }

    deleteConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage('已删除当前 AI 配置。');
  }, [aiConfigs.length, deleteConfig, settingsDraft.id]);

  const handleSelectConfig = useCallback(() => {
    if (!settingsDraft.id) {
      return;
    }

    selectConfig(settingsDraft.id);
    setTestState('success');
    setTestMessage(`已切换到 "${settingsDraft.name || '当前 AI 配置'}"。`);
  }, [selectConfig, settingsDraft.id, settingsDraft.name]);

  const handleExportConfigs = useCallback(async () => {
    try {
      const exportData = {
        version: 2,
        configs: aiConfigs.map(({ id, ...rest }) => rest),
      };
      const json = JSON.stringify(exportData, null, 2);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(json);
      } else {
        throw new Error('剪贴板不可用');
      }
      setTestState('success');
      setTestMessage('已复制 JSON 到剪贴板。');
    } catch {
      setTestState('error');
      setTestMessage('导出失败：无法访问剪贴板。');
    }
  }, [aiConfigs]);

  const handleImportConfigs = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonImportText);
      const importEntries = Array.isArray(parsed)
        ? parsed
        : parsed.configs;
      if (!Array.isArray(importEntries) || importEntries.length === 0) {
        setTestState('error');
        setTestMessage('JSON 格式无效：缺少 configs 数组。');
        return;
      }

      let importedCount = 0;
      for (const entry of importEntries) {
        if (entry.provider && entry.apiKey) {
          addConfig({
            name: entry.name || `导入 ${entry.provider}`,
            provider: entry.provider,
            apiKey: entry.apiKey,
            baseURL: entry.baseURL,
            model: entry.model,
            contextWindowTokens: entry.contextWindowTokens,
            customHeaders: entry.customHeaders || '',
            enabled: false,
          });
          importedCount++;
        }
      }

      setShowJsonImport(false);
      setJsonImportText('');
      setTestState('success');
      setTestMessage(`成功导入 ${importedCount} 个 AI 配置。`);
    } catch (err) {
      console.warn('AI config import failed:', err);
      setTestState('error');
      setTestMessage('JSON 格式无效，请检查后重试。');
    }
  }, [addConfig, jsonImportText]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setShowApiKey(false);
    setShowJsonImport(false);
    setJsonImportText('');
  }, []);

  const closeSkillsModal = useCallback(() => {
    setIsSkillsModalOpen(false);
  }, []);

  const handleCreateSession = useCallback(() => {
    if (!currentProject) {
      return;
    }

    const session = createWelcomeSession(currentProject.id, currentProject.name, runtimeProviderId);
    upsertSession(currentProject.id, session);
    setActiveSession(currentProject.id, session.id);
    setInput('');
    setShowHistoryMenu(false);
  }, [currentProject, runtimeProviderId, setActiveSession, upsertSession]);

  const submitPrompt = useCallback(
    async (promptValue: string) => {
      if (!promptValue.trim() || isLoading || !currentProject) {
        return;
      }

      let targetSessionId = activeSessionId;
      let targetSession = activeSession;
      if (!targetSessionId) {
        const session = createWelcomeSession(currentProject.id, currentProject.name, runtimeProviderId);
        upsertSession(currentProject.id, session);
        setActiveSession(currentProject.id, session.id);
        targetSessionId = session.id;
        targetSession = session;
      }

      const rawContent = promptValue.trim();
      const routeableSkills = runtimeSkillRegistryRef.current
        .listAllSkills()
        .filter((skill) => skill.userInvocable);
      const skillIntent: SkillIntent | null = resolveSkillIntent(rawContent, routeableSkills);
      const resolvedSkill = skillIntent?.skill || null;
      const mcpCommand = parseRuntimeMcpCommand(rawContent, runtimeMcpServers);
      const effectiveChatAgentId =
        selectedChatAgentId !== 'built-in' && !agentAvailability[selectedChatAgentId].ready
          ? 'built-in'
          : selectedChatAgentId;
      const fallbackToBuiltInMessage =
        selectedChatAgentId !== effectiveChatAgentId ? agentAvailability[selectedChatAgentId].fallbackMessage : null;
      const cleanedContent = skillIntent?.cleanedInput.trim()
        ? skillIntent.cleanedInput.trim()
        : rawContent;
      const isTaskAuthorizedWriteRequest = detectTaskAuthorizedProjectWriteIntent(cleanedContent);
      const isProjectFileWriteRequest = detectProjectFileWriteIntent(cleanedContent) || isTaskAuthorizedWriteRequest;
      const isProjectFileReadRequest = detectProjectFileReadIntent(cleanedContent);
      const runId = createRunId();
      const userMessage = createStoredChatMessage('user', rawContent, 'default', { runId });

      appendMessage(currentProject.id, targetSessionId, userMessage);
      if (fallbackToBuiltInMessage) {
        setSelectedChatAgentId('built-in');
        appendMessage(
          currentProject.id,
          targetSessionId,
          createStoredChatMessage('system', fallbackToBuiltInMessage)
        );
      }

      if (!targetSession || targetSession.title === '新对话') {
        renameSession(currentProject.id, targetSessionId, summarizeSessionTitle(rawContent));
      }

      const assistantMessage = createStoredChatMessage('assistant', '正在思考...', 'default', { runId });
      appendMessage(currentProject.id, targetSessionId, assistantMessage);
      setIsLoading(true);

      if (selectedRuntimeConfig && !providerExecutionMode) {
        aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
      }

      let runtimeThreadId = targetSession?.runtimeThreadId || null;
      let runtimeStoreThreadId = targetSessionId;
      let runtimeTurnSessionId: string | null = null;
      let executionController: ReturnType<typeof createRuntimeReplayExecutionController> | null = null;

      try {
        const projectMemoryEntries = (memory?.memoryEntries || []).map((entry) =>
          buildProjectMemoryEntry(entry)
        );
        setRuntimeMemoryEntries(currentProject.id, projectMemoryEntries);

        if (!runtimeThreadId) {
          const persistedThread = await persistRuntimeThread({
            projectId: currentProject.id,
            title: targetSession?.title || '新对话',
            providerId: runtimeProviderId,
          });
          runtimeThreadId = persistedThread.id;
          bindRuntimeThread(currentProject.id, targetSessionId, runtimeProviderId, runtimeThreadId);
        }

        recordRuntimeThread(currentProject.id, {
          id: targetSessionId,
          providerId: runtimeProviderId,
          title: targetSession?.title || summarizeSessionTitle(rawContent),
          createdAt: targetSession?.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
        setRuntimeBinding(runtimeStoreThreadId, {
          providerId: runtimeProviderId,
          configId: selectedRuntimeConfig?.id || null,
          externalThreadId: runtimeThreadId,
        });
        const replayThreadId = runtimeThreadId || targetSessionId;
        appendRuntimeTimelineEvent(runtimeStoreThreadId, {
          id: createRuntimeEventId('user'),
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          summary: `User: ${buildSessionPreview(cleanedContent)}`,
          createdAt: Date.now(),
        });
        const runtimeSkillThreadId = runtimeStoreThreadId;
        const discoverableSkillsForTurn = runtimeSkillRegistryRef.current
          .listSkills(runtimeSkillThreadId)
          .filter((skill) => skill.modelInvocable);
        let activeSkillsForTurn = activeSkillsByThread[runtimeSkillThreadId] || [];
        if (resolvedSkill) {
          runtimeSkillRegistryRef.current.activateSkill(runtimeSkillThreadId, resolvedSkill);
          activeSkillsForTurn = runtimeSkillRegistryRef.current.listActiveSkills(runtimeSkillThreadId);
          setActiveSkills(runtimeSkillThreadId, activeSkillsForTurn);
        }
        const visibleSkillsForTurn =
          activeSkillsForTurn.length > 0
            ? [
                ...activeSkillsForTurn,
                ...discoverableSkillsForTurn.filter(
                  (skill) => !activeSkillsForTurn.some((activeSkill) => activeSkill.id === skill.id)
                ),
              ]
            : discoverableSkillsForTurn;
        const forkSkillsForTurn = visibleSkillsForTurn.filter(
          (skill) => skill.executionContext === 'fork' && skill.modelInvocable
        );
        const shouldRunForkSkill = forkSkillsForTurn.length > 0;
        const preferredForkSkillAgent = (
          forkSkillsForTurn.find((skill) => skill.agent === 'codex' || skill.agent === 'claude')?.agent || null
        ) as ChatAgentId | null;
        const forkAgentId = shouldRunForkSkill
          ? preferredForkSkillAgent || preferredForkAgentId
          : null;
        const requiresForkAgentExecution = shouldRunForkSkill && Boolean(forkAgentId);
        const runtimeExecutionAgentId: ChatAgentId =
          requiresForkAgentExecution && forkAgentId ? forkAgentId : effectiveChatAgentId;
        const runtimeVisibleSkillsForTurn =
          shouldRunForkSkill && !forkAgentId
            ? visibleSkillsForTurn.map((skill) =>
                skill.executionContext === 'fork'
                  ? {
                      ...skill,
                      executionContext: 'inline' as const,
                    }
                  : skill
              )
            : visibleSkillsForTurn;
        executionController = createRuntimeReplayExecutionController({
          turnId: `turn_${runId}`,
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          prompt: cleanedContent,
          replayStartPayload: buildRuntimeReplayTurnStartPayload({
            rawPrompt: rawContent,
            normalizedPrompt: cleanedContent,
            skillIntent,
            activeSkillIds: runtimeVisibleSkillsForTurn.map((skill) => skill.id),
          }),
          createdAt: Date.now(),
          submitTurn: submitRuntimeTurn,
          startRun: startRuntimeRun,
          finishRun: finishRuntimeRun,
          failRun: failRuntimeRun,
          runtimeStoreThreadId,
          replayThreadId,
          appendAndSyncReplayEvent: replayRecoveryController.appendAndSync,
        });
        const invokedRuntimeSkill = resolvedSkill
          ? runtimeVisibleSkillsForTurn.find((skill) => skill.id === resolvedSkill) ||
            routeableSkills.find((skill) => skill.id === resolvedSkill) ||
            null
          : null;
        const inlineModelOverride =
          runtimeExecutionAgentId === 'built-in' && invokedRuntimeSkill?.model
            ? invokedRuntimeSkill.model
            : null;
        if (shouldRunForkSkill && !forkAgentId) {
          appendMessage(
            currentProject.id,
            targetSessionId,
            createStoredChatMessage(
              'system',
              '检测到需要隔离执行的 skill，但当前没有可用本地 Agent，已临时回退为 inline 执行。'
            )
          );
        }
        if (runtimeExecutionAgentId === 'built-in' && !isRuntimeConfigured) {
          appendMessage(
            currentProject.id,
            targetSessionId,
            createStoredChatMessage('system', normalizeErrorMessage(buildAIConfigurationError()), 'error')
          );
          return;
        }
        const conversationHistory = targetSession?.messages || activeSession?.messages || [];
        const agentInstructions = [
          contextSnapshot.primaryLabel,
          contextSnapshot.secondaryLabel,
          contextSnapshot.currentFileLabel,
          contextSnapshot.vaultLabel,
          ...explicitReferenceLabels,
        ].filter((item): item is string => Boolean(item));
        const contextLabels = [
          selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
          ...agentInstructions,
        ].filter((item): item is string => Boolean(item));
        const agentContextSnapshot = buildAgentContext({
          projectId: currentProject.id,
          projectName: currentProject.name,
          threadId: targetSessionId,
          userInput: cleanedContent,
          contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
          conversationHistory,
          instructions: agentInstructions,
          referenceFiles: resolvedReferenceContextFiles.map((file) => ({
            path: file.path,
            summary: file.summary,
            content: file.content || file.summary || file.title,
          })),
          memoryEntries: projectMemoryEntries,
          activeSkills: runtimeVisibleSkillsForTurn,
        });
        setThreadContext(targetSessionId, agentContextSnapshot);
        await executionController.start();
        if (!executionController) {
          throw new Error('Failed to initialize runtime execution controller.');
        }
        const activeExecutionController = executionController;
        runtimeTurnSessionId = `turn_${runId}`;
        upsertTurnSession(
          runtimeStoreThreadId,
          createEmptyAgentTurnSession({
            id: runtimeTurnSessionId,
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            userPrompt: cleanedContent,
          })
        );
        const patchCurrentTurnSession = (updater: (session: AgentTurnSession) => AgentTurnSession) => {
          patchTurnSession(runtimeStoreThreadId, runtimeTurnSessionId!, updater);
        };
        const markTurnExecutionStep = (input: {
          title: string;
          status: 'running' | 'completed' | 'failed' | 'blocked';
          userVisibleDetail: string;
          resultSummary: string;
          toolName?: string | null;
        }) => {
          patchCurrentTurnSession((session) =>
            input.status === 'running'
              ? applyRuntimeTurnExecuting({
                  session,
                  turnId: runtimeTurnSessionId!,
                  title: input.title,
                  detail: input.userVisibleDetail,
                  toolName: input.toolName,
                })
              : input.status === 'completed'
                ? applyRuntimeTurnCompleted({
                    session,
                    turnId: runtimeTurnSessionId!,
                    finalContent: input.userVisibleDetail,
                  })
                : input.status === 'failed'
                  ? applyRuntimeTurnFailed({
                      session,
                      turnId: runtimeTurnSessionId!,
                      message: input.userVisibleDetail,
                    })
                  : applyRuntimeTurnBlocked({
                      session,
                      turnId: runtimeTurnSessionId!,
                      reason: input.userVisibleDetail,
                    })
          );
        };
        const markTurnExecuting = (title: string, detail: string, toolName: string | null = null) => {
          patchCurrentTurnSession((session) =>
            applyRuntimeTurnExecuting({
              session,
              turnId: runtimeTurnSessionId!,
              title,
              detail,
              toolName,
            })
          );
        };
        const completeTurnSession = async (finalContent: string) => {
          patchCurrentTurnSession((session) =>
            applyRuntimeTurnCompleted({
              session,
              turnId: runtimeTurnSessionId!,
              finalContent,
            })
          );
          await activeExecutionController.completeWithReplay(finalContent);
        };
        const failTurnSession = async (message: string) => {
          patchCurrentTurnSession((session) =>
            applyRuntimeTurnFailed({
              session,
              turnId: runtimeTurnSessionId!,
              message,
            })
          );
          await activeExecutionController.failWithReplay(message);
        };
        const blockTurnSession = async (reason: string, replaySummary: string, actionLabel: string | null = null) => {
          patchCurrentTurnSession((session) =>
            applyRuntimeTurnBlocked({
              session,
              turnId: runtimeTurnSessionId!,
              reason,
              actionLabel,
            })
          );
          await activeExecutionController.completeWithReplay(replaySummary);
        };
        patchCurrentTurnSession((session) => applyRuntimeTurnClassifying(session));
        const turnModeDecision = decideAgentTurnMode({
          prompt: cleanedContent,
          suggestedPlanMode: Boolean(skillIntent),
          riskyWriteDetected: isProjectFileWriteRequest || runtimeExecutionAgentId !== 'built-in',
          bashDetected: Boolean(mcpCommand),
          multiStepDetected: Boolean(mcpCommand || isProjectFileWriteRequest || runtimeExecutionAgentId !== 'built-in'),
        });
        if (turnModeDecision.mode === 'plan_then_execute') {
          patchCurrentTurnSession((session) => ({
            ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
            plan: buildRuntimeTurnReviewPlan({
              turnId: runtimeTurnSessionId!,
              summary:
                runtimeExecutionAgentId !== 'built-in'
                  ? `Review and run ${runtimeExecutionAgentId === 'codex' ? 'the Codex agent' : 'the local agent'} request`
                  : isProjectFileWriteRequest
                    ? 'Plan project file changes before execution'
                    : mcpCommand
                      ? `Review MCP tool call: ${mcpCommand.toolName}`
                      : 'Plan the current request before execution',
              reason: turnModeDecision.reason,
              riskLevel:
                runtimeExecutionAgentId !== 'built-in' || isProjectFileWriteRequest
                  ? 'high'
                  : mcpCommand
                    ? 'medium'
                    : 'low',
              executeKind:
                runtimeExecutionAgentId !== 'built-in'
                  ? 'tool'
                  : isProjectFileWriteRequest
                    ? 'file'
                    : 'reply',
              needsApproval: runtimeExecutionAgentId !== 'built-in' || isProjectFileWriteRequest,
            }),
          }));
        }

        if (mcpCommand) {
          markTurnExecuting(
            `Run MCP tool: ${mcpCommand.toolName}`,
            `Preparing ${mcpCommand.serverId}/${mcpCommand.toolName}`,
            mcpCommand.toolName
          );
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId('mcp-start'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: `MCP started: ${mcpCommand.serverId}/${mcpCommand.toolName}`,
            createdAt: Date.now(),
          });

          const mcpResult = await executeRuntimeMcpTurn({
            command: mcpCommand,
            servers: runtimeMcpServers,
            threadId: runtimeThreadId || targetSessionId,
            invokeTool: invokeRuntimeMcpTool,
          });

          if (mcpResult.status === 'failed') {
            const message = mcpResult.message;
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
              ...currentMessage,
              role: 'system',
              tone: 'error',
              content: message,
            }));
            await failTurnSession(message);
            appendRuntimeTimelineEvent(runtimeStoreThreadId, {
              id: createRuntimeEventId('mcp-error'),
              threadId: runtimeStoreThreadId,
              providerId: runtimeProviderId,
              summary: `Error: ${message}`,
              createdAt: Date.now(),
            });
            return;
          }

          const { toolCall } = mcpResult;
          appendRuntimeMcpToolCall(toolCall.threadId, toolCall);
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
            ...currentMessage,
            role: toolCall.error ? 'system' : currentMessage.role,
            tone: toolCall.error ? 'error' : currentMessage.tone,
            content: mcpResult.content,
          }));
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId(toolCall.error ? 'mcp-error' : 'mcp-complete'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: mcpResult.timelineSummary,
            createdAt: Date.now(),
          });
          await persistRuntimeTimelineEvent({
            threadId: replayThreadId,
            providerId: runtimeProviderId,
            summary: mcpResult.replaySummary,
          });
          await replayRecoveryController.appendAndSync({
            runtimeStoreThreadId,
            replayThreadId,
            eventType: toolCall.error ? 'mcp_failed' : 'mcp_completed',
            payload: mcpResult.replayPayload,
          });
          if (toolCall.error) {
            await failTurnSession(toolCall.error);
          } else {
            await completeTurnSession(mcpResult.content);
          }
          return;
        }

        if (skillIntent?.skill === 'requirements') {
          setRawRequirementInput(cleanedContent);
        }

        if (
          skillIntent &&
          (skillIntent.package === 'requirements' ||
            skillIntent.package === 'prototype' ||
            skillIntent.package === 'page')
        ) {
          if (selectedRuntimeConfig) {
            aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
          }

          const targetWorkflowPackage = skillIntent.package;

          const workflowCompletion = await executeRuntimeWorkflowPackage({
            targetPackage: targetWorkflowPackage,
            runWorkflowPackage: runAIWorkflowPackage,
            getLatestRun: () => useAIWorkflowStore.getState().projects[currentProject.id]?.runs[0] || null,
          });

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: workflowCompletion.finalContent,
          }));

          appendActivityEntry(currentProject.id, {
            id: createActivityEntryId(),
            runId,
            type: 'run-summary',
            summary: workflowCompletion.activitySummary,
            changedPaths: [],
            runtime: 'built-in',
            skill: resolvedSkill,
            createdAt: Date.now(),
          });
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId('workflow'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: workflowCompletion.timelineSummary,
            createdAt: Date.now(),
          });
          await completeTurnSession(workflowCompletion.finalContent);
          return;
        }

        if (runtimeExecutionAgentId === 'built-in' && (isProjectFileWriteRequest || isProjectFileReadRequest)) {
          const projectRoot = await getProjectDir(currentProject.id);

          if (selectedRuntimeConfig) {
            aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
          }

          if (isProjectFileReadRequest && !isProjectFileWriteRequest) {
            markTurnExecuting('Read project files', 'Loading requested project files for the current turn.');
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: '正在读取项目文件...',
            }));

            const finalContent = await executeRuntimeProjectFileRead({
              userInput: cleanedContent,
              projectName: currentProject.name || '当前项目',
              projectRoot,
              allowedTools: READ_ONLY_CHAT_TOOLS,
              readFiles: (payload) => aiService.chatWithTools(payload),
            });

            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: finalContent,
            }));

            appendRuntimeTimelineEvent(runtimeStoreThreadId, {
              id: createRuntimeEventId('read'),
              threadId: runtimeStoreThreadId,
              providerId: runtimeProviderId,
              summary: `Read project files: ${buildSessionPreview(cleanedContent)}`,
              createdAt: Date.now(),
            });
            await completeTurnSession(finalContent);
            return;
          }

          patchCurrentTurnSession((session) => ({
            ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
            plan: buildRuntimeProjectFilePlan({
              turnId: runtimeTurnSessionId || targetSessionId,
              operationMode: projectFileOperationMode,
              summary: buildSessionPreview(cleanedContent) || 'Plan project file changes',
            }),
          }));

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: buildProjectFilePlanningStatusMessage(projectFileOperationMode),
            structuredCards: undefined,
            projectFileProposal: undefined,
          }));

          const planningResult = await executeRuntimeProjectFilePlanning({
            userInput: cleanedContent,
            conversationHistory,
            projectName: currentProject.name || '当前项目',
            projectRoot,
            allowedTools: READ_ONLY_CHAT_TOOLS,
            executePlanning: ({ prompt, systemPrompt, allowedTools }) =>
              aiService.chatWithTools({ prompt, systemPrompt, allowedTools }),
            parsePlan: parseProjectFileOperationsPlan,
          });

          if (planningResult.status !== 'ready') {
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: '还需要你补充一点信息，才能继续这次文件操作。',
              structuredCards: buildProjectFileClarificationCards(planningResult.message),
              projectFileProposal: undefined,
            }));
            appendRuntimeTimelineEvent(runtimeStoreThreadId, {
              id: createRuntimeEventId('file-plan'),
              threadId: runtimeStoreThreadId,
              providerId: runtimeProviderId,
              summary: 'File operation plan needs clarification',
              createdAt: Date.now(),
            });
            await completeTurnSession(planningResult.message || '文件操作计划需要补充信息。');
            return;
          }
          const plan = planningResult.plan;

          const approvalThreadId = runtimeThreadId || targetSessionId;
          const {
            proposal: rawProposal,
            approvalActionType,
            riskLevel,
            decision,
          } = prepareProjectFileProposalFlow({
            proposalId: createProjectFileProposalId(),
            mode: projectFileOperationMode,
            plan,
            sandboxPolicy,
          });
          const nextProposal = resolveProjectFileProposalPresentation(rawProposal, decision);
          const projectFileDecisionState = buildProjectFileDecisionState({
            decision,
            summary: nextProposal.summary,
          });
          const projectFileDecisionFeedback = resolveRuntimeProjectFileDecisionFeedback({
            decisionState: projectFileDecisionState,
            summary: nextProposal.summary,
          });
          patchCurrentTurnSession((session) => ({
            ...session,
            plan: applyRuntimeProjectFileProposalToPlan({
              plan: session.plan,
              proposal: nextProposal,
              riskLevel,
              approvalStatus: projectFileDecisionState?.approvalStatus,
            }),
            updatedAt: Date.now(),
          }));

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: nextProposal.assistantMessage,
            structuredCards: undefined,
            projectFileProposal: nextProposal,
          }));

          await handleRuntimeProjectFileDecision({
            decision,
            onBlocked: async () => {
              await denyRuntimeProjectFileApproval({
                threadId: approvalThreadId,
                actionType: approvalActionType,
                riskLevel,
                summary: nextProposal.summary,
                messageId: assistantMessage.id,
                enqueueAgentApproval,
                enqueueApproval,
                resolveStoredApproval,
                resolveAgentApproval,
              });
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('file-blocked'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: projectFileDecisionFeedback.timelineSummary,
                createdAt: Date.now(),
              });
              await blockTurnSession(
                projectFileDecisionFeedback.blockedReason,
                projectFileDecisionFeedback.replaySummary,
                projectFileDecisionFeedback.blockedActionLabel
              );
            },
            onApprovalRequired: async () => {
              patchCurrentTurnSession((session) => ({
                ...reduceAgentTurnSession(session, { type: 'plan_waiting_approval' }),
                plan: updateRuntimeProjectFilePlanApprovalStatus(
                  session.plan,
                  projectFileDecisionState?.approvalStatus || 'pending'
                ),
              }));
              await requestRuntimeProjectFileApproval({
                threadId: approvalThreadId,
                actionType: approvalActionType,
                riskLevel,
                summary: nextProposal.summary,
                messageId: assistantMessage.id,
                onApprove: async () => {
                  markTurnExecuting('Apply approved file changes', nextProposal.summary);
                  const didExecute = await handleExecuteProjectFileProposal(assistantMessage.id, nextProposal);
                  patchCurrentTurnSession((session) =>
                    didExecute
                      ? reduceAgentTurnSession(session, { type: 'execution_completed' })
                      : reduceAgentTurnSession(session, {
                          type: 'execution_failed',
                          reason: 'Approved file changes failed.',
                        })
                  );
                },
                onDeny: async () => {
                  await handleCancelProjectFileProposal(assistantMessage.id);
                  patchCurrentTurnSession((session) => ({
                    ...reduceAgentTurnSession(session, {
                      type: 'execution_blocked',
                      reason: projectFileDecisionFeedback.deniedReason,
                      actionLabel: projectFileDecisionFeedback.deniedActionLabel,
                    }),
                    plan: updateRuntimeProjectFilePlanApprovalStatus(session.plan, 'denied'),
                  }));
                },
                enqueueAgentApproval,
                enqueueApproval,
                pendingApprovalActions: pendingApprovalActionsRef.current,
              });
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('file-manual'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: projectFileDecisionFeedback.timelineSummary,
                createdAt: Date.now(),
              });
              await activeExecutionController.completeWithReplay(projectFileDecisionFeedback.replaySummary);
            },
            onAutoExecute: async () => {
              markTurnExecuting('Apply project file changes', nextProposal.summary);
              const didExecute = await executeRuntimeApprovedProjectFileProposal({
                projectId: currentProject.id,
                sessionId: targetSessionId,
                messageId: assistantMessage.id,
                proposal: nextProposal,
                activeApprovalThreadId,
                approvalsByThread,
                updateMessage,
                resolveStoredApproval,
                clearPendingApprovalAction: (approvalId) => {
                  delete pendingApprovalActionsRef.current[approvalId];
                },
                resolveAgentApproval,
                runId,
                createActivityEntryId,
                getProjectDir,
                executeProjectFileOperations,
                appendActivityEntry,
                normalizeErrorMessage,
                onExecutionSuccess: async ({ runId: executedRunId, messageId, summary, fileChanges }) => {
                  await persistTurnCheckpointForRun({
                    threadId: approvalThreadId,
                    runId: executedRunId,
                    messageId,
                    summary,
                    files: fileChanges,
                  });
                },
              });

              if (!didExecute) {
                await failTurnSession('Project file changes failed.');
                return;
              }

              const autoExecuteSummary = buildRuntimeProjectFileAutoExecuteSummary(
                buildSessionPreview(cleanedContent) || cleanedContent
              );
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('file-auto'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: autoExecuteSummary,
                createdAt: Date.now(),
              });
              await completeTurnSession(autoExecuteSummary);
            },
          });
          return;
        }

        if (runtimeExecutionAgentId !== 'built-in') {
          const localExecutionAgentId = runtimeExecutionAgentId;
          const preferredTeamAgent =
            preferredForkAgentId === 'claude' || preferredForkAgentId === 'codex'
              ? preferredForkAgentId
              : agentAvailability.codex.ready
                ? 'codex'
                : 'claude';
          const localAgentConversationHistory = shouldRunForkSkill ? [] : conversationHistory;
          const localAgentSkillsForTurn = shouldRunForkSkill ? forkSkillsForTurn : runtimeVisibleSkillsForTurn;
          const approvalThreadId = runtimeThreadId || targetSessionId;
          const localAgentFlow = prepareRuntimeLocalAgentFlow({
            agentId: localExecutionAgentId,
            sandboxPolicy,
          });
          const localAgentDecisionState =
            localAgentFlow.decision === 'auto-execute' ? null : buildRuntimeLocalAgentDecisionState(localAgentFlow);
          const localAgentDecisionFeedback = resolveRuntimeLocalAgentDecisionFeedback({
            decisionState: localAgentDecisionState,
            summary: localAgentFlow.summary,
          });
          patchCurrentTurnSession((session) => ({
            ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
            plan: buildRuntimeLocalAgentPlan({
              turnId: runtimeTurnSessionId,
              flow: localAgentFlow,
            }),
          }));
          const executeLocalAgentFlow = async (finalizeReplay = true) => {
            markTurnExecuting(
              localExecutionAgentId === 'team'
                ? 'Run multi-agent team'
                : shouldRunForkSkill
                ? `Run forked skill with ${localExecutionAgentId === 'codex' ? 'Codex' : 'local'} agent`
                : localExecutionAgentId === 'codex'
                  ? 'Run Codex agent'
                  : 'Run local agent',
              localAgentFlow.summary
            );
            const projectRoot = await getProjectDir(currentProject.id);
            const runPrompt = async ({
              agent,
              projectRoot,
              prompt,
            }: {
              agent: string;
              projectRoot: string;
              prompt: string;
            }) =>
              invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
                params: {
                  agent,
                  projectRoot,
                  prompt,
                },
              });
            const executionResult =
              localExecutionAgentId === 'team'
                ? await (async () => {
                    const teamResult = await runAgentTeamTurn({
                      projectId: currentProject.id,
                      projectName: currentProject.name,
                      threadId: targetSessionId,
                      turnId: runtimeTurnSessionId || `turn_${runId}`,
                      userInput: cleanedContent,
                      projectRoot,
                      preferredAgent: preferredTeamAgent,
                      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
                      conversationHistory: localAgentConversationHistory,
                      agentInstructions,
                      referenceFiles: resolvedReferenceContextFiles.map((file) => ({
                        path: file.path,
                        summary: file.summary,
                        content: file.content || file.summary || file.title,
                      })),
                      memoryEntries: projectMemoryEntries,
                      onTeamRunUpdate: (teamRun) => {
                        upsertTeamRun(targetSessionId, teamRun);
                      },
                      runPrompt,
                    });

                    return {
                      status: 'completed' as const,
                      finalContent: teamResult.finalContent,
                      teamRun: teamResult.teamRun,
                      successOutcome: {
                        activityEntry: buildRuntimeChangedPathActivityEntry({
                          createId: createActivityEntryId,
                          runId,
                          content: teamResult.finalContent,
                          runtime: 'local',
                          skill: resolvedSkill,
                        }),
                        timelineSummary: `Team completed: ${teamResult.teamRun.phases.length} phases / ${teamResult.teamRun.members.length} agents`,
                        replaySummary: teamResult.finalContent,
                      },
                      completedStep: {
                        title: 'Completed team turn',
                        status: 'completed' as const,
                        userVisibleDetail: teamResult.finalContent,
                        resultSummary: teamResult.finalContent,
                      },
                    };
                  })()
                : await runRuntimeLocalAgentExecution({
                    projectId: currentProject.id,
                    projectName: currentProject.name,
                    threadId: targetSessionId,
                    userInput: cleanedContent,
                    contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
                    conversationHistory: localAgentConversationHistory,
                    agentInstructions,
                    referenceFiles: resolvedReferenceContextFiles,
                    memoryEntries: projectMemoryEntries,
                    activeSkills: localAgentSkillsForTurn,
                    skillIntent,
                    contextLabels,
                    agentId: localExecutionAgentId,
                    projectRoot,
                    runPrompt,
                    createActivityId: createActivityEntryId,
                    runId,
                    skill: resolvedSkill,
                    normalizeErrorMessage,
                    buildErrorPreview: buildSessionPreview,
                  });

            if (executionResult.status === 'completed') {
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                ...message,
                content: executionResult.finalContent,
                teamRun: ('teamRun' in executionResult ? executionResult.teamRun : null) as StoredChatMessage['teamRun'],
              }));
              if (executionResult.successOutcome.activityEntry) {
                appendActivityEntry(currentProject.id, executionResult.successOutcome.activityEntry);
                const checkpointFiles = await captureCheckpointFilesFromPaths(
                  currentProject.id,
                  executionResult.successOutcome.activityEntry.changedPaths
                );
                await persistTurnCheckpointForRun({
                  threadId: approvalThreadId,
                  runId: executionResult.successOutcome.activityEntry.runId,
                  messageId: assistantMessage.id,
                  summary: executionResult.successOutcome.activityEntry.summary,
                  files: checkpointFiles,
                });
              }
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('local-agent'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: executionResult.successOutcome.timelineSummary,
                createdAt: Date.now(),
              });
              if (finalizeReplay) {
                await completeTurnSession(executionResult.successOutcome.replaySummary);
              } else {
                markTurnExecutionStep(executionResult.completedStep);
              }
              return;
            }

            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
              ...currentMessage,
              role: 'system',
              tone: 'error',
              content: executionResult.message,
            }));
            appendActivityEntry(currentProject.id, executionResult.failureOutcome.activityEntry);
            if (finalizeReplay) {
              await failTurnSession(executionResult.failureOutcome.replaySummary);
            } else {
              markTurnExecutionStep(executionResult.failedStep);
            }
            appendRuntimeTimelineEvent(runtimeStoreThreadId, {
              id: createRuntimeEventId('local-agent-error'),
              threadId: runtimeStoreThreadId,
              providerId: runtimeProviderId,
              summary: executionResult.failureOutcome.timelineSummary,
              createdAt: Date.now(),
            });
          };

          await handleRuntimeLocalAgentDecision({
            flow: localAgentFlow,
            onBlocked: async () => {
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                ...message,
                role: 'system',
                tone: 'error',
                content: localAgentDecisionState?.messageContent || '已阻止本地 Agent 执行。',
              }));
              await denyRuntimeLocalAgentApproval({
                flow: localAgentFlow,
                threadId: approvalThreadId,
                messageId: assistantMessage.id,
                enqueueAgentApproval,
                enqueueApproval,
                resolveStoredApproval,
                resolveAgentApproval,
              });
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('local-agent-blocked'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: localAgentDecisionFeedback.timelineSummary,
                createdAt: Date.now(),
              });
              await blockTurnSession(
                localAgentDecisionFeedback.blockedReason,
                localAgentDecisionFeedback.replaySummary,
                localAgentDecisionFeedback.blockedActionLabel
              );
            },
            onApprovalRequired: async () => {
              patchCurrentTurnSession((session) => ({
                ...reduceAgentTurnSession(session, { type: 'plan_waiting_approval' }),
                plan: updateRuntimeLocalAgentPlanApprovalStatus(
                  session.plan,
                  localAgentDecisionFeedback.approvalStatus
                ),
              }));
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                ...message,
                content: localAgentDecisionFeedback.messageContent,
              }));
              await requestRuntimeLocalAgentApproval({
                flow: localAgentFlow,
                threadId: approvalThreadId,
                messageId: assistantMessage.id,
                onApprove: async () => {
                  await executeLocalAgentFlow(false);
                },
                onDeny: async () => {
                  updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                    ...message,
                    role: 'system',
                    tone: 'error',
                    content: localAgentDecisionFeedback.deniedMessageContent,
                  }));
                  patchCurrentTurnSession((session) => ({
                    ...reduceAgentTurnSession(session, {
                      type: 'execution_blocked',
                      reason: localAgentDecisionFeedback.deniedReason,
                      actionLabel: localAgentDecisionFeedback.deniedActionLabel,
                    }),
                    plan: updateRuntimeLocalAgentPlanApprovalStatus(session.plan, 'denied'),
                  }));
                },
                enqueueAgentApproval,
                enqueueApproval,
                pendingApprovalActions: pendingApprovalActionsRef.current,
              });
              appendRuntimeTimelineEvent(runtimeStoreThreadId, {
                id: createRuntimeEventId('local-agent-approval'),
                threadId: runtimeStoreThreadId,
                providerId: runtimeProviderId,
                summary: localAgentDecisionFeedback.timelineSummary,
                createdAt: Date.now(),
              });
              await activeExecutionController.completeWithReplay(localAgentDecisionFeedback.replaySummary);
            },
            onAutoExecute: async () => {
              await executeLocalAgentFlow();
            },
          });
          return;
        }

        markTurnExecuting('Run built-in agent turn', buildSessionPreview(cleanedContent));
        const projectRoot = await getProjectDir(currentProject.id);
        const toolExecutor = new ToolExecutor(projectRoot);
        setThreadToolCalls(targetSessionId, []);
        const streamingAssembler = createRuntimeStreamingMessageAssembler();
        const agentTurn = await executeRuntimeBuiltInAgentTurn({
          projectId: currentProject.id,
          projectName: currentProject.name,
          threadId: targetSessionId,
          projectRoot,
          userInput: cleanedContent,
          rawUserInput: rawContent,
          contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
          conversationHistory,
          agentInstructions,
          referenceFiles: resolvedReferenceContextFiles,
          memoryEntries: projectMemoryEntries,
          activeSkills: runtimeVisibleSkillsForTurn,
          skillIntent,
          contextLabels,
          allowedTools: READ_ONLY_CHAT_TOOLS,
          onToolCallsChange: (toolCalls) => {
            setThreadToolCalls(targetSessionId, toolCalls);
          },
          onModelEvent: (event) => {
            pushStreamingDraft(assistantMessage.id, streamingAssembler.append(event));
          },
          executeModel: (prompt, systemPrompt, onEvent) =>
            executeRuntimePrompt({
              providerId: runtimeProviderId,
              sessionId: targetSessionId,
              config:
                selectedRuntimeConfig && inlineModelOverride
                  ? {
                      ...selectedRuntimeConfig,
                      model: inlineModelOverride,
                    }
                  : selectedRuntimeConfig,
              systemPrompt,
              prompt,
              onEvent,
            }),
          executeTool: (call) => toolExecutor.execute(call),
        });

        const normalizedFinalContent = agentTurn.finalContent;
        clearStreamingDraft(assistantMessage.id);
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
          ...message,
          content: normalizedFinalContent,
          toolCalls: agentTurn.toolCalls,
        }));
        setThreadMemoryCandidates(targetSessionId, agentTurn.memoryCandidates);
        const checkpointFilesFromToolCalls = extractCheckpointFilesFromToolCalls(agentTurn.toolCalls);
        const activityEntry = buildRuntimeChangedPathActivityEntry({
          createId: createActivityEntryId,
          runId,
          content: normalizedFinalContent,
          changedPaths: checkpointFilesFromToolCalls.map((file) => file.path),
          skill: resolvedSkill,
        });
        if (activityEntry) {
          appendActivityEntry(currentProject.id, activityEntry);
          await persistTurnCheckpointForRun({
            threadId: replayThreadId,
            runId: activityEntry.runId,
            messageId: assistantMessage.id,
            summary: activityEntry.summary,
            files:
              checkpointFilesFromToolCalls.length > 0
                ? checkpointFilesFromToolCalls
                : await captureCheckpointFilesFromPaths(currentProject.id, activityEntry.changedPaths),
          });
        } else if (checkpointFilesFromToolCalls.length > 0) {
          await persistTurnCheckpointForRun({
            threadId: replayThreadId,
            runId,
            messageId: assistantMessage.id,
            summary: `更新了 ${checkpointFilesFromToolCalls.map((file) => file.path).join('、')}`,
            files: checkpointFilesFromToolCalls,
          });
        }
        await persistRuntimeTimelineEvent({
          threadId: replayThreadId,
          providerId: runtimeProviderId,
          summary: `Assistant: ${buildSessionPreview(normalizedFinalContent)}`,
        });
        appendRuntimeTimelineEvent(runtimeStoreThreadId, {
          id: createRuntimeEventId('assistant'),
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          summary: `Assistant: ${buildSessionPreview(normalizedFinalContent)}`,
          createdAt: Date.now(),
        });
        await completeTurnSession(normalizedFinalContent);
      } catch (error) {
        const message = normalizeErrorMessage(error);
        clearStreamingDraft(assistantMessage.id);
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
          ...currentMessage,
          role: 'system',
          tone: 'error',
          content: message,
        }));
        appendActivityEntry(currentProject.id, {
          id: createActivityEntryId(),
          runId,
          type: 'failed',
          summary: message,
          changedPaths: [],
          runtime: effectiveChatAgentId === 'built-in' ? 'built-in' : 'local',
          skill: resolvedSkill,
          createdAt: Date.now(),
        });
        if (executionController) {
          if (runtimeTurnSessionId) {
            patchTurnSession(runtimeStoreThreadId, runtimeTurnSessionId, (session) =>
              reduceAgentTurnSession(session, { type: 'execution_failed', reason: message })
            );
          }
          await executionController.failWithReplay(message);
        } else {
          failRuntimeRun(runtimeStoreThreadId, message);
        }
        appendRuntimeTimelineEvent(runtimeStoreThreadId, {
          id: createRuntimeEventId('error'),
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          summary: `Error: ${buildSessionPreview(message)}`,
          createdAt: Date.now(),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSession,
      activeSessionId,
      activeSkillsByThread,
      agentAvailability,
      appendActivityEntry,
      appendMessage,
      appendRuntimeMcpToolCall,
      appendRuntimeTimelineEvent,
      bindRuntimeThread,
      clearStreamingDraft,
      pushStreamingDraft,
      contextSnapshot.currentFileLabel,
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      contextSnapshot.vaultLabel,
      currentProject,
      executeRuntimePrompt,
      failRuntimeRun,
      explicitReferenceLabels,
      finishRuntimeRun,
      isLoading,
      isRuntimeConfigured,
      memory,
      persistRuntimeThread,
      persistRuntimeTimelineEvent,
      providerExecutionMode,
      replayRecoveryController,
      recordRuntimeThread,
      resolvedReferenceContextFiles,
      renameSession,
      selectedChatAgentId,
      selectedRuntimeConfig,
      setActiveSkills,
      setRuntimeBinding,
      setThreadContext,
      setThreadMemoryCandidates,
      setRuntimeMemoryEntries,
      setRuntimeReplayEvents,
      startRuntimeRun,
      setActiveSession,
      executeProjectFileOperations,
      handleCancelProjectFileProposal,
      handleExecuteProjectFileProposal,
      projectFileOperationMode,
      requestRuntimeApproval,
      resolveStoredApproval,
      runtimeMcpServers,
      runtimeProviderId,
      sandboxPolicy,
      setRawRequirementInput,
      setSelectedChatAgentId,
      submitRuntimeTurn,
      updateMessage,
      upsertTeamRun,
      upsertSession,
    ]
  );

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!input.trim()) {
        return;
      }

      const nextInput = input;
      setReferenceSearchOpen(false);
      setReferenceSearchQuery('');
      setReferenceTriggerIndex(-1);
      setInput('');
      await submitPrompt(nextInput);
    },
    [input, submitPrompt]
  );

  useEffect(() => {
    const handleExternalCommand = (event: Event) => {
      const detail = (event as CustomEvent<AIChatCommandDetail>).detail;
      if (!detail?.prompt) {
        return;
      }

      if (detail.autoSubmit) {
        setInput('');
        void submitPrompt(detail.prompt);
        return;
      }

      setInput(detail.prompt);
    };

    window.addEventListener(AI_CHAT_COMMAND_EVENT, handleExternalCommand as EventListener);
    return () => {
      window.removeEventListener(AI_CHAT_COMMAND_EVENT, handleExternalCommand as EventListener);
    };
  }, [submitPrompt]);

  useEffect(() => {
    setReferenceSearchIndex(0);
  }, [referenceSearchQuery, referenceSearchOpen]);

  const handleReferenceSearchSelect = useCallback(
    (entry: { id: string }) => {
      if (!currentProject) {
        return;
      }
      const file = visibleContextFileById.get(entry.id);
      if (!file) {
        return;
      }

      const selectedIds = aiContextState?.selectedReferenceFileIds || [];
      setSelectedReferenceFileIds(currentProject.id, [...selectedIds, file.id]);

      if (referenceTriggerIndex >= 0) {
        const tokenEnd = referenceTriggerIndex + 1 + referenceSearchQuery.length;
        const beforeToken = input.slice(0, referenceTriggerIndex);
        const afterToken = input.slice(tokenEnd).replace(/^\s+/, '');
        const spacer = beforeToken && afterToken && !/\s$/.test(beforeToken) ? ' ' : '';
        const nextInput = `${beforeToken}${spacer}${afterToken}`;
        setInput(nextInput);
        requestAnimationFrame(() => {
          const nextCursorPos = referenceTriggerIndex + spacer.length;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(nextCursorPos, nextCursorPos);
        });
      }

      setReferenceSearchOpen(false);
      setReferenceSearchQuery('');
      setReferenceTriggerIndex(-1);
    },
    [
      aiContextState?.selectedReferenceFileIds,
      currentProject,
      input,
      referenceSearchQuery,
      referenceTriggerIndex,
      setSelectedReferenceFileIds,
      visibleContextFileById,
    ]
  );

  const handleInputChange = useCallback(
    (value: string, cursorPos: number) => {
      setInput(value);

      let triggerIndex = -1;
      for (let index = cursorPos - 1; index >= 0; index -= 1) {
        const character = value[index];
        if (character === '@') {
          if (index === 0 || /\s/.test(value[index - 1] || '')) {
            triggerIndex = index;
          }
          break;
        }
        if (/\s/.test(character || '')) {
          break;
        }
      }

      if (triggerIndex < 0) {
        setReferenceSearchOpen(false);
        setReferenceSearchQuery('');
        setReferenceTriggerIndex(-1);
        return;
      }

      setReferenceTriggerIndex(triggerIndex);
      setReferenceSearchQuery(value.slice(triggerIndex + 1, cursorPos));
      setReferenceSearchOpen(true);
    },
    []
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (referenceSearchOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setReferenceSearchIndex((current) =>
          filteredReferenceSearchFiles.length === 0 ? 0 : (current + 1) % filteredReferenceSearchFiles.length
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setReferenceSearchIndex((current) =>
          filteredReferenceSearchFiles.length === 0
            ? 0
            : (current - 1 + filteredReferenceSearchFiles.length) % filteredReferenceSearchFiles.length
        );
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setReferenceSearchOpen(false);
        setReferenceSearchQuery('');
        setReferenceTriggerIndex(-1);
        return;
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && filteredReferenceSearchFiles.length > 0) {
        event.preventDefault();
        const selectedFile = filteredReferenceSearchFiles[referenceSearchIndex];
        if (selectedFile) {
          handleReferenceSearchSelect(selectedFile);
        }
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const historyMenu = showHistoryMenu ? (
    <GNAgentHistoryMenu
      sessions={sessions}
      activeSessionId={activeSessionId}
      onCreateSession={handleCreateSession}
      onSelectSession={(sessionId) => {
        if (!currentProject) {
          return;
        }

        setActiveSession(currentProject.id, sessionId);
        setShowHistoryMenu(false);
      }}
      onDeleteSession={(sessionId) => {
        if (!currentProject) {
          return;
        }

        removeSession(currentProject.id, sessionId);
      }}
      buildSessionPreview={buildSessionPreview}
    />
  ) : null;
  const agentChatContent = (
    <GNAgentMessageList
      messages={messages}
      draftContents={streamingDraftContents}
      formatTimestamp={formatTimestamp}
      parseMessageParts={parseAIChatMessageParts}
      renderMessagePart={renderMessagePart}
      renderStructuredCards={renderStructuredCards}
      renderProjectFileProposal={renderProjectFileProposal}
      renderToolExecutionCard={renderToolExecutionCard}
      renderRunSummaryCard={renderRunSummaryCard}
      renderRuntimeApproval={renderRuntimeApprovalCard}
      messagesEndRef={messagesEndRef}
    />
  );
  useEffect(() => {
    if (selectedChatAgentId !== 'built-in' && !agentAvailability[selectedChatAgentId].ready) {
      setSelectedChatAgentId('built-in');
    }
  }, [agentAvailability, selectedChatAgentId]);

  useEffect(() => {
    if (!isSkillsModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSkillsModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeSkillsModal, isSkillsModalOpen]);

  return (
    <>
      <section
        className={`${getChatShellLayoutClassName(lockExpandedForEmbedded ? false : isCollapsed)}${isEmbedded ? ' chat-shell-embedded' : ''}`}
      >
        <header className={`chat-shell-header chat-shell-gn-header${isEmbedded ? ' embedded' : ''}`}>
          <div className="chat-shell-header-main">
            <div className="chat-shell-title">
              {!isEmbedded ? <span className="chat-shell-kicker">GN Agent</span> : null}
              <strong>{isCollapsed && !lockExpandedForEmbedded ? 'GN' : activeSession?.title || '新对话'}</strong>
              {showExpandedShell && !isEmbedded ? <span>{currentProject?.name || '未打开项目'}</span> : null}
            </div>

            {showExpandedShell && !isEmbedded ? (
              <div className="chat-shell-status-strip">
                <span className="chat-shell-status-pill">{selectedAgent.label}</span>
                <span className="chat-shell-status-pill">{selectedRuntimeConfig?.model || '未启用模型'}</span>
                <span className="chat-shell-status-pill">Skills / {activeSkills.length}</span>
                <span className="chat-shell-status-pill">MCP / {runtimeMcpServers.length}</span>
                <span className="chat-shell-status-pill">审批策略 / {sandboxPolicy}</span>
                <span className={`chat-shell-status-pill ${pendingApprovalCount > 0 ? 'warning' : ''}`}>
                  Approvals / {pendingApprovalCount}
                </span>
                <span className={`chat-shell-status-pill ${currentContextUsage.ratio >= 0.8 ? 'warning' : ''}`}>
                  {currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}
                </span>
                <span className={`chat-shell-status-pill ${runStateTone}`}>{runStateLabel}</span>
              </div>
            ) : null}

            <div className="chat-shell-header-actions">
              {showExpandedShell ? (
                <>
                  <div className="chat-header-menu">
                    <button
                      className="chat-shell-icon-btn"
                      type="button"
                      aria-label="\u5386\u53f2\u4f1a\u8bdd"
                      title="\u5386\u53f2\u4f1a\u8bdd"
                      onClick={() => {
                        setShowHistoryMenu((current) => !current);
                      }}
                    >
                      <HistoryIcon />
                    </button>
                    {historyMenu}
                  </div>
                  {isGNAgentEmbedded ? (
                    <GNAgentSkillsEntryButton onClick={() => setIsSkillsModalOpen(true)} />
                  ) : null}
                  <button
                    className="chat-shell-icon-btn"
                    type="button"
                    aria-label="\u65b0\u5bf9\u8bdd"
                    title="\u65b0\u5bf9\u8bdd"
                    onClick={handleCreateSession}
                  >
                    <ComposeIcon />
                  </button>
                  <button
                    className="chat-shell-icon-btn"
                    type="button"
                    aria-label="\u8bbe\u7f6e"
                    title="\u8bbe\u7f6e"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <SettingsIcon />
                  </button>
                </>
              ) : null}

              {!isEmbedded ? (
                <button
                  className="chat-shell-icon-btn"
                  type="button"
                  aria-label={isCollapsed ? '\u5c55\u5f00\u804a\u5929\u680f' : '\u6536\u8d77\u804a\u5929\u680f'}
                  title={isCollapsed ? '\u5c55\u5f00\u804a\u5929\u680f' : '\u6536\u8d77\u804a\u5929\u680f'}
                  onClick={() => setCollapsedState(!isCollapsed)}
                >
                  <CollapseIcon collapsed={isCollapsed} />
                </button>
              ) : null}
            </div>
          </div>
        </header>

          {showExpandedShell ? (
            <>
            {agentChatContent}
            {isEmbedded ? (
                <>
                  <GNAgentEmbeddedComposer
                    topContent={
                      <>
                        {explicitSelectedReferenceFiles.length > 0 ? (
                          <div className="chat-selected-reference-chips chat-selected-reference-chips-embedded">
                            {explicitSelectedReferenceFiles.map((file) => (
                              <button
                                key={file.id}
                                type="button"
                                className="chat-reference-chip compact"
                                onClick={() =>
                                  currentProject
                                    ? setSelectedReferenceFileIds(
                                        currentProject.id,
                                        (aiContextState?.selectedReferenceFileIds || []).filter((id) => id !== file.id)
                                      )
                                    : undefined
                                }
                              >
                                <strong>@{file.title}</strong>
                                <span title={file.path}>{summarizeReferencePath(file.path)}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {referenceSearchOpen ? (
                          <AIChatReferenceSearchMenu
                            entries={filteredReferenceSearchFiles}
                            selectedIndex={referenceSearchIndex}
                            onHover={setReferenceSearchIndex}
                            onSelect={handleReferenceSearchSelect}
                          />
                        ) : null}
                      </>
                    }
                    input={input}
                    setInput={setInput}
                    onInputChange={handleInputChange}
                    textareaRef={textareaRef}
                    onKeyDown={handleKeyDown}
                    placeholder={getComposerPlaceholder(isRuntimeConfigured)}
                    agentStatusLabel={isGNAgentEmbedded ? selectedAgent.label : undefined}
                    selectedRuntimeLabel={selectedRuntimeConfig ? selectedRuntimeConfig.name : '\u672a\u542f\u7528 AI'}
                    contextUsageLabel={`${currentContextUsage.usedLabel} / ${currentContextUsage.limitLabel}`}
                    contextUsageWarning={currentContextUsage.ratio >= 0.8}
                    runStateLabel={isGNAgentEmbedded ? runStateLabel : undefined}
                    runStateTone={isGNAgentEmbedded ? runStateTone : undefined}
                    isLoading={isLoading}
                    disabled={!input.trim() || isLoading}
                    onSubmit={() => {
                      void handleSubmit();
                    }}
                    SendIcon={SendIcon}
                  />
                </>
              ) : (
                <form className="chat-composer" onSubmit={handleSubmit}>
                  <div className="chat-composer-shell">
                      {explicitSelectedReferenceFiles.length > 0 ? (
                        <div className="chat-selected-reference-chips">
                          {explicitSelectedReferenceFiles.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              className="chat-reference-chip compact"
                              onClick={() =>
                                currentProject
                                  ? setSelectedReferenceFileIds(
                                      currentProject.id,
                                      (aiContextState?.selectedReferenceFileIds || []).filter((id) => id !== file.id)
                                    )
                                  : undefined
                              }
                            >
                              <strong>@{file.title}</strong>
                              <span title={file.path}>{summarizeReferencePath(file.path)}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="chat-composer-main">
                        {referenceSearchOpen ? (
                          <AIChatReferenceSearchMenu
                            entries={filteredReferenceSearchFiles}
                            selectedIndex={referenceSearchIndex}
                            onHover={setReferenceSearchIndex}
                            onSelect={handleReferenceSearchSelect}
                          />
                        ) : null}
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={(event) =>
                            handleInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length)
                          }
                          onKeyDown={handleKeyDown}
                          placeholder={getComposerPlaceholder(isRuntimeConfigured)}
                          className="chat-composer-input"
                          rows={1}
                        />
                        <button
                          type="submit"
                          className="chat-send-btn"
                          aria-label={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
                          title={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
                          disabled={!input.trim() || isLoading}
                        >
                          <SendIcon />
                        </button>
                      </div>

                      <div className="chat-composer-meta">
                        <span>{selectedRuntimeConfig ? selectedRuntimeConfig.name : '\u672a\u542f\u7528 AI'}</span>
                        <span className={currentContextUsage.ratio >= 0.8 ? 'warning' : ''}>
                          {currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}
                        </span>
                      </div>
                      <div className="chat-mode-switch" role="group" aria-label="本次聊天模式">
                        <span className="chat-mode-switch-label">本次聊天模式</span>
                        <div className="chat-mode-switch-options">
                          <button
                            type="button"
                            className={projectFileOperationMode === 'manual' ? 'active' : ''}
                            onClick={() => setProjectFileOperationMode('manual')}
                          >
                            手动确认
                          </button>
                          <button
                            type="button"
                            className={projectFileOperationMode === 'auto' ? 'active' : ''}
                            onClick={() => setProjectFileOperationMode('auto')}
                          >
                            自动确认
                          </button>
                        </div>
                      </div>
                  </div>
                </form>
              )}
          </>
        ) : (
          <div className="chat-collapsed-state">
            <span>GN Agent 已收起</span>
          </div>
        )}
      </section>

      {isSkillsModalOpen
        ? createPortal(
            <div className="chat-skills-modal-backdrop" onClick={closeSkillsModal}>
              <section
                className="chat-skills-modal"
                role="dialog"
                aria-modal="true"
                aria-label="GoodNight 技能页"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="chat-skills-modal-head">
                  <strong>技能</strong>
                  <button
                    type="button"
                    className="chat-skills-modal-close"
                    aria-label="关闭技能页"
                    title="关闭技能页"
                    onClick={closeSkillsModal}
                  >
                    ×
                  </button>
                </div>
                <div className="chat-skills-modal-body">
                  <GNAgentSkillsPage />
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {rewindTargetRunId
        ? createPortal(
            <div className="chat-file-preview-backdrop" onClick={() => {
              if (!isRewindingRunId) {
                setRewindTargetRunId(null);
                setRewindError('');
              }
            }}>
              <section
                className="chat-file-preview-modal"
                role="dialog"
                aria-modal="true"
                aria-label="回退本轮改动"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="chat-file-preview-head">
                  <div>
                    <strong>
                      {rewindTargetRunId === latestCheckpointRunId ? '撤销本轮改动' : '回到这轮之前'}
                    </strong>
                    <span>
                      这会恢复该轮及其之后轮次写入过的文件，并裁掉对应聊天记录。
                    </span>
                  </div>
                  <button
                    type="button"
                    className="chat-file-preview-close"
                    aria-label="关闭回退确认"
                    title="关闭回退确认"
                    onClick={() => {
                      if (!isRewindingRunId) {
                        setRewindTargetRunId(null);
                        setRewindError('');
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="chat-file-preview-body">
                  <section className="chat-file-preview-panel">
                    <div className="chat-file-preview-panel-head">
                      <strong>回退说明</strong>
                      <span>将同步恢复文件与对话</span>
                    </div>
                    <div className="chat-file-preview-empty">
                      {rewindTargetRunId === latestCheckpointRunId
                        ? '会撤销当前轮的文件改动，并删除这轮聊天记录。'
                        : '会回退到这轮开始前的状态，并删除这轮以及之后的聊天记录。'}
                    </div>
                    {rewindError ? <div className="chat-run-summary-error">{rewindError}</div> : null}
                    <div className="chat-run-summary-confirm-actions">
                      <button
                        type="button"
                        className="chat-run-summary-action"
                        onClick={() => setRewindTargetRunId(null)}
                        disabled={Boolean(isRewindingRunId)}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="chat-run-summary-action danger"
                        onClick={() => {
                          const checkpoint = turnCheckpointsByRunId[rewindTargetRunId];
                          if (checkpoint) {
                            void handleRewindRun(checkpoint);
                          }
                        }}
                        disabled={Boolean(isRewindingRunId)}
                      >
                        {isRewindingRunId ? '回退中...' : rewindTargetRunId === latestCheckpointRunId ? '确认撤销本轮' : '确认回到这轮之前'}
                      </button>
                    </div>
                  </section>
                  <section className="chat-file-preview-panel history">
                    <div className="chat-file-preview-panel-head">
                      <strong>将被移除的轮次</strong>
                      <span>
                        {turnCheckpoints.filter((entry) => {
                          const target = turnCheckpointsByRunId[rewindTargetRunId];
                          return target ? entry.createdAt >= target.createdAt : false;
                        }).length} 条
                      </span>
                    </div>
                    <div className="chat-file-preview-history-list">
                      {turnCheckpoints
                        .filter((entry) => {
                          const target = turnCheckpointsByRunId[rewindTargetRunId];
                          return target ? entry.createdAt >= target.createdAt : false;
                        })
                        .map((entry) => (
                          <div key={entry.id} className="chat-file-preview-history-item active">
                            <strong>{entry.summary}</strong>
                            <span>
                              {formatTimestamp(entry.createdAt)}
                              {' · '}+{entry.insertions} / -{entry.deletions}
                            </span>
                          </div>
                        ))}
                      {turnCheckpoints.length === 0 ? (
                        <div className="chat-file-preview-empty">还没有可回退的变更记录。</div>
                      ) : null}
                    </div>
                  </section>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {isSettingsOpen
        ? createPortal(
            <div className="chat-settings-modal-backdrop" onClick={closeSettings}>
              <section
                className="chat-settings-drawer open"
                role="dialog"
                aria-modal="true"
                aria-label="AI 设置"
                onClick={(event) => event.stopPropagation()}
              >
        <div className="chat-settings-drawer-header">
          <div>
            <div className="chat-settings-eyebrow">Model Settings</div>
            <strong>AI 设置</strong>
          </div>
          <button className="chat-settings-close" type="button" aria-label="关闭 AI 设置" onClick={closeSettings}>
            ×
          </button>
        </div>

        <div className="chat-settings-drawer-body">
          <aside className="chat-settings-provider-list">
            <div className="chat-settings-provider-search">
              <input
                value={providerSearch}
                onChange={(event) => setProviderSearch(event.target.value)}
                placeholder="搜索 AI 配置"
              />
            </div>

            <button className="chat-settings-apply-btn" type="button" onClick={handleCreateConfig}>
              新增 AI 配置
            </button>

            <div className="chat-settings-provider-items">
              {filteredConfigs.map((config) => {
                const isActive = selectedSettingsConfig?.id === config.id;
                const configPreset = findPresetByConfig(config.provider, config.baseURL) || CUSTOM_PROVIDER_PRESET;
                return (
                  <button
                    key={config.id}
                    className={`chat-settings-provider-item ${isActive ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setSelectedSettingsConfigId(config.id);
                      setTestState('idle');
                      setTestMessage('');
                    }}
                  >
                    <span className={`chat-settings-provider-badge ${configPreset.accent}`}>{config.name.slice(0, 2).toUpperCase()}</span>
                    <span className="chat-settings-provider-copy">
                      <strong>{config.name}</strong>
                      <span>
                        {providerTypeLabel(config.provider)}
                        {config.enabled && hasUsableAIConfigEntry(config) ? ' · 已启用' : ' · 已关闭'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="chat-settings-detail">
            <div className="chat-settings-detail-header">
              <div>
                <strong>{settingsDraft.name || '未命名 AI'}</strong>
                <span>保存为本地配置项，只有启用后才会出现在聊天选择里。</span>
              </div>
            </div>

            <div className="chat-settings-summary-card">
              <div>
                <span className="chat-settings-summary-label">当前配置</span>
                <strong>{settingsDraft.name || '未命名 AI'}</strong>
                <p>{selectedSettingsPreset.note}</p>
              </div>
              <div className="chat-settings-summary-meta">
                <span>{providerTypeLabel(settingsDraft.provider)}</span>
                <span>{settingsDraft.enabled && isSettingsDraftComplete ? '已启用' : '未启用'}</span>
                <span>{isSettingsDraftSelected ? '当前聊天中' : '未选中'}</span>
              </div>
            </div>

            <div className="chat-settings-section">
              <div className="chat-settings-section-header">
                <strong>API 类型</strong>
                <span>{selectedProviderTypeOption.description}</span>
              </div>

              <div className="chat-settings-type-grid">
                {AI_PROVIDER_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`chat-settings-type-card ${settingsDraft.provider === option.value ? 'active' : ''}`}
                    type="button"
                    onClick={() =>
                      setSettingsDraft((current) => ({
                        ...current,
                        provider: option.value,
                        baseURL:
                          current.baseURL.trim() ||
                          (selectedSettingsPreset.id !== CUSTOM_PROVIDER_PRESET.id && option.value === selectedSettingsPreset.type
                            ? selectedSettingsPreset.baseURL
                            : current.baseURL),
                      }))
                    }
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="chat-settings-grid">
              <label className="chat-settings-field chat-settings-field-full">
                <span>配置名称</span>
                <input
                  value={settingsDraft.name}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：OpenRouter 主力 / Claude 备用"
                />
                <small>聊天框顶部会显示这个名称。</small>
              </label>

              <label className="chat-settings-field">
                <span>API Key</span>
                <div className="chat-settings-inline">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settingsDraft.apiKey}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder={selectedSettingsPreset.keyHint}
                  />
                  <button className="chat-settings-inline-btn" type="button" onClick={() => setShowApiKey((current) => !current)}>
                    {showApiKey ? '隐藏' : '显示'}
                  </button>
                </div>
                <small>{settingsDraft.apiKey.trim() ? '已填写 API Key，可直接测试连接。' : '还没有填写 API Key。'}</small>
              </label>

              <label className="chat-settings-field">
                <span>Base URL</span>
                <div className="chat-settings-inline">
                  <input
                    value={settingsDraft.baseURL}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        baseURL: event.target.value,
                      }))
                    }
                    placeholder={getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset)}
                  />
                  <button
                    className="chat-settings-inline-btn"
                    type="button"
                    onClick={() =>
                      setSettingsDraft((current) => ({
                        ...current,
                        baseURL: getSuggestedBaseURL(current.provider, selectedSettingsPreset),
                      }))
                    }
                  >
                    重置
                  </button>
                </div>
                <small>{selectedProviderEndpoint}</small>
              </label>

              <label className="chat-settings-field">
                <span>Model</span>
                <div className="chat-settings-inline">
                  <input
                    value={settingsDraft.model}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                    placeholder={selectedSettingsPreset.models[0] || '输入模型 ID'}
                  />
                  <button className="chat-settings-inline-btn" type="button" onClick={() => void handleLoadModels()}>
                    {isLoadingModels ? '加载中…' : selectedProviderListMode === 'preset-only' ? '内置候选' : '拉取模型'}
                  </button>
                </div>
                <small>
                  {selectedProviderListMode === 'preset-only'
                    ? '当前 provider 使用内置模型候选。'
                    : '当前 provider 支持远程拉取模型列表。'}
                </small>
              </label>

              <label className="chat-settings-field">
                <span>上下文长度</span>
                <div className="chat-settings-input-unit">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round(settingsDraft.contextWindowTokens / 1000)}
                    onChange={(event) =>
                      setSettingsDraft((current) => {
                        const nextValue = Number(event.target.value) * 1000;
                        return {
                          ...current,
                          contextWindowTokens: Math.max(1000, Number.isFinite(nextValue) ? nextValue : 258000),
                        };
                      })
                    }
                  />
                  <span className="chat-settings-unit">k</span>
                </div>
                <small>默认 258k，用于提示当前上下文占用，并作为后续引用预算。</small>
              </label>

              <label className="chat-settings-field chat-settings-field-full">
                <span>
                  Custom Headers
                  {settingsDraft.customHeaders.trim() ? (
                    <small className={`chat-settings-json-status ${customHeadersJsonValid ? 'valid' : 'invalid'}`}>
                      {customHeadersJsonValid ? 'JSON 有效' : 'JSON 无效'}
                    </small>
                  ) : null}
                </span>
                <textarea
                  value={settingsDraft.customHeaders}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      customHeaders: event.target.value,
                    }))
                  }
                  placeholder='{"HTTP-Referer":"https://your-app.com","X-Title":"GoodNight"}'
                  rows={4}
                />
                <small>需要额外请求头时，在这里直接填写 JSON。</small>
              </label>
            </div>

            {settingsModelOptions.length > 0 ? (
              <div className="chat-settings-model-grid">
                {settingsModelOptions.map((candidate) => (
                  <button
                    key={candidate}
                    className={`chat-settings-model-chip ${settingsDraft.model === candidate ? 'active' : ''}`}
                    type="button"
                    onClick={() =>
                      setSettingsDraft((current) => ({
                        ...current,
                        model: candidate,
                      }))
                    }
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="chat-settings-actions">
              <button className="chat-settings-apply-btn secondary" type="button" onClick={handleApplySettings}>
                保存
              </button>
              <button className="chat-settings-apply-btn" type="button" onClick={handleToggleEnabled}>
                {settingsDraft.enabled ? '关闭' : '启用'}
              </button>
              <button className="chat-settings-apply-btn" type="button" onClick={() => void handleTestConnection()}>
                {testState === 'testing' ? '测试中…' : '测试连接'}
              </button>
              {settingsDraft.id && (
                <button
                  className={`chat-settings-apply-btn ${settingsDraft.id === selectedConfigId ? 'secondary' : ''}`}
                  type="button"
                  onClick={handleSelectConfig}
                >
                  {settingsDraft.id === selectedConfigId ? '当前聊天中' : '选择使用'}
                </button>
              )}
              <button className="chat-settings-apply-btn" type="button" onClick={handleExportConfigs}>
                导出 JSON
              </button>
              <button className="chat-settings-apply-btn" type="button" onClick={() => { setShowJsonImport(true); setTestState('idle'); setTestMessage(''); }}>
                导入 JSON
              </button>
              {aiConfigs.length > 1 ? (
                <button className="chat-settings-apply-btn danger" type="button" onClick={handleDeleteConfig}>
                  删除
                </button>
              ) : null}
              <a className="chat-settings-doc-link" href={selectedSettingsPreset.docsUrl} target="_blank" rel="noreferrer">
                查看文档
              </a>
            </div>

            {showJsonImport ? (
              <div className="chat-settings-import-json">
                <span>导入 AI 配置 (JSON)</span>
                <textarea
                  value={jsonImportText}
                  onChange={(event) => setJsonImportText(event.target.value)}
                  placeholder='[{"provider":"openai-compatible","apiKey":"sk-...","baseURL":"https://api.openai.com/v1","model":"gpt-4o-mini"}]'
                  rows={6}
                />
                <div className="chat-settings-import-actions">
                  <button className="chat-settings-apply-btn" type="button" onClick={handleImportConfigs}>
                    导入
                  </button>
                  <button className="chat-settings-apply-btn secondary" type="button" onClick={() => { setShowJsonImport(false); setJsonImportText(''); }}>
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            {testMessage ? <div className={`chat-settings-test-note ${testState}`}>{testMessage}</div> : null}
          </div>
        </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
};


