import React, { Suspense, lazy, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import type { AIProviderType } from '../../modules/ai/core/AIService';
import { buildDirectChatPrompt } from '../../modules/ai/chat/directChatPrompt';
import type { ChatStructuredCard } from '../../modules/ai/chat/chatCards';
import { buildContextUsageSummary } from '../../modules/ai/chat/contextBudget';
import {
  buildReferencePromptContext,
  isInternalAssistantReferencePath,
} from '../../modules/ai/chat/referencePromptContext';
import {
  CHAT_AGENTS,
  type ChatAgentId,
} from '../../modules/ai/chat/chatAgents';
import {
  buildChatContextSnapshot,
  collectDesignPages,
  getSelectedElementLabel,
} from '../../modules/ai/chat/chatContext';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import type { ActivityEntry } from '../../modules/ai/skills/activityLog';
import {
  getDefaultRuntimeSkillDefinitions,
  loadRuntimeSkillCatalog,
} from '../../modules/ai/skills/skillLibrary';
import type { AIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../modules/ai/gn-agent/localConfig';
import {
  appendAgentTimelineEvent as persistRuntimeTimelineEvent,
  getAgentRuntimeSettings,
  enqueueAgentApproval,
  resolveAgentApproval,
  setAgentPermissionMode,
} from '../../modules/ai/runtime/agentRuntimeClient';
import { useApprovalStore } from '../../modules/ai/runtime/approval/approvalStore';
import type { ApprovalRecord, PermissionMode } from '../../modules/ai/runtime/approval/approvalTypes';
import {
  PERMISSION_MODE_LABELS,
  permissionModeToSandboxPolicy,
  sandboxPolicyToPermissionMode,
} from '../../modules/ai/runtime/approval/permissionMode';
import { buildMemoryRollbackLifecycleDescriptor, buildSkillDiscoveryLifecycleDescriptor, buildSkillLoadLifecycleDescriptor } from '../../modules/ai/runtime/dispatch/runtimeCapabilityLifecycle.ts';
import type {
  AgentProviderId,
  AgentTurnCheckpointDiff,
  AgentTurnCheckpointRecord,
} from '../../modules/ai/runtime/agentRuntimeTypes';
import {
  buildReplayRecoveryState,
  createReplayRecoveryController,
  getLatestReplaySkillSnapshot,
} from '../../modules/ai/runtime/replay/runtimeReplayRecovery';
import {
  useActiveConversationRunStateSignals,
  useActiveConversationSelection,
  useRuntimeConversationGateway,
} from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import { createRuntimeSkillRegistry } from '../../modules/ai/runtime/skills/runtimeSkillRegistry';
import { useAgentRuntimeStore } from '../../modules/ai/runtime/agentRuntimeStore';
import { getLatestTurnSession } from '../../modules/ai/runtime/session/agentSessionSelectors.ts';
import {
  createChatSession,
  type StoredChatMessage,
  useAIChatStore,
} from '../../modules/ai/store/aiChatStore';
import {
  applyAssistantReasoningProgress,
  getAssistantRuntimeTimelineEvents,
  getAssistantTimelineText,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import {
  AI_CHAT_COMMAND_EVENT,
  AI_CHAT_SETTINGS_EVENT,
  type AIChatCommandDetail,
  type AIChatSettingsDetail,
} from '../../modules/ai/chat/chatCommands';
import {
  type ProjectFileOperation,
  type ProjectFileProposal,
} from '../../modules/ai/chat/projectFileOperations';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
import { emitKnowledgeFilesystemChanged } from '../../features/knowledge/workspace/knowledgeFilesystemEvents';
import { useProjectStore } from '../../store/projectStore';
import { usePreviewStore } from '../../store/previewStore';
import {
  appendRuntimeSidecarReplayHistoryEntry,
  getRuntimeSidecarCheckpointDiff,
  initializeRuntimeSidecarBackgroundTasks,
  initializeRuntimeSidecarMcpServers,
  initializeRuntimeSidecarMcpToolCalls,
  initializeRuntimeSidecarProjectSessions,
  initializeRuntimeSidecarReplayHistory,
  listRuntimeSidecarCheckpoints,
  rewindRuntimeSidecarCheckpoint,
} from '../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';
import {
  GNAgentEmbeddedComposer,
  GNAgentHistoryMenu,
  type MessageBubbleCard,
} from '../ai/gn-agent/GNAgentEmbeddedPieces';
import { GNAgentSkillsPage } from '../ai/gn-agent-shell/GNAgentSkillsPage';
import { AIChatReferenceSearchMenu } from './AIChatReferenceSearchMenu';
import { AIChatSlashCommandMenu, type SlashCommandEntry } from './AIChatSlashCommandMenu';
import { RuntimeMcpSettingsPage } from './RuntimeMcpSettingsPage';
import { AIChatConversationMessagesPane } from './AIChatConversationMessagesPane';
import { AIChatRuntimeTimelineInteractionEvent } from './AIChatRuntimeInteractionCards.tsx';
import {
  buildWelcomeMessage,
  getChatShellLayoutClassName,
  getChatViewportClassName,
  getComposerPlaceholder,
} from './aiChatViewState';
import { parseAIChatMessageParts, type AIChatMessagePart } from './aiChatMessageParts';
import { AssistantTextBlock, AssistantThinkingBlock } from './AIChatAssistantParts';
import {
  buildChatTimelineBubbleCards,
  ChatTimelineBubbleCard,
} from './timeline/chatTimelineBubbleCards.tsx';
import { useAIChatSettingsState } from './useAIChatSettingsState';
import { useAIChatRuntimeInteractionState } from './useAIChatRuntimeInteractionState';
import { useAIChatSidecarSessionActions } from './useAIChatSidecarSessionActions';
import { getRuntimeQuestionRenderEntries } from './runtimeInteractionRenderModel.ts';
import './AIChat.css';

let aiServiceModulePromise: Promise<typeof import('../../modules/ai/core/AIService')> | null = null;

const loadAIServiceModule = () => (aiServiceModulePromise ??= import('../../modules/ai/core/AIService'));

const LazyAIChatAISettingsTab = lazy(async () => {
  const module = await import('./AIChatAISettingsTab');
  return { default: module.AIChatAISettingsTab };
});

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
  headerActionSlot?: ReactNode;
};

type SettingsTabId =
  | 'ai'
  | 'permissions'
  | 'general'
  | 'adapters'
  | 'terminal'
  | 'skills'
  | 'mcp'
  | 'agents'
  | 'plugins'
  | 'computerUse'
  | 'diagnostics'
  | 'about';

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

type StreamingDraftState = {
  timeline: AssistantTimelineEvent[];
};

const EMPTY_ACTIVITY_ENTRIES: ActivityEntry[] = [];
const EMPTY_PENDING_APPROVALS: ApprovalRecord[] = [];
const SETTINGS_TABS: Array<{
  id: SettingsTabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'ai',
    label: 'AI',
    eyebrow: 'Model Settings',
    title: 'AI 设置',
    description: '管理当前聊天使用的模型配置与 Provider。',
  },
  {
    id: 'permissions',
    label: '权限',
    eyebrow: 'Permissions',
    title: '权限设置',
    description: '管理审批、sandbox 和自动执行边界。',
  },
  {
    id: 'general',
    label: '通用',
    eyebrow: 'General',
    title: '通用设置',
    description: '管理 Agent 工作台的默认行为与显示偏好。',
  },
  {
    id: 'adapters',
    label: '适配器',
    eyebrow: 'Adapters',
    title: '适配器设置',
    description: '管理本地模型、外部 CLI 与运行时桥接能力。',
  },
  {
    id: 'terminal',
    label: '终端',
    eyebrow: 'Terminal',
    title: '终端设置',
    description: '管理 shell、工作目录和命令执行偏好。',
  },
  {
    id: 'skills',
    label: '技能',
    eyebrow: 'Skills Library',
    title: '技能设置',
    description: '统一管理技能导入、查看与删除，不再放在 Agent 里单独维护。',
  },
  {
    id: 'mcp',
    label: 'MCP',
    eyebrow: 'Runtime MCP',
    title: 'MCP 设置',
    description: '统一管理 MCP server 的查看、编辑、启停与运行记录。',
  },
  {
    id: 'agents',
    label: 'Agents',
    eyebrow: 'Agents',
    title: 'Agents 设置',
    description: '管理本地 Agent、团队执行与默认分工。',
  },
  {
    id: 'plugins',
    label: '插件',
    eyebrow: 'Plugins',
    title: '插件设置',
    description: '管理扩展入口与未来插件能力。',
  },
  {
    id: 'computerUse',
    label: 'Computer Use',
    eyebrow: 'Computer Use',
    title: 'Computer Use 设置',
    description: '管理桌面自动化与可视操作能力。',
  },
  {
    id: 'diagnostics',
    label: '诊断',
    eyebrow: 'Diagnostics',
    title: '诊断信息',
    description: '查看运行时状态、连接情况与故障排查信息。',
  },
  {
    id: 'about',
    label: '关于',
    eyebrow: 'About',
    title: '关于 GoodNight Agent',
    description: '查看版本、能力边界与本地运行说明。',
  },
];

const SETTINGS_TAB_IDS = new Set<SettingsTabId>(SETTINGS_TABS.map((tab) => tab.id));
const resolveSettingsTabId = (tab: AIChatSettingsDetail['tab']): SettingsTabId =>
  tab && SETTINGS_TAB_IDS.has(tab) ? tab : SETTINGS_TABS[0].id;

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

const findSlashTrigger = (value: string, cursorPos: number) => {
  for (let index = cursorPos - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === '/') {
      if (index === 0 || /\s/.test(value[index - 1] || '')) {
        return {
          triggerIndex: index,
          filter: value.slice(index + 1, cursorPos),
        };
      }
      break;
    }
    if (/\s/.test(character || '')) {
      break;
    }
  }

  return null;
};

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode | 'custom';
  label: string;
  description: string;
  icon: string;
  disabled?: boolean;
}> = [
  {
    value: 'ask',
    label: '默认权限',
    description: '读操作直接执行，写入和高风险操作先询问你。',
    icon: '◌',
  },
  {
    value: 'plan',
    label: '规划优先',
    description: '优先做分析和计划，高风险动作默认不直接执行。',
    icon: '◔',
  },
  {
    value: 'auto',
    label: '自动执行',
    description: '允许直接执行常见写入和命令动作，尽量减少中断。',
    icon: '●',
  },
  {
    value: 'bypass',
    label: '完全放行',
    description: '沿用全自动策略，但明确按最少拦截来执行。',
    icon: '◆',
  },
  {
    value: 'custom',
    label: '自定义 (config.toml)',
    description: '预留给更细粒度的外部配置，当前界面暂不改写。',
    icon: '⚙',
    disabled: true,
  },
];

const ChatSandboxPolicySelector: React.FC<{
  value: PermissionMode;
  onChange: (mode: PermissionMode) => Promise<void> | void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const confirmBypass = () =>
    window.confirm('完全放行会减少写入、命令和网络操作的拦截。确认切换到完全放行？');

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="chat-sandbox-selector">
      <button
        type="button"
        className={`chat-sandbox-selector-trigger ${open ? 'open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setError('');
          setOpen((current) => !current);
        }}
      >
        <span className="chat-sandbox-selector-trigger-icon">⚙</span>
        <span className="chat-sandbox-selector-trigger-label">{PERMISSION_MODE_LABELS[value]}</span>
        <span className="chat-sandbox-selector-trigger-caret">▾</span>
      </button>

      {open ? (
        <div className="chat-sandbox-selector-menu" role="menu" aria-label="权限选择">
          {PERMISSION_MODE_OPTIONS.map((option) => {
            const isActive = option.value === value;
            const isDisabled = Boolean(option.disabled || isSaving || option.value === 'custom');
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                disabled={isDisabled}
                className={`chat-sandbox-selector-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (option.value === 'custom' || option.value === value) {
                    return;
                  }

                  if (option.value === 'bypass' && !confirmBypass()) {
                    setOpen(false);
                    return;
                  }

                  setIsSaving(true);
                  setError('');
                  void Promise.resolve(onChange(option.value))
                    .then(() => {
                      setOpen(false);
                    })
                    .catch((reason) => {
                      setError(normalizeErrorMessage(reason));
                    })
                    .finally(() => {
                      setIsSaving(false);
                    });
                }}
              >
                <span className="chat-sandbox-selector-item-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="chat-sandbox-selector-item-copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                {isActive ? <span className="chat-sandbox-selector-item-check">✓</span> : null}
              </button>
            );
          })}
          {error ? <div className="chat-sandbox-selector-error">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

const normalizeReferencePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

const summarizeReferenceContent = (value: string, fallback = '', maxLength = 120) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
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
  tool_powershell: 'PowerShell 命令',
  tool_remove: '删除操作',
  tool_write: '写入操作',
  tool_edit: '编辑操作',
  tool_fetch: '网络访问',
  tool_agent: '多 Agent 协作',
  mcp_tool_call: 'MCP 工具',
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
const isRunDiffActive = (expandedRunDiffKey: string | null, runId: string, path: string) =>
  expandedRunDiffKey === buildRunDiffKey(runId, path);

const getCheckpointChangeTypeLabel = (changeType: 'created' | 'updated' | 'deleted') =>
  changeType === 'created' ? '新建' : changeType === 'deleted' ? '删除' : '修改';

const buildProjectFileStageItems = (proposal: ProjectFileProposal) => {
  const isDeleteOnlyProposal =
    proposal.operations.length > 0 &&
    proposal.operations.every((operation) => operation.type === 'delete_file');
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
    {
      key: 'review',
      label: proposal.mode === 'auto' ? (isDeleteOnlyProposal ? '确认删除' : '确认范围') : '等待确认',
      state: reviewState,
    },
    {
      key: 'apply',
      label: isDeleteOnlyProposal
        ? proposal.status === 'executed'
          ? '删除完成'
          : '删除文件'
        : proposal.status === 'executed'
          ? '写入完成'
          : '写入文件',
      state: applyState,
    },
  ];
};

const resolveProjectFileProposalNote = (proposal: ProjectFileProposal) => {
  const isDeleteOnlyProposal =
    proposal.operations.length > 0 &&
    proposal.operations.every((operation) => operation.type === 'delete_file');
  if (proposal.status === 'executing') {
    return isDeleteOnlyProposal ? '正在删除文件并校验结果...' : '正在写入文件并校验结果...';
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
  providerId: AgentProviderId = 'built-in'
) => {
  const session = createChatSession(projectId, '新对话', providerId);
  return {
    ...session,
    messages: [buildWelcomeMessage()],
  };
};

const buildSessionPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized;
};

const runtimeConversationInitializationInFlight = new Set<string>();
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

const PauseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <rect x="5" y="3" width="3" height="14" rx="1" fill="currentColor" />
    <rect x="12" y="3" width="3" height="14" rx="1" fill="currentColor" />
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

const renderMessagePart = (
  message: StoredChatMessage,
  messageId: string,
  part: AIChatMessagePart,
  index: number,
  options?: {
    content: string;
    isStreaming: boolean;
    thinkingExpanded?: boolean;
    onToggleThinking?: () => void;
  }
) => {
  if (part.type === 'thinking') {
    return (
      <AssistantThinkingBlock
        key={`${messageId}-thinking-${index}`}
        part={part}
        isStreaming={options?.isStreaming ?? false}
        thinkingExpanded={options?.thinkingExpanded}
        onToggleThinking={options?.onToggleThinking}
      />
    );
  }

  if (part.type === 'tool') {
    if (
      message.role === 'assistant' &&
      getAssistantRuntimeTimelineEvents(message.timeline).some(
        (event) => event.kind === 'tool_use' || event.kind === 'tool_result'
      )
    ) {
      return null;
    }
    return (
      <details className={`chat-tool-card ${part.status}`} key={`${messageId}-tool-${index}`}>
        <summary className="chat-tool-card-header chat-tool-card-summary">
          <span className="chat-tool-icon" aria-hidden="true" />
          <div className="chat-inline-disclosure-copy">
            <strong>{part.title}</strong>
            <span>{part.status === 'running' ? '正在执行' : part.status === 'error' ? '执行失败' : '已完成'}</span>
          </div>
          <span className="chat-inline-disclosure-caret" aria-hidden="true" />
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
    <AssistantTextBlock
      key={`${messageId}-text-${index}`}
      content={part.content}
      isStreaming={options?.isStreaming ?? false}
    />
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

const buildSkillCatalogLifecycleSignature = (input: {
  sessionId: string;
  replayThreadId: string;
  projectRoot: string;
  discoveredSkills: Array<{ id: string; source: string }>;
  loadedSkills: Array<{ id: string; source: string }>;
}) =>
  JSON.stringify({
    sessionId: input.sessionId,
    replayThreadId: input.replayThreadId,
    projectRoot: input.projectRoot,
    discoveredSkills: input.discoveredSkills
      .map((skill) => `${skill.source}:${skill.id}`)
      .sort(),
    loadedSkills: input.loadedSkills
      .map((skill) => `${skill.source}:${skill.id}`)
      .sort(),
  });

const getStoredMessageConversationContent = (message: StoredChatMessage) =>
  message.role === 'assistant'
    ? getAssistantTimelineText(message.timeline)
    : message.content;

const toConversationHistoryMessages = (messages: StoredChatMessage[] = []) =>
  messages.map((message) => ({
    role: message.role,
    content: getStoredMessageConversationContent(message),
  }));

function useStallDetector(isRunning: boolean, activityFingerprint: unknown, thresholdMs = 10000) {
  const [stalled, setStalled] = useState(false);
  const [stallDuration, setStallDuration] = useState(0);
  const lastActivityRef = useRef(performance.now());

  useEffect(() => {
    if (!isRunning) {
      setStalled(false);
      setStallDuration(0);
      return;
    }
    lastActivityRef.current = performance.now();
    setStalled(false);
    setStallDuration(0);
  }, [isRunning, activityFingerprint]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const id = setInterval(() => {
      const elapsed = performance.now() - lastActivityRef.current;
      if (elapsed >= thresholdMs) {
        setStalled(true);
        setStallDuration(elapsed);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isRunning, thresholdMs]);

  return { stalled, stallDuration };
}

export const AIChat: React.FC<AIChatProps> = ({
  variant = 'default',
  runtimeConfigIdOverride = null,
  providerExecutionMode = null,
  collapsed,
  onCollapsedChange,
  headerActionSlot = null,
}) => {
  const isProviderEmbedded = variant === 'provider-embedded';
  const isGNAgentEmbedded = variant === 'gn-agent-embedded';
  const isEmbedded = isProviderEmbedded || isGNAgentEmbedded;
  const lockExpandedForEmbedded = isProviderEmbedded;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stallFP] = useState(0);
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('ai');
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [selectedChatAgentId, setSelectedChatAgentId] = useState<ChatAgentId>('built-in');
  const [localAgentSnapshot, setLocalAgentSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);
  const [streamingDraftContents, setStreamingDraftContents] = useState<Record<string, StreamingDraftState>>({});

  const [referenceSearchOpen, setReferenceSearchOpen] = useState(false);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('');
  const [referenceTriggerIndex, setReferenceTriggerIndex] = useState(-1);
  const [referenceSearchIndex, setReferenceSearchIndex] = useState(0);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashTriggerIndex, setSlashTriggerIndex] = useState(-1);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [availableSlashCommands, setAvailableSlashCommands] = useState<SlashCommandEntry[]>([]);
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
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingDraftBufferRef = useRef<Record<string, StreamingDraftState>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const runningSubmissionRef = useRef<{ assistantMessageId: string; runtimeStoreThreadId: string } | null>(null);
  const runtimeSkillRegistryRef = useRef(
    createRuntimeSkillRegistry(getDefaultRuntimeSkillDefinitions())
  );
  const skillCatalogLifecycleSignatureRef = useRef('');

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
    requirementDocs,
    activeKnowledgeFileId,
    generatedFiles,
    pageStructure,
  } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      requirementDocs: state.requirementDocs,
      activeKnowledgeFileId: state.activeKnowledgeFileId,
      generatedFiles: state.generatedFiles,
      pageStructure: state.pageStructure,
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

  const {
    ensureProjectState,
    upsertSession,
    setActiveSession,
    setActivityEntries,
    updateMessage,
    queueComposerPrefill,
    clearComposerPrefill,
    syncSessionReplayState,
    replaceSessionMessages,
    removeSession,
  } = useAIChatStore(
    useShallow((state) => ({
      ensureProjectState: state.ensureProjectState,
      upsertSession: state.upsertSession,
      setActiveSession: state.setActiveSession,
      setActivityEntries: state.setActivityEntries,
      updateMessage: state.updateMessage,
      queueComposerPrefill: state.queueComposerPrefill,
      clearComposerPrefill: state.clearComposerPrefill,
      syncSessionReplayState: state.syncSessionReplayState,
      replaceSessionMessages: state.replaceSessionMessages,
      removeSession: state.removeSession,
    }))
  );
  const {
    appendTimelineEvent: appendRuntimeTimelineEvent,
    setReplayEvents: setRuntimeReplayEvents,
    appendReplayEvent: cacheReplayEventEntry,
    setRecoveryState: setRuntimeRecoveryState,
    clearReplayResumeRequest,
    setActiveSkills,
    pruneThreadHistorySince,
    patchLiveState,
  } = useAgentRuntimeStore(
    useShallow((state) => ({
      appendTimelineEvent: state.appendTimelineEvent,
      setReplayEvents: state.setReplayEvents,
      appendReplayEvent: state.appendReplayEvent,
      setRecoveryState: state.setRecoveryState,
      clearReplayResumeRequest: state.clearReplayResumeRequest,
      setActiveSkills: state.setActiveSkills,
      pruneThreadHistorySince: state.pruneThreadHistorySince,
      patchLiveState: state.patchLiveState,
    }))
  );
  const currentProjectId = currentProject?.id || null;
  const {
    sessions,
    activeSessionId,
    activeSession,
    approvalThreadId: activeApprovalThreadId,
    checkpointThreadId: activeCheckpointThreadId,
    taskThreadId: activeTaskThreadId,
  } = useActiveConversationSelection({
    projectId: currentProjectId,
  });
  const { timelineProjectionByMessageId, timelineProjectionByRunId } = useRuntimeConversationGateway({
    projectId: currentProjectId,
  });
  const {
    pendingQuestionSummary: activePendingQuestionSummary,
    statusVerb: activeStatusVerb,
  } = useActiveConversationRunStateSignals({
    projectId: currentProjectId,
  });
  const {
    permissionMode,
    enqueueApproval,
    resolveApproval: resolveStoredApproval,
    setPermissionMode,
    setSandboxPolicy,
  } = useApprovalStore(
    useShallow((state) => ({
      permissionMode: state.permissionMode,
      enqueueApproval: state.enqueueApproval,
      resolveApproval: state.resolveApproval,
      setPermissionMode: state.setPermissionMode,
      setSandboxPolicy: state.setSandboxPolicy,
    }))
  );
  const runtimeProviderId = (providerExecutionMode || 'built-in') as AgentProviderId;

  useEffect(() => {
    let alive = true;

    void (async () => {
      const settings = await getAgentRuntimeSettings();
      if (!alive) {
        return;
      }

      setSandboxPolicy(settings.sandboxPolicy);
      setPermissionMode(settings.permissionMode || sandboxPolicyToPermissionMode(settings.sandboxPolicy));
    })();

    return () => {
      alive = false;
    };
  }, [setPermissionMode, setSandboxPolicy]);

  useEffect(() => {
    if (!currentProjectId || runtimeConversationInitializationInFlight.has(currentProjectId)) {
      return;
    }

    const projectId = currentProjectId;
    runtimeConversationInitializationInFlight.add(projectId);
    void (async () => {
      try {
        ensureProjectState(projectId);

        await initializeRuntimeSidecarProjectSessions(projectId);
      } finally {
        runtimeConversationInitializationInFlight.delete(projectId);
      }
    })();

    return undefined;
  }, [
    currentProjectId,
    ensureProjectState,
    runtimeProviderId,
  ]);

  useEffect(() => {
    void initializeRuntimeSidecarMcpServers();
  }, []);

  const latestTurnSession = useAgentRuntimeStore((state) =>
    activeSessionId ? getLatestTurnSession(state.sessionsByThread[activeSessionId]) || null : null,
  );
  const activeReplayResumeRequest = useAgentRuntimeStore((state) =>
    activeSessionId ? state.resumeRequestsByThread[activeSessionId] || null : null,
  );
  const activityEntries = useAIChatStore((state) =>
    currentProjectId ? state.projects[currentProjectId]?.activityEntries || EMPTY_ACTIVITY_ENTRIES : EMPTY_ACTIVITY_ENTRIES,
  );
  const pendingApprovalCount = useApprovalStore((state) =>
    activeApprovalThreadId
      ? (state.approvalsByThread[activeApprovalThreadId] || EMPTY_PENDING_APPROVALS).filter(
          (approval) => approval.status === 'pending',
        ).length
      : 0,
  );
  const replayRecoveryController = useMemo(
    () =>
      createReplayRecoveryController({
        appendReplayEvent: appendRuntimeSidecarReplayHistoryEntry,
        appendReplayEventToStore: cacheReplayEventEntry,
        getReplayEvents: (threadId) => useAgentRuntimeStore.getState().replayEventsByThread[threadId] || [],
        setRecoveryState: (threadId, recoveryState) => {
          setRuntimeRecoveryState(threadId, recoveryState);
          if (!currentProject) {
            return;
          }
          syncSessionReplayState(
            currentProject.id,
            threadId,
            recoveryState.replayThreadId,
            useAgentRuntimeStore.getState().replayEventsByThread[recoveryState.replayThreadId] || [],
            recoveryState
          );
        },
      }),
    [cacheReplayEventEntry, currentProject, setRuntimeRecoveryState, syncSessionReplayState]
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
    if (!activeSession?.id || !activeSession.runtimeThreadId) {
      return;
    }

    if (activeSession.replayEvents.length > 0) {
      setRuntimeReplayEvents(activeSession.runtimeThreadId, activeSession.replayEvents);
    }
    if (activeSession.recoveryState) {
      setRuntimeRecoveryState(activeSession.id, activeSession.recoveryState);
      const latestSkillSnapshot = getLatestReplaySkillSnapshot(activeSession.recoveryState);
      if (latestSkillSnapshot?.activeSkillIds) {
        setActiveSkills(
          activeSession.id,
          runtimeSkillRegistryRef.current.restoreActiveSkills(
            activeSession.id,
            latestSkillSnapshot.activeSkillIds,
          ),
        );
      }
    }
  }, [
    activeSession?.id,
    activeSession?.runtimeThreadId,
    activeSession?.recoveryState,
    activeSession?.replayEvents,
    setActiveSkills,
    setRuntimeRecoveryState,
    setRuntimeReplayEvents,
  ]);
  useEffect(() => {
    const runtimeThreadId = activeSession?.runtimeThreadId;
    if (!runtimeThreadId) {
      return;
    }

    void initializeRuntimeSidecarMcpToolCalls(runtimeThreadId);
  }, [activeSession?.runtimeThreadId]);
  useEffect(() => {
    const runtimeThreadId = activeSession?.runtimeThreadId;
    if (!runtimeThreadId) {
      return;
    }

    let alive = true;

    void (async () => {
      const replayEvents = await initializeRuntimeSidecarReplayHistory(runtimeThreadId);
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
        if (currentProject) {
          syncSessionReplayState(
            currentProject.id,
            activeSession.id,
            runtimeThreadId,
            replayEvents,
            recoveryState
          );
        }
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
  }, [
    activeSession?.id,
    activeSession?.runtimeThreadId,
    currentProject,
    replayRecoveryController,
    setActiveSkills,
    setRuntimeReplayEvents,
    syncSessionReplayState,
  ]);
  useEffect(() => {
    if (!activeCheckpointThreadId) {
      setTurnCheckpoints([]);
      return;
    }

    let alive = true;

    void (async () => {
      const checkpoints = await listRuntimeSidecarCheckpoints(activeCheckpointThreadId);
      if (!alive) {
        return;
      }

      setTurnCheckpoints(checkpoints);
    })();

    return () => {
      alive = false;
    };
  }, [activeCheckpointThreadId, activeSession?.updatedAt]);

  useEffect(() => {
    if (!activeTaskThreadId || !activeSessionId) {
      return;
    }

    let alive = true;

    void (async () => {
      await initializeRuntimeSidecarBackgroundTasks(activeTaskThreadId);
      if (!alive) {
        return;
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeSessionId, activeTaskThreadId]);
  const updateAssistantMessageTimeline = useCallback(
    (
      messageId: string,
      updater: (timeline: AssistantTimelineEvent[]) => AssistantTimelineEvent[]
    ) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        ...(message.role === 'assistant'
          ? {
              timeline: updater(message.timeline),
            }
          : {}),
      }));
      const currentDraft = streamingDraftBufferRef.current[messageId];
      if (currentDraft) {
        streamingDraftBufferRef.current = {
          ...streamingDraftBufferRef.current,
          [messageId]: {
            ...currentDraft,
            timeline: updater(currentDraft.timeline),
          },
        };
        setStreamingDraftContents({ ...streamingDraftBufferRef.current });
      }
    },
    [activeSessionId, currentProject, updateMessage]
  );
  const {
    handleApproveRuntimeApproval,
    handleDenyRuntimeApproval,
    handleAnswerRuntimeQuestion,
    stopPendingRuntimeInteractions,
  } = useAIChatRuntimeInteractionState({
    activeSessionId,
    enqueueAgentApproval,
    enqueueApproval,
    resolveStoredApproval,
    resolveAgentApproval,
    patchLiveState,
    appendRuntimeTimelineEvent,
    persistRuntimeTimelineEvent,
    replayRecoveryController,
    updateAssistantMessageTimeline,
  });

  const renderRuntimeQuestionCard = useCallback(
    (message: StoredChatMessage): MessageBubbleCard[] | null => {
      const questionEntries = getRuntimeQuestionRenderEntries(message);

      if (questionEntries.length === 0) {
        return null;
      }

      return questionEntries.map(({ event, createdAt, timelineOrder }) => ({
        node: (
          <AIChatRuntimeTimelineInteractionEvent
            messageId={message.id}
            event={event}
            summarizeProjectFilePath={summarizeProjectFilePath}
            onApprove={(approvalId) => void handleApproveRuntimeApproval(approvalId)}
            onDeny={(approvalId) => void handleDenyRuntimeApproval(approvalId)}
            onAnswerQuestion={(messageId, question, answers) =>
              void handleAnswerRuntimeQuestion(messageId, question, answers)
            }
            approvalStatusLabelMap={approvalStatusLabelMap}
            approvalRiskLabelMap={approvalRiskLabelMap}
            approvalActionLabelMap={approvalActionLabelMap}
          />
        ),
        createdAt,
        timelineOrder,
      }));
    },
    [
      approvalActionLabelMap,
      approvalRiskLabelMap,
      approvalStatusLabelMap,
      handleAnswerRuntimeQuestion,
      handleApproveRuntimeApproval,
      handleDenyRuntimeApproval,
      summarizeProjectFilePath,
    ]
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

  const renderProjectFileProposal = useCallback(
    (message: { id: string; projectFileProposal?: ProjectFileProposal }) => {
      const proposal = message.projectFileProposal;
      if (!proposal) {
        return null;
      }
      if (proposal.status === 'pending') {
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
        </section>
      );
    },
    []
  );
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const updateAutoScrollState = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= 48;
    };

    updateAutoScrollState();
    container.addEventListener('scroll', updateAutoScrollState, { passive: true });
    return () => container.removeEventListener('scroll', updateAutoScrollState);
  }, []);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth', block: 'end' });
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    const behavior: ScrollBehavior = isLoading ? 'auto' : 'smooth';
    const scrollToBottom = () => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    };

    scrollToBottom();
    const frameId = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frameId);
  }, [activeSession?.messages, isLoading, streamingDraftContents]);

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

    void loadRuntimeSkillCatalog({
      projectRoot: currentProject?.vaultPath || null,
    }).then(async (catalog) => {
      if (cancelled) {
        return;
      }

      const { skills, discoveredSkills, loadedSkills } = catalog;
      runtimeSkillRegistryRef.current = createRuntimeSkillRegistry(skills);
      setAvailableSlashCommands(
        skills
          .filter((skill) => skill.userInvocable)
          .map((skill) => ({
            id: skill.id,
            name: skill.id,
            description: skill.description || skill.whenToUse || skill.name,
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
      );

      if (!currentProject || !activeSession?.id || !activeSession.runtimeThreadId) {
        return;
      }

      if (discoveredSkills.length === 0 && loadedSkills.length === 0) {
        return;
      }

      const replayThreadId = activeSession.runtimeThreadId;
      const lifecycleSignature = buildSkillCatalogLifecycleSignature({
        sessionId: activeSession.id,
        replayThreadId,
        projectRoot: currentProject.vaultPath || '',
        discoveredSkills: discoveredSkills.map((skill) => ({
          id: skill.id,
          source: skill.imported ? 'local' : 'project',
        })),
        loadedSkills: loadedSkills.map((skill) => ({
          id: skill.id,
          source: skill.source,
        })),
      });

      if (skillCatalogLifecycleSignatureRef.current === lifecycleSignature) {
        return;
      }
      skillCatalogLifecycleSignatureRef.current = lifecycleSignature;

      const discoveryLifecycle = buildSkillDiscoveryLifecycleDescriptor({
        toolCallId: createRuntimeEventId('skill-discover'),
        discoveredSkills: discoveredSkills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          source: skill.imported ? 'local' : 'project',
        })),
      });
      const loadLifecycle = buildSkillLoadLifecycleDescriptor({
        toolCallId: createRuntimeEventId('skill-load'),
        loadedSkills,
      });
      const timelineEvents = [discoveryLifecycle, loadLifecycle];

      for (const lifecycleEvent of timelineEvents) {
        appendRuntimeTimelineEvent(activeSession.id, {
          id: createRuntimeEventId(lifecycleEvent.toolName),
          threadId: activeSession.id,
          providerId: activeSession.providerId,
          summary: lifecycleEvent.timelineSummary,
          createdAt: Date.now(),
        });
        await persistRuntimeTimelineEvent({
          threadId: replayThreadId,
          providerId: activeSession.providerId,
          summary: lifecycleEvent.timelineSummary,
        });
        await replayRecoveryController.appendAndSync({
          runtimeStoreThreadId: activeSession.id,
          replayThreadId,
          eventType: lifecycleEvent.replayEventType,
          payload: lifecycleEvent.replayPayload,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeSession?.id,
    activeSession?.providerId,
    activeSession?.runtimeThreadId,
    currentProject,
    replayRecoveryController,
    setAvailableSlashCommands,
    appendRuntimeTimelineEvent,
  ]);

  const {
    filteredConfigs,
    selectedRuntimeConfig,
    isRuntimeConfigured,
    selectedSettingsConfig,
    selectedSettingsPreset,
    selectedProviderTypeOption,
    settingsModelOptions,
    selectedProviderListMode,
    selectedProviderEndpoint,
    isSettingsDraftComplete,
    isSettingsDraftSelected,
    customHeadersJsonValid,
    showApiKey,
    setShowApiKey,
    providerSearch,
    setProviderSearch,
    testState,
    setTestState,
    testMessage,
    setTestMessage,
    isLoadingModels,
    setSelectedSettingsConfigId,
    settingsDraft,
    setSettingsDraft,
    jsonImportText,
    setJsonImportText,
    showJsonImport,
    setShowJsonImport,
    handleTestConnection,
    handleLoadModels,
    handleApplySettings,
    handleToggleEnabled,
    handleCreateConfig,
    handleDeleteConfig,
    handleSelectConfig,
    handleExportConfigs,
    handleImportConfigs,
    resetSettingsTransientUi,
  } = useAIChatSettingsState({
    aiConfigs,
    runtimeConfigIdOverride,
    selectedConfigId,
    addConfig,
    updateConfig,
    deleteConfig,
    selectConfig,
    setConfigEnabled,
    buildSettingsDraft,
    findPresetByConfig,
    customProviderPreset: CUSTOM_PROVIDER_PRESET,
    providerTypeOptions: AI_PROVIDER_TYPE_OPTIONS,
    buildProviderKey,
    mergeModelCandidates,
    buildProviderEndpointPreview,
    getSuggestedBaseURL,
    loadAIServiceModule,
  });

  const selectedSettingsTabMeta = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab) || SETTINGS_TABS[0],
    [activeSettingsTab]
  );
  const renderSettingsPlaceholder = useCallback(
    (tab: typeof SETTINGS_TABS[number]) => (
      <div className="chat-settings-placeholder-page">
        <section className="chat-settings-placeholder-card">
          <div className="chat-settings-eyebrow">{tab.eyebrow}</div>
          <strong>{tab.title}</strong>
          <p>{tab.description}</p>
          <span>这个页面已经进入 Agent Settings 信息架构，底层能力会按 GoodNight runtime 逐步接入。</span>
        </section>
        <section className="chat-settings-placeholder-card muted">
          <strong>当前状态</strong>
          <p>保留完整入口，避免设置页出现空白、死链或分散管理。</p>
        </section>
      </div>
    ),
    [],
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

    return [...vaultFiles, ...generatedContextFiles].filter(
      (file) => !isInternalAssistantReferencePath(file.path)
    );
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

    return labels;
  }, [
    aiContextState?.selectedReferenceFileIds,
    visibleContextFiles,
  ]);
  const resolvedReferenceContextFiles = useMemo(() => {
    const visibleFileById = new Map(visibleContextFiles.map((file) => [file.id, file]));
    const selectedReferenceIds = aiContextState?.selectedReferenceFileIds || [];

    return Array.from(new Set(selectedReferenceIds))
      .map((referenceId) => visibleFileById.get(referenceId) || null)
      .filter((file): file is NonNullable<typeof file> => Boolean(file));
  }, [
    aiContextState?.selectedReferenceFileIds,
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
  const runtimeContextLabels = useMemo(
    () =>
      [
        selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
        contextSnapshot.primaryLabel,
        contextSnapshot.secondaryLabel,
        contextSnapshot.currentFileLabel,
        contextSnapshot.vaultLabel,
        ...explicitReferenceLabels,
      ].filter((item): item is string => Boolean(item)),
    [
      contextSnapshot.currentFileLabel,
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      contextSnapshot.vaultLabel,
      explicitReferenceLabels,
      selectedRuntimeConfig,
    ]
  );

  const getConversationHistory = useCallback(() => {
    if (!currentProjectId || !activeSession?.id) {
      return [];
    }

    const latestSession =
      useAIChatStore.getState().projects[currentProjectId]?.sessions.find((session) => session.id === activeSession.id) || null;

    return toConversationHistoryMessages(latestSession?.messages || []);
  }, [activeSession?.id, currentProjectId]);

  const currentContextUsage = useMemo(() => {
    const previewPrompt = buildDirectChatPrompt({
      userInput: input.trim() || '继续当前对话',
      currentProjectName: currentProject?.name,
      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 258000,
      skillIntent: null,
      conversationHistory: getConversationHistory(),
      referenceContext: previewReferenceContext,
      contextLabels: runtimeContextLabels,
    });

    return buildContextUsageSummary(
      [previewPrompt.systemPrompt, previewPrompt.prompt],
      selectedRuntimeConfig?.contextWindowTokens || 258000
    );
  }, [
    getConversationHistory,
    currentProject?.name,
    input,
    activeSession?.messages,
    previewReferenceContext,
    runtimeContextLabels,
    selectedRuntimeConfig,
  ]);
  const selectedAgent = useMemo(
    () => CHAT_AGENTS.find((agent) => agent.id === selectedChatAgentId) || CHAT_AGENTS[0],
    [selectedChatAgentId]
  );
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
  const latestTurnSessionStatus = latestTurnSession?.status || null;
  const { stalled, stallDuration: currentStallDuration } = useStallDetector(
    isLoading,
    stallFP,
    10000,
  );
  const runStateLabel =
    latestTurnSessionStatus === 'planning'
      ? 'Planning'
      : latestTurnSessionStatus === 'waiting_approval'
        ? 'Approval required'
        : activePendingQuestionSummary
          ? 'Input required'
        : latestTurnSessionStatus === 'executing'
          ? stalled ? `Executing (stalled ${(currentStallDuration / 1000).toFixed(0)}s)` : 'Executing'
          : latestTurnSessionStatus === 'resumable'
            ? 'Resume ready'
            : latestTurnSessionStatus === 'completed'
              ? 'Completed'
              : latestTurnSessionStatus === 'failed'
                ? 'Failed'
                : pendingApprovalCount > 0
                  ? 'Approval required'
                  : activeStatusVerb
                    ? activeStatusVerb
                    : isLoading
                      ? 'Running'
                      : latestActivityEntry?.type === 'failed'
                        ? 'Failed'
                        : 'Ready';
  const runStateTone =
    latestTurnSessionStatus === 'waiting_approval' || latestTurnSessionStatus === 'resumable'
      ? 'warning'
      : activePendingQuestionSummary
        ? 'warning'
      : latestTurnSessionStatus === 'failed'
        ? 'error'
        : latestTurnSessionStatus === 'completed'
          ? 'success'
          : pendingApprovalCount > 0
      ? 'warning'
      : isLoading
        ? stalled ? 'stalled' : 'running'
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
    setStreamingDraftContents(nextDrafts);
  }, []);
  const commitStreamingDraft = useCallback(
    (messageId: string) => {
      const draft = streamingDraftBufferRef.current[messageId];
      if (!draft || !currentProject || !activeSessionId) {
        return;
      }

      const timeline = applyAssistantReasoningProgress(draft.timeline, {
        active: false,
        referenceTime: Date.now(),
      });
      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        ...(message.role === 'assistant' ? { timeline } : {}),
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );
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
        const diff = await getRuntimeSidecarCheckpointDiff({
          threadId: activeCheckpointThreadId,
          runId,
          path: relativePath,
        });
        if (!diff) {
          throw new Error('Node runtime sidecar 未启动，无法加载 checkpoint diff。');
        }
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
  const renderCheckpointDiffPanel = useCallback(
    (runId: string, path: string) => {
      const diffKey = buildRunDiffKey(runId, path);
      const diffState = runDiffsByKey[diffKey];
      const isExpanded = expandedRunDiffKey === diffKey;

      if (!isExpanded) {
        return null;
      }

      return (
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
                .filter((entry) => entry.filesChanged.some((changedFile) => changedFile.path === path))
                .map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chat-file-preview-history-item ${entry.runId === runId ? 'active' : ''}`}
                    onClick={() => void loadCheckpointDiff(entry.runId, path)}
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
      );
    },
    [expandedRunDiffKey, formatTimestamp, loadCheckpointDiff, runDiffsByKey, selectedChangedPathHistory]
  );
  const handleRewindRun = useCallback(
    async (checkpoint: AgentTurnCheckpointRecord) => {
      if (!currentProject || !activeSessionId || !activeCheckpointThreadId || isRewindingRunId) {
        return;
      }

      setIsRewindingRunId(checkpoint.runId);
      setRewindError('');

      try {
        const result = await rewindRuntimeSidecarCheckpoint({
          threadId: activeCheckpointThreadId,
          runId: checkpoint.runId,
        });
        if (!result) {
          throw new Error('Node runtime sidecar 未启动，无法回滚 checkpoint。');
        }
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
        const replayEvents = await initializeRuntimeSidecarReplayHistory(activeCheckpointThreadId);
        setRuntimeReplayEvents(activeCheckpointThreadId, replayEvents);
        const recoveryState = buildReplayRecoveryState(activeCheckpointThreadId, replayEvents);
        setRuntimeRecoveryState(activeSessionId, recoveryState);
        syncSessionReplayState(
          currentProject.id,
          activeSessionId,
          activeCheckpointThreadId,
          replayEvents,
          recoveryState
        );
        const rollbackLifecycle = buildMemoryRollbackLifecycleDescriptor({
          threadId: activeCheckpointThreadId,
          runId: checkpoint.runId,
          restoredPaths: result.restoredPaths,
          removedRunIds: result.removedRunIds,
        });
        appendRuntimeTimelineEvent(activeSessionId, {
          id: createRuntimeEventId('memory-rollback'),
          threadId: activeSessionId,
          providerId: activeSession?.providerId || runtimeProviderId,
          summary: rollbackLifecycle.timelineSummary,
          createdAt: Date.now(),
        });
        await persistRuntimeTimelineEvent({
          threadId: activeCheckpointThreadId,
          providerId: activeSession?.providerId || runtimeProviderId,
          summary: rollbackLifecycle.timelineSummary,
        });
        await replayRecoveryController.appendAndSync({
          runtimeStoreThreadId: activeSessionId,
          replayThreadId: activeCheckpointThreadId,
          eventType: rollbackLifecycle.replayEventType,
          payload: rollbackLifecycle.replayPayload,
        });
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
      activeSession?.providerId,
      activeSession?.messages,
      activeSessionId,
      activityEntries,
      currentProject,
      expandedDiffTarget,
      isRewindingRunId,
      pruneThreadHistorySince,
      replayRecoveryController,
      replaceSessionMessages,
      setActivityEntries,
      setRuntimeRecoveryState,
      setRuntimeReplayEvents,
      syncSessionReplayState,
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
                const isActiveDiff = isRunDiffActive(expandedRunDiffKey, checkpoint.runId, file.path);
                return (
                  <div key={`${checkpoint.runId}:${file.path}`} className="chat-run-summary-file">
                    <button
                      type="button"
                      className={`chat-run-summary-item ${isActiveDiff ? 'active' : ''}`}
                      onClick={() => void loadCheckpointDiff(checkpoint.runId, file.path)}
                    >
                      <strong title={file.path}>{summarizeProjectFilePath(file.path)}</strong>
                      <span>
                        {getCheckpointChangeTypeLabel(file.changeType)}
                        {' · '}+{file.insertions} / -{file.deletions}
                      </span>
                    </button>
                    {renderCheckpointDiffPanel(checkpoint.runId, file.path)}
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
              const isActiveDiff = isRunDiffActive(expandedRunDiffKey, message.runId!, changedPath);
              return (
                <button
                  key={changedPath}
                  type="button"
                  className={`chat-run-summary-item ${isActiveDiff ? 'active' : ''}`}
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
      renderCheckpointDiffPanel,
      rewindError,
      rewindTargetRunId,
      turnCheckpointsByRunId,
    ]
  );
  const renderTimelineCards = useCallback((message: StoredChatMessage): MessageBubbleCard[] | null => {
    if (message.role !== 'assistant') {
      return null;
    }

    const projection =
      (message.runId ? timelineProjectionByRunId[message.runId] : null) ||
      timelineProjectionByMessageId[message.id] ||
      null;

    const descriptors = buildChatTimelineBubbleCards(projection);
    if (descriptors.length === 0) {
      return null;
    }

    return descriptors.map((descriptor) => ({
      node: <ChatTimelineBubbleCard key={descriptor.cardId} descriptor={descriptor} />,
      createdAt: descriptor.createdAt,
      timelineOrder: descriptor.timelineOrder,
    }));
  }, [timelineProjectionByMessageId, timelineProjectionByRunId]);
  const renderToolExecutionCard = useCallback((message: StoredChatMessage) => {
    const teamRun = message.teamRun || null;

    if (!teamRun) {
      return null;
    }

    return [
      {
        node: (
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
                    <summary className="chat-inline-disclosure chat-tool-trace-phase-summary">
                      <div className="chat-inline-disclosure-copy">
                        <strong>{phase.title}</strong>
                        <span>{phase.status}</span>
                      </div>
                      <span className="chat-inline-disclosure-caret" aria-hidden="true" />
                    </summary>
                    <div className="chat-tool-trace-members">
                      {phaseMembers.map((member) => (
                        <details key={member.id} className="chat-tool-trace-member">
                          <summary className="chat-inline-disclosure chat-tool-trace-member-summary">
                            <div className="chat-inline-disclosure-copy">
                              <strong>{member.title}</strong>
                              <span>{member.agentId} / {member.status}</span>
                            </div>
                            <span className="chat-inline-disclosure-caret" aria-hidden="true" />
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
        ),
        createdAt: message.createdAt,
      },
    ];
  }, [
  ]);
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setActiveSettingsTab('ai');
    resetSettingsTransientUi();
  }, [resetSettingsTransientUi]);
  const { handleCreateSession, submitPrompt } = useAIChatSidecarSessionActions({
    currentProjectId,
    currentProjectName: currentProject?.name || null,
    projectRoot: currentProject?.vaultPath || null,
    runtimeProviderId,
    activeSession,
    permissionMode,
    getConversationHistory: getConversationHistory,
    referenceFiles: resolvedReferenceContextFiles,
    contextLabels: runtimeContextLabels,
    selectedRuntimeConfig,
    selectedChatAgentId,
    isSelectedChatAgentReady: agentAvailability[selectedChatAgentId].ready,
    setSelectedChatAgentId,
    setInput,
    setShowHistoryMenu,
    createWelcomeSession,
    upsertSession,
    setActiveSession,
  });

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
      setSlashMenuOpen(false);
      setSlashFilter('');
      setSlashTriggerIndex(-1);
      setInput('');
      await submitPrompt(nextInput);
    },
    [input, submitPrompt]
  );

  const handleStopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    stopRequestedRef.current = true;
    stopPendingRuntimeInteractions();
    const submission = runningSubmissionRef.current;
    if (submission) {
      commitStreamingDraft(submission.assistantMessageId);
      clearStreamingDraft(submission.assistantMessageId);
      patchLiveState(submission.runtimeStoreThreadId, (state) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: '',
        activeThinking: false,
        activeToolName: null,
        streamingToolInput: '',
        streamingText: '',
        pendingQuestionSummary: null,
        pendingApprovalSummary: null,
        pendingPermissionCount: 0,
      }));
      runningSubmissionRef.current = null;
    }
    setIsLoading(false);
  }, [clearStreamingDraft, commitStreamingDraft, patchLiveState, setIsLoading, stopPendingRuntimeInteractions]);

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

      if (currentProject && activeSessionId) {
        queueComposerPrefill(currentProject.id, activeSessionId, detail.prompt);
        return;
      }

      setInput(detail.prompt);
    };

    window.addEventListener(AI_CHAT_COMMAND_EVENT, handleExternalCommand as EventListener);
    return () => {
      window.removeEventListener(AI_CHAT_COMMAND_EVENT, handleExternalCommand as EventListener);
    };
  }, [activeSessionId, currentProject, queueComposerPrefill, submitPrompt]);

  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const detail = (event as CustomEvent<AIChatSettingsDetail>).detail || {};
      setActiveSettingsTab(resolveSettingsTabId(detail.tab));
      setIsSettingsOpen(true);
    };

    window.addEventListener(AI_CHAT_SETTINGS_EVENT, handleOpenSettings as EventListener);
    return () => {
      window.removeEventListener(AI_CHAT_SETTINGS_EVENT, handleOpenSettings as EventListener);
    };
  }, []);

  useEffect(() => {
    const composerPrefill = activeSession?.composerPrefill;
    if (!currentProject || !activeSessionId || !composerPrefill?.prompt) {
      return;
    }

    setInput(composerPrefill.prompt);
    setReferenceSearchOpen(false);
    setReferenceSearchQuery('');
    setReferenceTriggerIndex(-1);
    setSlashMenuOpen(false);
    setSlashFilter('');
    setSlashTriggerIndex(-1);
    clearComposerPrefill(currentProject.id, activeSessionId);

    requestAnimationFrame(() => {
      const cursor = composerPrefill.prompt.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }, [activeSession?.composerPrefill, activeSessionId, clearComposerPrefill, currentProject]);

  useEffect(() => {
    setReferenceSearchIndex(0);
  }, [referenceSearchQuery, referenceSearchOpen]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashFilter, slashMenuOpen]);

  const filteredSlashCommands = useMemo(() => {
    const normalized = slashFilter.trim().toLowerCase();
    if (!normalized) {
      return availableSlashCommands;
    }

    return availableSlashCommands.filter((command) =>
      command.name.toLowerCase().includes(normalized) || command.description.toLowerCase().includes(normalized)
    );
  }, [availableSlashCommands, slashFilter]);

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

      const slashTrigger = findSlashTrigger(value, cursorPos);
      if (slashTrigger) {
        setSlashTriggerIndex(slashTrigger.triggerIndex);
        setSlashFilter(slashTrigger.filter);
        setSlashMenuOpen(true);
        setReferenceSearchOpen(false);
        setReferenceSearchQuery('');
        setReferenceTriggerIndex(-1);
        return;
      }

      setSlashMenuOpen(false);
      setSlashFilter('');
      setSlashTriggerIndex(-1);

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

  const handleSlashCommandSelect = useCallback(
    (entry: SlashCommandEntry) => {
      if (slashTriggerIndex < 0) {
        return;
      }

      const cursorPos = textareaRef.current?.selectionStart ?? input.length;
      const tokenEnd = Math.max(cursorPos, slashTriggerIndex + 1 + slashFilter.length);
      const nextValue = `${input.slice(0, slashTriggerIndex)}/${entry.name} ${input.slice(tokenEnd)}`;
      const nextCursorPos = slashTriggerIndex + entry.name.length + 2;
      setInput(nextValue);
      setSlashMenuOpen(false);
      setSlashFilter('');
      setSlashTriggerIndex(-1);

      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursorPos, nextCursorPos);
      });
    },
    [input, slashFilter.length, slashTriggerIndex]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashSelectedIndex((current) =>
          filteredSlashCommands.length === 0 ? 0 : (current + 1) % filteredSlashCommands.length
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashSelectedIndex((current) =>
          filteredSlashCommands.length === 0 ? 0 : (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
        );
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashMenuOpen(false);
        setSlashFilter('');
        setSlashTriggerIndex(-1);
        return;
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && filteredSlashCommands.length > 0) {
        event.preventDefault();
        const selectedCommand = filteredSlashCommands[slashSelectedIndex];
        if (selectedCommand) {
          handleSlashCommandSelect(selectedCommand);
        }
        return;
      }
    }

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
    <AIChatConversationMessagesPane
      projectId={currentProjectId}
      draftContents={streamingDraftContents}
      formatTimestamp={formatTimestamp}
      parseMessageParts={parseAIChatMessageParts}
      renderMessagePart={renderMessagePart}
      renderStructuredCards={renderStructuredCards}
      renderProjectFileProposal={renderProjectFileProposal}
      renderTimelineCards={renderTimelineCards}
      renderToolExecutionCard={renderToolExecutionCard}
      renderRunSummaryCard={renderRunSummaryCard}
      renderRuntimeQuestion={renderRuntimeQuestionCard}
      messageListRef={messageListRef}
      messagesEndRef={messagesEndRef}
      summarizeProjectFilePath={summarizeProjectFilePath}
      onApprove={handleApproveRuntimeApproval}
      onDeny={handleDenyRuntimeApproval}
      approvalStatusLabelMap={approvalStatusLabelMap}
      approvalRiskLabelMap={approvalRiskLabelMap}
      approvalActionLabelMap={approvalActionLabelMap}
    />
  );
  useEffect(() => {
    if (selectedChatAgentId !== 'built-in' && !agentAvailability[selectedChatAgentId].ready) {
      setSelectedChatAgentId('built-in');
    }
  }, [agentAvailability, selectedChatAgentId]);

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

            <div className="chat-shell-header-actions">
              {showExpandedShell ? (
                <>
                  <div className="chat-header-menu">
                    <button
                      className="chat-shell-icon-btn"
                      type="button"
                      aria-label="历史会话"
                      title="历史会话"
                      onClick={() => {
                        setShowHistoryMenu((current) => !current);
                      }}
                    >
                      <HistoryIcon />
                    </button>
                    {historyMenu}
                  </div>
                  <button
                    className="chat-shell-icon-btn"
                    type="button"
                    aria-label="新对话"
                    title="新对话"
                    onClick={handleCreateSession}
                  >
                    <ComposeIcon />
                  </button>
                  <button
                    className="chat-shell-icon-btn"
                    type="button"
                    aria-label="设置"
                    title="设置"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <SettingsIcon />
                  </button>
                  {headerActionSlot}
                </>
              ) : null}

              {!isEmbedded ? (
                <button
                  className="chat-shell-icon-btn"
                  type="button"
                  aria-label={isCollapsed ? '展开聊天栏' : '收起聊天栏'}
                  title={isCollapsed ? '展开聊天栏' : '收起聊天栏'}
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
                        {slashMenuOpen ? (
                          <AIChatSlashCommandMenu
                            entries={filteredSlashCommands}
                            selectedIndex={slashSelectedIndex}
                            onHover={setSlashSelectedIndex}
                            onSelect={handleSlashCommandSelect}
                          />
                        ) : null}
                      </>
                    }
                    toolbarStartContent={
                      <ChatSandboxPolicySelector
                        value={permissionMode}
                        onChange={async (mode) => {
                          const nextMode = await setAgentPermissionMode(mode);
                          setPermissionMode(nextMode);
                          setSandboxPolicy(permissionModeToSandboxPolicy(nextMode));
                        }}
                      />
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
                    disabled={!input.trim() && !isLoading}
                    onSubmit={isLoading ? handleStopGeneration : () => { void handleSubmit(); }}
                    SendIcon={isLoading ? PauseIcon : SendIcon}
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
                        {slashMenuOpen ? (
                          <AIChatSlashCommandMenu
                            entries={filteredSlashCommands}
                            selectedIndex={slashSelectedIndex}
                            onHover={setSlashSelectedIndex}
                            onSelect={handleSlashCommandSelect}
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
                          type={isLoading ? 'button' : 'submit'}
                          className="chat-send-btn"
                          aria-label={isLoading ? '终止' : '发送'}
                          title={isLoading ? '终止' : '发送'}
                          disabled={!input.trim() && !isLoading}
                          onClick={isLoading ? handleStopGeneration : undefined}
                        >
                          {isLoading ? <PauseIcon /> : <SendIcon />}
                        </button>
                      </div>

                      <div className="chat-composer-footer">
                        <ChatSandboxPolicySelector
                          value={permissionMode}
                          onChange={async (mode) => {
                            const nextMode = await setAgentPermissionMode(mode);
                            setPermissionMode(nextMode);
                            setSandboxPolicy(permissionModeToSandboxPolicy(nextMode));
                          }}
                        />
                        <div className="chat-composer-meta">
                          <span>{selectedRuntimeConfig ? selectedRuntimeConfig.name : '\u672a\u542f\u7528 AI'}</span>
                          <span className={currentContextUsage.ratio >= 0.8 ? 'warning' : ''}>
                            {currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}
                          </span>
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
                aria-label={selectedSettingsTabMeta.title}
                onClick={(event) => event.stopPropagation()}
              >
        <div className="chat-settings-drawer-header">
          <div>
            <div className="chat-settings-eyebrow">{selectedSettingsTabMeta.eyebrow}</div>
            <strong>{selectedSettingsTabMeta.title}</strong>
            <div className="chat-settings-header-description">{selectedSettingsTabMeta.description}</div>
          </div>
          <button className="chat-settings-close" type="button" aria-label="关闭 AI 设置" onClick={closeSettings}>
            ×
          </button>
        </div>

        <div className="chat-settings-drawer-body">
          <aside className="chat-settings-sidebar">
            <div className="chat-settings-tab-list">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`chat-settings-tab${activeSettingsTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveSettingsTab(tab.id)}
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="chat-settings-panel">
            {activeSettingsTab === 'ai' ? (
              <Suspense
                fallback={(
                  <div className="chat-settings-panel-surface">
                    <div className="chat-settings-placeholder-card muted">
                      <strong>加载 AI 设置中...</strong>
                    </div>
                  </div>
                )}
              >
                <LazyAIChatAISettingsTab
                  providerSearch={providerSearch}
                  setProviderSearch={setProviderSearch}
                  handleCreateConfig={handleCreateConfig}
                  filteredConfigs={filteredConfigs}
                  selectedSettingsConfig={selectedSettingsConfig}
                  getConfigPreset={(config) => findPresetByConfig(config.provider, config.baseURL) || CUSTOM_PROVIDER_PRESET}
                  providerTypeLabel={providerTypeLabel}
                  setSelectedSettingsConfigId={setSelectedSettingsConfigId}
                  setTestState={setTestState}
                  setTestMessage={setTestMessage}
                  settingsDraft={settingsDraft}
                  selectedSettingsPreset={selectedSettingsPreset}
                  isSettingsDraftComplete={isSettingsDraftComplete}
                  isSettingsDraftSelected={isSettingsDraftSelected}
                  selectedProviderTypeDescription={selectedProviderTypeOption.description}
                  providerTypeOptions={AI_PROVIDER_TYPE_OPTIONS}
                  setSettingsDraft={setSettingsDraft}
                  customProviderPresetId={CUSTOM_PROVIDER_PRESET.id}
                  getSuggestedBaseURL={getSuggestedBaseURL}
                  selectedProviderEndpoint={selectedProviderEndpoint}
                  handleLoadModels={handleLoadModels}
                  isLoadingModels={isLoadingModels}
                  selectedProviderListMode={selectedProviderListMode}
                  customHeadersJsonValid={customHeadersJsonValid}
                  settingsModelOptions={settingsModelOptions}
                  handleApplySettings={handleApplySettings}
                  handleToggleEnabled={handleToggleEnabled}
                  handleTestConnection={handleTestConnection}
                  selectedConfigId={selectedConfigId}
                  handleSelectConfig={handleSelectConfig}
                  handleExportConfigs={handleExportConfigs}
                  setShowJsonImport={setShowJsonImport}
                  showJsonImport={showJsonImport}
                  jsonImportText={jsonImportText}
                  setJsonImportText={setJsonImportText}
                  handleImportConfigs={handleImportConfigs}
                  aiConfigs={aiConfigs}
                  handleDeleteConfig={handleDeleteConfig}
                  showApiKey={showApiKey}
                  setShowApiKey={setShowApiKey}
                  testMessage={testMessage}
                  testState={testState}
                />
              </Suspense>
            ) : null}

            {activeSettingsTab === 'skills' ? (
              <div className="chat-settings-surface chat-settings-panel-surface chat-settings-panel-surface-skills">
                <GNAgentSkillsPage />
              </div>
            ) : null}

            {activeSettingsTab === 'mcp' ? (
              <div className="chat-settings-panel-surface">
                <RuntimeMcpSettingsPage threadId={activeSession?.runtimeThreadId || null} />
              </div>
            ) : null}

            {!['ai', 'skills', 'mcp'].includes(activeSettingsTab) ? (
              <div className="chat-settings-panel-surface">
                {renderSettingsPlaceholder(selectedSettingsTabMeta)}
              </div>
            ) : null}
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


