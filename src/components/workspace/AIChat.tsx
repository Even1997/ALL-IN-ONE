import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError, listModelsSupportMode } from '../../modules/ai/core/configStatus';
import { aiService, type AIProviderType } from '../../modules/ai/core/AIService';
import { ToolExecutor, type ToolCall, type ToolResult } from './tools';
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
  type LocalAgentCommandResult,
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
  loadRuntimeSkillDefinitions,
} from '../../modules/ai/skills/skillLibrary';
import type { RuntimeSkillDefinition } from '../../modules/ai/runtime/skills/runtimeSkillTypes';
import { type AIConfigEntry, hasUsableAIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { toRuntimeAIConfig } from '../../modules/ai/store/aiConfigState';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../modules/ai/gn-agent/localConfig';
import {
  appendAgentTimelineEvent as persistRuntimeTimelineEvent,
  createAgentThread as persistRuntimeThread,
  executePrompt as executeRuntimePrompt,
  getAgentRuntimeSettings,
  getAgentTurnCheckpointDiff,
  enqueueAgentApproval,
  listAgentBackgroundTasks,
  listAgentThreads,
  listAgentTurnCheckpoints,
  listAgentApprovals,
  rewindAgentTurn,
  resolveAgentApproval,
  saveAgentTurnCheckpoint,
  setAgentPermissionMode,
  upsertAgentBackgroundTask,
} from '../../modules/ai/runtime/agentRuntimeClient';
import { useApprovalStore } from '../../modules/ai/runtime/approval/approvalStore';
import type { ApprovalRecord, PermissionMode } from '../../modules/ai/runtime/approval/approvalTypes';
import {
  PERMISSION_MODE_LABELS,
  permissionModeToSandboxPolicy,
  sandboxPolicyToPermissionMode,
} from '../../modules/ai/runtime/approval/permissionMode';
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
import { sanitizeInternalWorkspaceMentions } from '../../modules/ai/runtime/orchestration/runtimeDirectChatFlow';
import type {
  AgentBackgroundTaskRecord,
  AgentProviderId,
  AgentTurnCheckpointDiff,
  AgentTurnCheckpointRecord,
} from '../../modules/ai/runtime/agentRuntimeTypes';
import {
  invokeRuntimeMcpTool,
  listRuntimeMcpServers,
  listRuntimeMcpToolCalls,
} from '../../modules/ai/runtime/mcp/runtimeMcpClient';
import type { RuntimeMcpServer } from '../../modules/ai/runtime/mcp/runtimeMcpTypes';
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
import type { AgentTeamRunRecord } from '../../modules/ai/runtime/teams/teamTypes';
import {
  type ChatSession,
  createChatSession,
  createStoredChatMessage,
  type RuntimeQuestionItem,
  type RuntimeQuestionPayload,
  type StoredChatRuntimeEvent,
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
  findLatestPendingProjectFileProposalAction,
  isShortPendingActionAffirmation,
  isShortPendingActionRejection,
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
import { getDirectoryPath, joinFileSystemPath } from '../../utils/fileSystemPaths';
import { runAIWorkflowPackage } from '../../modules/ai/workflow/AIWorkflowService';
import type { AIWorkflowPackage, AIWorkflowRun } from '../../types';
import {
  GNAgentEmbeddedComposer,
  GNAgentHistoryMenu,
  GNAgentMessageList,
} from '../ai/gn-agent/GNAgentEmbeddedPieces';
import { GNAgentSkillsPage } from '../ai/gn-agent-shell/GNAgentSkillsPage';
import { AIChatReferenceSearchMenu } from './AIChatReferenceSearchMenu';
import { AIChatSlashCommandMenu, type SlashCommandEntry } from './AIChatSlashCommandMenu';
import {
  buildWelcomeMessage,
  getChatShellLayoutClassName,
  getChatViewportClassName,
  getComposerPlaceholder,
} from './aiChatViewState';
import {
  buildAssistantStructuredContentState,
  parseAIChatMessageParts,
  type AIChatMessagePart,
} from './aiChatMessageParts';
import { AssistantTextBlock, AssistantThinkingBlock } from './AIChatAssistantParts';
import { AIChatRuntimeToolExecutionCard } from './AIChatRuntimeToolExecutionCard';
import type { RuntimeEventRenderModel } from './runtimeEventRenderModel';
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

type StreamingDraftState = {
  content: string;
  thinkingContent: string;
  answerContent: string;
  assistantParts: AIChatMessagePart[];
};

const EMPTY_MESSAGES: StoredChatMessage[] = [];
const EMPTY_ACTIVITY_ENTRIES: ActivityEntry[] = [];
const EMPTY_SESSIONS: ChatSession[] = [];
const EMPTY_PENDING_APPROVALS: ApprovalRecord[] = [];
const EMPTY_RUNTIME_SKILLS: RuntimeSkillDefinition[] = [];
const EMPTY_BACKGROUND_TASKS: AgentBackgroundTaskRecord[] = [];

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

const ASK_USER_TOOL_NAME = 'AskUserQuestion';
const READ_ONLY_CHAT_TOOLS = ['glob', 'grep', 'ls', 'view', ASK_USER_TOOL_NAME];
const BUILT_IN_EXECUTION_TOOLS = ['glob', 'grep', 'ls', 'view', 'write', 'edit', 'bash', 'fetch', ASK_USER_TOOL_NAME];
const PROJECT_INSTRUCTION_FILE_NAMES = ['GOODNIGHT.md', 'CLAUDE.md'];
const RISKY_BUILT_IN_TOOLS = new Set(['write', 'edit', 'bash', 'fetch']);

const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  project_brief: 'Project Brief',
  requirements_spec: 'Requirements Spec',
  feature_tree: 'Feature Tree',
  page_structure: 'Page Structure',
  wireframes: 'Wireframes',
  html_prototype: 'HTML Prototype',
};

const WORKFLOW_PACKAGE_LABELS: Record<AIWorkflowPackage, string> = {
  requirements: 'Requirements',
  prototype: 'Prototype',
  page: 'Page',
};

const WORKFLOW_SKILL_LABELS: Record<string, string> = {
  requirements_spec_skill: 'Requirements Spec Skill',
  feature_tree_skill: 'Feature Tree Skill',
  page_structure_skill: 'Page Structure Skill',
  wireframe_skill: 'Wireframe Skill',
  html_prototype_skill: 'HTML Prototype Skill',
};

const estimateTokenCount = (value: string) => Math.max(0, Math.ceil(value.trim().length / 4));

const summarizeLiveToolInput = (input: Record<string, unknown> | null | undefined) => {
  if (!input || Object.keys(input).length === 0) {
    return '';
  }

  try {
    const formatted = JSON.stringify(input, null, 2)?.trim() || '';
    return formatted.length > 240 ? `${formatted.slice(0, 237)}...` : formatted;
  } catch {
    return '';
  }
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

type RuntimePendingQuestionAction = {
  messageId: string;
  questionId: string;
  resolve: (answers: Record<string, string>) => void;
  reject: (reason?: string) => void;
};

const parseRuntimeQuestionInput = (input: Record<string, unknown>): RuntimeQuestionItem[] => {
  const questionsValue = input.questions;
  if (Array.isArray(questionsValue)) {
    return questionsValue.flatMap((question) => {
      if (!question || typeof question !== 'object') {
        return [];
      }

      const questionText = typeof question.question === 'string' ? question.question.trim() : '';
      if (!questionText) {
        return [];
      }

      const optionsValue = Array.isArray(question.options)
        ? question.options.flatMap((option: unknown) => {
          if (!option || typeof option !== 'object') {
            return [];
          }
          const optionRecord = option as { label?: unknown; description?: unknown };

          const label = typeof optionRecord.label === 'string' ? optionRecord.label.trim() : '';
          if (!label) {
            return [];
          }

          return [
            {
              label,
              description:
                typeof optionRecord.description === 'string' && optionRecord.description.trim()
                  ? optionRecord.description.trim()
                  : undefined,
            },
          ];
        })
        : undefined;

      return [
        {
          question: questionText,
          header:
            typeof question.header === 'string' && question.header.trim()
              ? question.header.trim()
              : undefined,
          options: optionsValue && optionsValue.length > 0 ? optionsValue : undefined,
        },
      ];
    });
  }

  if (typeof input.question === 'string' && input.question.trim()) {
    const options = Array.isArray(input.options)
      ? input.options.flatMap((option: unknown) => {
          if (!option || typeof option !== 'object') {
            return [];
          }
          const optionRecord = option as { label?: unknown; description?: unknown };
          const label = typeof optionRecord.label === 'string' ? optionRecord.label.trim() : '';
          if (!label) {
            return [];
          }
          return [
            {
              label,
              description:
                typeof optionRecord.description === 'string' && optionRecord.description.trim()
                  ? optionRecord.description.trim()
                  : undefined,
            },
          ];
        })
      : undefined;

    return [
      {
        question: input.question.trim(),
        options: options && options.length > 0 ? options : undefined,
      },
    ];
  }

  return [];
};

const RuntimeQuestionBlock: React.FC<{
  item: RuntimeQuestionItem;
  answered: boolean;
  answeredValue: string;
  onSubmit: (value: string) => void;
}> = ({ item, answered, answeredValue, onSubmit }) => {
  const [selectedOption, setSelectedOption] = useState('');
  const [freeText, setFreeText] = useState('');

  const effectiveValue = answeredValue || freeText || selectedOption;

  return (
    <div className="chat-runtime-question-item">
      {item.header ? <div className="chat-runtime-question-header">{item.header}</div> : null}
      <div className="chat-runtime-question-prompt">{item.question}</div>
      {item.options && item.options.length > 0 ? (
        <div className="chat-runtime-question-options">
          {item.options.map((option: NonNullable<RuntimeQuestionItem['options']>[number]) => (
            <button
              key={`${item.question}:${option.label}`}
              type="button"
              className={selectedOption === option.label || answeredValue === option.label ? 'active' : ''}
              disabled={answered}
              onClick={() => {
                setSelectedOption(option.label);
                setFreeText('');
              }}
            >
              <strong>{option.label}</strong>
              {option.description ? <span>{option.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {answered ? (
        <div className="chat-runtime-question-answer">{answeredValue}</div>
      ) : (
        <div className="chat-runtime-question-actions">
          <input
            className="chat-runtime-question-input"
            type="text"
            value={freeText}
            placeholder="直接输入回复"
            onChange={(event) => {
              setFreeText(event.target.value);
              if (event.target.value.trim()) {
                setSelectedOption('');
              }
            }}
          />
          <button
            type="button"
            className="chat-runtime-question-submit"
            disabled={!effectiveValue.trim()}
            onClick={() => onSubmit(effectiveValue.trim())}
          >
            提交
          </button>
        </div>
      )}
    </div>
  );
};
const normalizeReferencePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');
const buildProjectInstructionSummary = (fileName: string) =>
  fileName === 'GOODNIGHT.md'
    ? 'Project runtime identity and working rules for GoodNight.'
    : 'Project instructions inherited from Claude-style repository guidance.';

const loadProjectInstructionReferences = async (projectRoot: string) => {
  const references: Array<{ path: string; summary: string; content: string }> = [];

  for (const fileName of PROJECT_INSTRUCTION_FILE_NAMES) {
    const filePath = joinFileSystemPath(projectRoot, fileName);
    const content = await readProjectTextFile(filePath);
    if (!content?.trim()) {
      continue;
    }

    references.push({
      path: filePath,
      summary: buildProjectInstructionSummary(fileName),
      content: content.trim(),
    });
  }

  return references;
};

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
  tool_edit: '编辑操作',
  tool_fetch: '网络访问',
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

const RUNTIME_TOOL_GROUP_LABELS: Record<string, string> = {
  view: '读取',
  ls: '列目录',
  grep: '检索',
  glob: '匹配',
  write: '写入',
  edit: '编辑',
  bash: '命令',
  fetch: '抓取',
  project_file_flow: '处理文件请求',
  project_file_read: '读取项目文件',
  project_file_plan: '整理改动方案',
  project_file_apply: '应用文件改动',
  run_local_agent: '调用本地 Agent',
  run_agent_team: '协调多 Agent',
  workflow_package: '执行工作流',
};

const getRuntimeToolDisplayName = (toolName: string) => RUNTIME_TOOL_GROUP_LABELS[toolName] || toolName;

const summarizeRuntimePathList = (paths: string[]) => {
  const normalizedPaths = paths
    .map((value) => summarizeProjectFilePath(value))
    .filter((value) => value.trim().length > 0);

  if (normalizedPaths.length <= 2) {
    return normalizedPaths.join('、');
  }

  return `${normalizedPaths.slice(0, 2).join('、')} 等 ${normalizedPaths.length} 项`;
};

const summarizeRuntimeOutput = (output: string | undefined | null, maxLength = 160) => {
  const normalized = (output || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const summarizeRuntimeToolLabelList = (toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>) => {
  const toolCounts = new Map<string, number>();

  for (const toolUse of toolUses) {
    toolCounts.set(toolUse.toolName, (toolCounts.get(toolUse.toolName) || 0) + 1);
  }

  return Array.from(toolCounts.entries())
    .map(([toolName, count]) => `${RUNTIME_TOOL_GROUP_LABELS[toolName] || toolName}${count > 1 ? ` ${count}` : ''}`)
    .join(' · ');
};

const getRuntimeStatusLabel = (status: 'running' | 'completed' | 'failed' | 'blocked') => {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'blocked':
      return '已阻止';
    case 'running':
    default:
      return '执行中';
  }
};

const summarizeRuntimeFileChanges = (
  fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']> | undefined
) => {
  if (!fileChanges || fileChanges.length === 0) {
    return '';
  }

  const changedPaths = fileChanges.map((change) => change.path);
  return `${fileChanges.length} 个文件 · ${summarizeRuntimePathList(changedPaths)}`;
};

const summarizeRuntimeToolCall = (toolName: string, input: Record<string, unknown>) => {
  if (toolName === ASK_USER_TOOL_NAME) {
    if (typeof input.question === 'string') {
      return input.question;
    }
    if (Array.isArray(input.questions) && input.questions.length > 0) {
      const firstQuestion = input.questions[0];
      if (firstQuestion && typeof firstQuestion === 'object' && 'question' in firstQuestion) {
        return typeof firstQuestion.question === 'string' ? firstQuestion.question : '';
      }
    }
  }

  if (toolName === 'bash' && typeof input.command === 'string') {
    return input.command;
  }

  if ((toolName === 'write' || toolName === 'edit' || toolName === 'view') && typeof input.file_path === 'string') {
    return summarizeProjectFilePath(input.file_path);
  }

  if (toolName === 'project_file_flow' && typeof input.summary === 'string') {
    return input.summary;
  }

  if (toolName === 'project_file_read' && typeof input.request === 'string') {
    return input.request;
  }

  if (toolName === 'project_file_plan' && typeof input.request === 'string') {
    return input.request;
  }

  if (toolName === 'project_file_apply') {
    if (Array.isArray(input.paths) && input.paths.length > 0) {
      return summarizeRuntimePathList(input.paths.map((value) => String(value)));
    }
    if (typeof input.summary === 'string') {
      return input.summary;
    }
  }

  if ((toolName === 'run_local_agent' || toolName === 'run_agent_team') && typeof input.agent === 'string') {
    return String(input.agent);
  }

  if (toolName === 'team_phase' && typeof input.title === 'string') {
    return input.title;
  }

  if (toolName === 'team_member_task' && typeof input.title === 'string') {
    return input.title;
  }

  if (toolName === 'workflow_package') {
    if (typeof input.package === 'string') {
      return WORKFLOW_PACKAGE_LABELS[input.package as AIWorkflowPackage] || input.package;
    }
    if (typeof input.summary === 'string') {
      return input.summary;
    }
  }

  if (toolName === 'workflow_package_stage') {
    if (typeof input.package === 'string') {
      return WORKFLOW_PACKAGE_LABELS[input.package as AIWorkflowPackage] || input.package;
    }
  }

  if (toolName === 'workflow_stage') {
    if (typeof input.title === 'string') {
      return input.title;
    }
    if (typeof input.stage === 'string') {
      return input.stage;
    }
  }

  if (toolName === 'workflow_skill') {
    if (typeof input.title === 'string') {
      return input.title;
    }
    if (typeof input.skill === 'string') {
      return WORKFLOW_SKILL_LABELS[input.skill] || input.skill;
    }
  }

  if ((toolName === 'glob' || toolName === 'grep') && typeof input.pattern === 'string') {
    return input.pattern;
  }

  if (toolName === 'fetch' && typeof input.url === 'string') {
    return input.url;
  }

  return '';
};

const buildBuiltInToolApprovalActionType = (toolName: string) => `tool_${toolName}`;

const buildBuiltInToolApprovalSummary = (toolName: string, input: Record<string, unknown>) => {
  const detail = summarizeRuntimeToolCall(toolName, input);

  if (toolName === 'bash') {
    return detail ? `允许执行命令: ${detail}` : '允许执行命令';
  }

  if (toolName === 'fetch') {
    return detail ? `允许访问外部地址: ${detail}` : '允许访问外部地址';
  }

  if (toolName === 'write') {
    return detail ? `允许写入文件: ${detail}` : '允许写入文件';
  }

  if (toolName === 'edit') {
    return detail ? `允许编辑文件: ${detail}` : '允许编辑文件';
  }

  return detail ? `允许执行 ${toolName}: ${detail}` : `允许执行 ${toolName}`;
};

const buildBuiltInToolApprovalDisplay = (toolName: string, input: Record<string, unknown>) => ({
  toolName,
  command: toolName === 'bash' && typeof input.command === 'string' ? input.command : null,
  filePath:
    'file_path' in input && typeof input.file_path === 'string' ? String(input.file_path) : null,
  oldString:
    toolName === 'edit' && typeof input.old_string === 'string' ? input.old_string : null,
  newString:
    toolName === 'edit' && typeof input.new_string === 'string' ? input.new_string : null,
  content:
    toolName === 'write' && typeof input.content === 'string' ? input.content : null,
  inputJson: JSON.stringify(input, null, 2),
});

const findRuntimeMcpToolDefinition = (
  servers: RuntimeMcpServer[],
  serverId: string,
  toolName: string
) => servers.find((server) => server.id === serverId)?.tools?.find((tool) => tool.name === toolName) || null;

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
const isRunDiffActive = (expandedRunDiffKey: string | null, runId: string, path: string) =>
  expandedRunDiffKey === buildRunDiffKey(runId, path);

const buildRuntimeEventId = (kind: StoredChatRuntimeEvent['kind'], sourceId: string) =>
  `runtime-event_${kind}_${sourceId}`;

const buildSyntheticRuntimeToolCallId = (scope: string, sourceId: string, step?: string) =>
  [scope, sourceId, step].filter(Boolean).join(':');

const toRuntimeEventStatus = (status: 'running' | 'completed' | 'failed' | 'blocked' | 'pending') =>
  status === 'completed' || status === 'failed' || status === 'blocked' ? status : 'running';

const upsertRuntimeEvent = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  nextEvent: StoredChatRuntimeEvent,
  matcher: (event: StoredChatRuntimeEvent) => boolean
): StoredChatRuntimeEvent[] => {
  const events = [...(runtimeEvents || [])];
  const index = events.findIndex(matcher);

  if (index >= 0) {
    events[index] = nextEvent;
    return events;
  }

  events.push(nextEvent);
  return events;
};

const upsertRuntimeToolUseEvent = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    toolInput: Record<string, unknown>;
    status: RuntimeToolStep['status'];
  }
): StoredChatRuntimeEvent[] => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }> =>
      event.kind === 'tool_use' && event.toolCallId === input.toolCallId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      id: buildRuntimeEventId('tool_use', input.toolCallId),
      kind: 'tool_use',
      toolCallId: input.toolCallId,
      parentToolCallId: input.parentToolCallId ?? null,
      toolName: input.toolName,
      input: input.toolInput,
      status: input.status,
      createdAt: existingEvent?.createdAt || Date.now(),
    },
    (event) => event.kind === 'tool_use' && event.toolCallId === input.toolCallId
  );
};

const upsertRuntimeToolResultEvent = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    status: RuntimeToolStep['status'];
    output: string;
    fileChanges?: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges'];
  }
): StoredChatRuntimeEvent[] => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }> =>
      event.kind === 'tool_result' && event.toolCallId === input.toolCallId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      id: buildRuntimeEventId('tool_result', input.toolCallId),
      kind: 'tool_result',
      toolCallId: input.toolCallId,
      parentToolCallId: input.parentToolCallId ?? null,
      toolName: input.toolName,
      status: input.status,
      output: input.output,
      fileChanges: input.fileChanges,
      createdAt: existingEvent?.createdAt || Date.now(),
    },
    (event) => event.kind === 'tool_result' && event.toolCallId === input.toolCallId
  );
};

const syncTeamRunRuntimeEvents = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  parentToolCallId: string,
  teamRun: AgentTeamRunRecord
): StoredChatRuntimeEvent[] => {
  let nextEvents = [...(runtimeEvents || [])];

  for (const phase of teamRun.phases) {
    if (phase.status === 'pending' && !phase.startedAt && !phase.completedAt) {
      continue;
    }

    const phaseToolCallId = buildSyntheticRuntimeToolCallId('team-phase', teamRun.id, phase.id);
    nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
      toolCallId: phaseToolCallId,
      parentToolCallId,
      toolName: 'team_phase',
      toolInput: {
        id: phase.id,
        title: phase.title,
        summary: phase.summary,
        goal: phase.goal,
      },
      status: toRuntimeEventStatus(phase.status),
    });

    if (phase.status === 'completed' || phase.status === 'failed') {
      nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
        toolCallId: phaseToolCallId,
        parentToolCallId,
        toolName: 'team_phase',
        status: toRuntimeEventStatus(phase.status),
        output: phase.summary || phase.goal || phase.title,
      });
    }

    for (const member of teamRun.members.filter((entry: AgentTeamRunRecord['members'][number]) => entry.phaseId === phase.id)) {
      if (member.status === 'pending' && !member.startedAt && !member.completedAt) {
        continue;
      }

      const memberToolCallId = buildSyntheticRuntimeToolCallId('team-member', teamRun.id, member.id);
      nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
        toolCallId: memberToolCallId,
        parentToolCallId: phaseToolCallId,
        toolName: 'team_member_task',
        toolInput: {
          title: member.title,
          agent: member.agentId,
          role: member.role,
        },
        status: toRuntimeEventStatus(member.status),
      });

      if (member.status === 'completed' || member.status === 'failed') {
        nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
          toolCallId: memberToolCallId,
          parentToolCallId: phaseToolCallId,
          toolName: 'team_member_task',
          status: toRuntimeEventStatus(member.status),
          output: member.error || member.result || `${member.agentId} finished ${member.title}.`,
        });
      }
    }
  }

  return nextEvents;
};

const syncWorkflowRuntimeEvents = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  parentToolCallId: string,
  workflowRuns: Array<{
    targetPackage: AIWorkflowPackage;
    status: AIWorkflowRun['status'];
    currentStage: AIWorkflowRun['currentStage'];
    completedStages: AIWorkflowRun['completedStages'];
    stageSummaries: AIWorkflowRun['stageSummaries'];
    skillExecutions: AIWorkflowRun['skillExecutions'];
  }>
): StoredChatRuntimeEvent[] => {
  if (workflowRuns.length === 0) {
    return runtimeEvents || [];
  }

  let nextEvents = [...(runtimeEvents || [])];
  for (const workflowRun of workflowRuns) {
    const packageToolCallId = buildSyntheticRuntimeToolCallId('workflow-package', parentToolCallId, workflowRun.targetPackage);
    const packageFailed = workflowRun.status === 'error';
    const packageCompleted = workflowRun.status === 'awaiting_confirmation' || workflowRun.status === 'completed';

    nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
      toolCallId: packageToolCallId,
      parentToolCallId,
      toolName: 'workflow_package_stage',
      toolInput: {
        package: workflowRun.targetPackage,
        title: WORKFLOW_PACKAGE_LABELS[workflowRun.targetPackage] || workflowRun.targetPackage,
      },
      status: packageFailed ? 'failed' : packageCompleted ? 'completed' : 'running',
    });

    const stageIds = Array.from(new Set([...workflowRun.completedStages, workflowRun.currentStage].filter(Boolean)));
    for (const stageId of stageIds) {
      const stageToolCallId = buildSyntheticRuntimeToolCallId(
        'workflow-stage',
        packageToolCallId,
        stageId
      );
      const isCompleted = workflowRun.completedStages.includes(stageId);
      const isFailed = workflowRun.status === 'error' && workflowRun.currentStage === stageId;
      const summary = workflowRun.stageSummaries[stageId] || '';

      nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
        toolCallId: stageToolCallId,
        parentToolCallId: packageToolCallId,
        toolName: 'workflow_stage',
        toolInput: {
          stage: stageId,
          title: WORKFLOW_STAGE_LABELS[stageId] || stageId,
        },
        status: isFailed ? 'failed' : isCompleted ? 'completed' : 'running',
      });

      if (isCompleted || isFailed) {
        nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
          toolCallId: stageToolCallId,
          parentToolCallId: packageToolCallId,
          toolName: 'workflow_stage',
          status: isFailed ? 'failed' : 'completed',
          output: summary || `${WORKFLOW_STAGE_LABELS[stageId] || stageId} completed.`,
        });
      }

      const stageSkillExecutions = workflowRun.skillExecutions.filter((execution) => execution.stage === stageId);
      for (const execution of stageSkillExecutions) {
        const skillToolCallId = buildSyntheticRuntimeToolCallId('workflow-skill', stageToolCallId, execution.id);
        const skillFailed = execution.status === 'error';
        const skillCompleted =
          execution.status === 'completed' || execution.status === 'fallback';
        nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
          toolCallId: skillToolCallId,
          parentToolCallId: stageToolCallId,
          toolName: 'workflow_skill',
          toolInput: {
            skill: execution.skill,
            title: WORKFLOW_SKILL_LABELS[execution.skill] || execution.skill,
            provider: execution.provider || '',
            model: execution.model || '',
            retries: execution.retries,
          },
          status: skillFailed ? 'failed' : skillCompleted ? 'completed' : 'running',
        });

        if (skillCompleted || skillFailed) {
          nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
            toolCallId: skillToolCallId,
            parentToolCallId: stageToolCallId,
            toolName: 'workflow_skill',
            status: skillFailed ? 'failed' : 'completed',
            output:
              execution.error ||
              execution.summary ||
              `${WORKFLOW_SKILL_LABELS[execution.skill] || execution.skill} completed.`,
          });
        }
      }
    }

    if (packageCompleted || packageFailed) {
      const currentStageSummary = workflowRun.stageSummaries[workflowRun.currentStage] || '';
      nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
        toolCallId: packageToolCallId,
        parentToolCallId,
        toolName: 'workflow_package_stage',
        status: packageFailed ? 'failed' : 'completed',
        output:
          currentStageSummary ||
          `${WORKFLOW_PACKAGE_LABELS[workflowRun.targetPackage] || workflowRun.targetPackage} completed.`,
      });
    }
  }

  return nextEvents;
};

const syncRuntimeEventsWithToolCalls = (
  runtimeEvents: StoredChatRuntimeEvent[] | undefined,
  toolCalls: RuntimeToolStep[]
): StoredChatRuntimeEvent[] => {
  const nextEvents = [...(runtimeEvents || [])];

  for (const toolCall of toolCalls) {
    const toolUseEventId = buildRuntimeEventId('tool_use', toolCall.id);
    const existingToolUseIndex = nextEvents.findIndex(
      (event) => event.kind === 'tool_use' && event.toolCallId === toolCall.id
    );
    const toolUseEvent: StoredChatRuntimeEvent = {
      id: toolUseEventId,
      kind: 'tool_use',
      toolCallId: toolCall.id,
      parentToolCallId: toolCall.parentToolCallId ?? null,
      toolName: toolCall.name,
      input: toolCall.input,
      status: toolCall.status,
      createdAt: existingToolUseIndex >= 0 ? nextEvents[existingToolUseIndex]!.createdAt : Date.now(),
    };

    if (existingToolUseIndex >= 0) {
      nextEvents[existingToolUseIndex] = toolUseEvent;
    } else {
      nextEvents.push(toolUseEvent);
    }

    if (toolCall.status === 'running') {
      continue;
    }

    const toolResultEventId = buildRuntimeEventId('tool_result', toolCall.id);
    const existingToolResultIndex = nextEvents.findIndex(
      (event) => event.kind === 'tool_result' && event.toolCallId === toolCall.id
    );
    const toolResultEvent: StoredChatRuntimeEvent = {
      id: toolResultEventId,
      kind: 'tool_result',
      toolCallId: toolCall.id,
      parentToolCallId: toolCall.parentToolCallId ?? null,
      toolName: toolCall.name,
      status: toolCall.status,
      output: toolCall.resultContent || toolCall.resultPreview,
      fileChanges: toolCall.fileChanges,
      createdAt: existingToolResultIndex >= 0 ? nextEvents[existingToolResultIndex]!.createdAt : Date.now(),
    };

    if (existingToolResultIndex >= 0) {
      nextEvents[existingToolResultIndex] = toolResultEvent;
    } else {
      const insertionIndex = nextEvents.findIndex(
        (event) => event.kind === 'tool_use' && event.toolCallId === toolCall.id
      );
      if (insertionIndex >= 0) {
        nextEvents.splice(insertionIndex + 1, 0, toolResultEvent);
      } else {
        nextEvents.push(toolResultEvent);
      }
    }
  }

  return nextEvents;
};

const getFileChangeTypeLabel = (change: { beforeContent: string | null; afterContent: string | null }) => {
  if (change.beforeContent === null && change.afterContent !== null) {
    return '新建';
  }
  if (change.beforeContent !== null && change.afterContent === null) {
    return '删除';
  }
  return '修改';
};

const getCheckpointChangeTypeLabel = (changeType: 'created' | 'updated' | 'deleted') =>
  changeType === 'created' ? '新建' : changeType === 'deleted' ? '删除' : '修改';

const buildRuntimeEventGroupSummary = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  resultMap: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>
) => {
  const counts = {
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
  };

  for (const toolUse of toolUses) {
    const status = resultMap.get(toolUse.toolCallId)?.status || toolUse.status;
    counts[status] += 1;
  }

  const toolSummary = summarizeRuntimeToolLabelList(toolUses);

  if (counts.running > 0) {
    return `${toolSummary} · 进行中 ${counts.running}`;
  }
  if (counts.failed > 0) {
    return `${toolSummary} · 失败 ${counts.failed}`;
  }
  if (counts.blocked > 0) {
    return `${toolSummary} · 已拦截 ${counts.blocked}`;
  }
  return `${toolSummary} · 已完成`;
};

const shouldOpenRuntimeToolStep = ({
  status,
  approvalCount,
  questionCount,
}: {
  status: 'running' | 'completed' | 'failed' | 'blocked';
  approvalCount: number;
  questionCount: number;
}) => {
  if (status === 'running' || status === 'failed' || status === 'blocked') {
    return true;
  }

  if (questionCount > 0) {
    return true;
  }

  if (approvalCount > 0 && status !== 'completed') {
    return true;
  }

  return false;
};

const shouldOpenRuntimeToolGroup = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  renderModel: RuntimeEventRenderModel
) =>
  toolUses.some((toolUse) =>
    shouldOpenRuntimeToolStep({
      status: renderModel.resultMap.get(toolUse.toolCallId)?.status || toolUse.status,
      approvalCount: (renderModel.approvalsByToolCallId.get(toolUse.toolCallId) || []).length,
      questionCount: (renderModel.questionsByToolCallId.get(toolUse.toolCallId) || []).length,
    })
  );

const buildRuntimeToolStepPreview = (input: {
  status: 'running' | 'completed' | 'failed' | 'blocked';
  summary: string;
  output?: string;
  fileChanges?: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>;
  approvalCount: number;
  questionCount: number;
  childCount: number;
}) => {
  if (input.questionCount > 0) {
    return `${input.questionCount} 个问题等待你补充`;
  }
  if (input.approvalCount > 0 && input.status !== 'completed') {
    return `${input.approvalCount} 个权限确认${input.status === 'blocked' ? '已拦截' : '待你确认'}`;
  }
  if (input.fileChanges?.length) {
    return summarizeRuntimeFileChanges(input.fileChanges);
  }
  if (input.childCount > 0 && input.status === 'running') {
    return `${input.childCount} 个子步骤正在处理`;
  }
  if (input.output) {
    return summarizeRuntimeOutput(input.output);
  }
  if (input.summary) {
    return input.summary;
  }
  return getRuntimeStatusLabel(input.status);
};

const getRuntimeCommandCountLabel = (count: number) => {
  if (count <= 0) {
    return '暂无执行记录';
  }

  return `已运行 ${count} ${count === 1 ? '条命令' : '条命令'}`;
};

const getRuntimeToolHeadline = (toolName: string, input: Record<string, unknown>) => {
  const summary = summarizeRuntimeToolCall(toolName, input).trim();
  if (summary) {
    return summary;
  }

  return getRuntimeToolDisplayName(toolName);
};

const shouldShowRuntimeToolBrief = (toolName: string, summary: string, headline: string) => {
  if (!summary || summary === headline) {
    return false;
  }

  if (toolName === 'project_file_flow' || toolName === 'project_file_plan' || toolName === 'project_file_apply') {
    return false;
  }

  return true;
};

const shouldShowRuntimeToolTechnicalDetails = (input: {
  toolName: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  toolInput: Record<string, unknown>;
  output?: string;
}) => {
  if (input.status === 'failed' || input.status === 'blocked') {
    return true;
  }

  if (input.status === 'running') {
    return Object.keys(input.toolInput).length > 0;
  }

  if (input.toolName === 'project_file_flow' || input.toolName === 'project_file_plan') {
    return false;
  }

  return Object.keys(input.toolInput).length > 0 || Boolean(input.output?.trim());
};

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
    if ((message.runtimeEvents || []).some((event) => event.kind === 'tool_use' || event.kind === 'tool_result')) {
      return null;
    }
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
    <AssistantTextBlock
      key={`${messageId}-text-${index}`}
      content={part.content}
      isStreaming={Boolean(options?.isStreaming && message.role === 'assistant' && part.type === 'text')}
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

const buildAssistantContentState = (
  content: string,
  fallbackThinkingContent?: string,
  preferredAssistantParts?: AIChatMessagePart[]
) => {
  const structured = buildAssistantStructuredContentState({
    content,
    fallbackThinkingContent,
    preferredAssistantParts,
    thinkingCollapsed: true,
  });

  if (structured.assistantParts.length > 0) {
    return structured;
  }

  return {
    content: structured.content,
    thinkingContent: structured.thinkingContent,
    answerContent: structured.answerContent,
    assistantParts: structured.assistantParts,
  };
};

const clearAssistantContentState = () => ({
  thinkingContent: undefined,
  answerContent: undefined,
  assistantParts: undefined,
});

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
}) => {
  const isProviderEmbedded = variant === 'provider-embedded';
  const isGNAgentEmbedded = variant === 'gn-agent-embedded';
  const isEmbedded = isProviderEmbedded || isGNAgentEmbedded;
  const lockExpandedForEmbedded = isProviderEmbedded;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stallFP, setStallFP] = useState(0);
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
  const [streamingDraftContents, setStreamingDraftContents] = useState<Record<string, StreamingDraftState>>({});
  const [projectFileOperationMode, setProjectFileOperationMode] = useState<ProjectFileOperationMode>('auto');
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
  const streamingFlushFrameRef = useRef<number | null>(null);
  const pendingApprovalActionsRef = useRef<Record<string, RuntimePendingApprovalAction>>({});
  const pendingQuestionActionsRef = useRef<Record<string, RuntimePendingQuestionAction>>({});
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
    queueComposerPrefill,
    clearComposerPrefill,
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
      queueComposerPrefill: state.queueComposerPrefill,
      clearComposerPrefill: state.clearComposerPrefill,
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
    setThreadBackgroundTasks,
    upsertBackgroundTask,
    upsertTeamRun,
    pruneThreadHistorySince,
    startRun: startRuntimeRun,
    finishRun: finishRuntimeRun,
    failRun: failRuntimeRun,
    patchLiveState,
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
      setThreadBackgroundTasks: state.setThreadBackgroundTasks,
      upsertBackgroundTask: state.upsertBackgroundTask,
      upsertTeamRun: state.upsertTeamRun,
      pruneThreadHistorySince: state.pruneThreadHistorySince,
      startRun: state.startRun,
      finishRun: state.finishRun,
      failRun: state.failRun,
      patchLiveState: state.patchLiveState,
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
    permissionMode,
    sandboxPolicy,
    setThreadApprovals,
    enqueueApproval,
    resolveApproval: resolveStoredApproval,
    setPermissionMode,
    setSandboxPolicy,
  } = useApprovalStore(
    useShallow((state) => ({
      approvalsByThread: state.approvalsByThread,
      permissionMode: state.permissionMode,
      sandboxPolicy: state.sandboxPolicy,
      setThreadApprovals: state.setThreadApprovals,
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
    if (!currentProject) {
      return;
    }

    let alive = true;
    const projectId = currentProject.id;
    const projectName = currentProject.name;

    void (async () => {
      ensureProjectState(projectId);

      let persistedThreads: Awaited<ReturnType<typeof listAgentThreads>> = [];
      try {
        persistedThreads = await listAgentThreads(projectId);
      } catch (error) {
        console.warn('Failed to load agent threads:', error);
      }
      if (!alive) {
        return;
      }

      let projectState = useAIChatStore.getState().projects[projectId];
      let existingSessions = projectState?.sessions || [];

      persistedThreads.forEach((thread) => {
        const existingSession = existingSessions.find((session) => session.runtimeThreadId === thread.id) || null;
        const session =
          existingSession ||
          createChatSession(projectId, thread.title || '新对话', thread.providerId as AgentProviderId);

        const syncedSession = {
          ...session,
          title: thread.title || session.title,
          providerId: thread.providerId as AgentProviderId,
          runtimeThreadId: thread.id,
          createdAt: existingSession?.createdAt || thread.createdAt,
          updatedAt: Math.max(thread.updatedAt, existingSession?.updatedAt || 0),
        };

        upsertSession(projectId, syncedSession);
        existingSessions = [
          syncedSession,
          ...existingSessions.filter((item) => item.id !== syncedSession.id),
        ];

        recordRuntimeThread(projectId, {
          id: session.id,
          providerId: thread.providerId as AgentProviderId,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        });
      });

      projectState = useAIChatStore.getState().projects[projectId];
      const sessions = projectState?.sessions || [];
      if (sessions.length === 0 && persistedThreads.length === 0) {
        const session = createWelcomeSession(projectId, projectName, runtimeProviderId);
        upsertSession(projectId, session);
        setActiveSession(projectId, session.id);
      } else if (!projectState?.activeSessionId && sessions[0]) {
        setActiveSession(projectId, sessions[0].id);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    currentProject,
    ensureProjectState,
    recordRuntimeThread,
    runtimeProviderId,
    setActiveSession,
    upsertSession,
  ]);

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

  const sessions = projectChatState?.sessions || EMPTY_SESSIONS;
  const activeSessionId = projectChatState?.activeSessionId || sessions[0]?.id || null;
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [activeSessionId, sessions]
  );
  const activeApprovalThreadId = activeSession?.runtimeThreadId || activeSessionId || null;
  const activeCheckpointThreadId = activeSession?.runtimeThreadId || activeSession?.id || null;
  const activeTaskThreadId = activeSession?.runtimeThreadId || null;
  const activeLiveThreadId = activeSessionId;
  const messages = activeSession?.messages || EMPTY_MESSAGES;
  const activityEntries = projectChatState?.activityEntries || EMPTY_ACTIVITY_ENTRIES;
  const pendingApprovals = useMemo(
    () =>
      activeApprovalThreadId
        ? (approvalsByThread[activeApprovalThreadId] || []).filter(
            (approval) => approval.status === 'pending',
          )
        : EMPTY_PENDING_APPROVALS,
    [activeApprovalThreadId, approvalsByThread]
  );
  useEffect(() => {
    if (!activeApprovalThreadId) {
      return;
    }

    patchLiveState(activeApprovalThreadId, (state) => ({
      ...state,
      pendingPermissionCount: pendingApprovals.length,
      pendingApprovalSummary: pendingApprovals[0]?.summary || null,
      statusVerb:
        pendingApprovals.length > 0
          ? 'Waiting for approval'
          : state.pendingPermissionCount > 0
            ? ''
            : state.statusVerb,
    }));
  }, [activeApprovalThreadId, patchLiveState, pendingApprovals]);
  const activeSkills = useMemo(
    () =>
      activeSessionId
        ? activeSkillsByThread[activeSessionId] || EMPTY_RUNTIME_SKILLS
        : EMPTY_RUNTIME_SKILLS,
    [activeSessionId, activeSkillsByThread]
  );
  const latestTurnSession = useAgentRuntimeStore((state) =>
    activeSessionId ? getLatestTurnSession(state.sessionsByThread[activeSessionId]) : null
  );
  const activeReplayResumeRequest = useAgentRuntimeStore((state) =>
    activeSessionId ? state.resumeRequestsByThread[activeSessionId] || null : null
  );
  const activeRuntimeLiveState = useAgentRuntimeStore((state) =>
    activeLiveThreadId ? state.liveStateByThread[activeLiveThreadId] || null : null
  );
  const activeBackgroundTasks = useAgentRuntimeStore((state) =>
    activeLiveThreadId
      ? state.backgroundTasksByThread[activeLiveThreadId] || EMPTY_BACKGROUND_TASKS
      : EMPTY_BACKGROUND_TASKS
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
    if (!activeLiveThreadId) {
      return;
    }

    patchLiveState(activeLiveThreadId, (state) => ({
      ...state,
      connectionState: activeSession?.runtimeThreadId
        ? state.connectionState === 'disconnected'
          ? 'reconnecting'
          : 'connected'
        : 'disconnected',
    }));
  }, [activeLiveThreadId, activeSession?.runtimeThreadId, patchLiveState]);

  useEffect(() => {
    if (!activeLiveThreadId || !activeRuntimeLiveState?.startedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      patchLiveState(activeLiveThreadId, (state) => ({
        ...state,
        elapsedSeconds: state.startedAt
          ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000))
          : state.elapsedSeconds,
      }));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeLiveThreadId, activeRuntimeLiveState?.startedAt, patchLiveState]);

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

  useEffect(() => {
    if (!activeTaskThreadId || !activeSessionId) {
      return;
    }

    let alive = true;

    void (async () => {
      const tasks = await listAgentBackgroundTasks(activeTaskThreadId);
      if (!alive) {
        return;
      }

      setThreadBackgroundTasks(activeSessionId, tasks);
      tasks
        .filter((task) => task.runKind === 'team')
        .forEach((task) => {
          try {
            const teamRun = JSON.parse(task.payloadJson) as AgentTeamRunRecord;
            upsertTeamRun(activeSessionId, teamRun);
          } catch {
            return;
          }
        });
    })();

    return () => {
      alive = false;
    };
  }, [activeSessionId, activeTaskThreadId, setThreadBackgroundTasks, upsertTeamRun]);
  const appendRuntimeEventToMessage = useCallback(
    (messageId: string, runtimeEvent: StoredChatRuntimeEvent) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        runtimeEvents: [...(message.runtimeEvents || []), runtimeEvent],
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );
  const patchRuntimeEventInMessage = useCallback(
    (
      messageId: string,
      matcher: (event: StoredChatRuntimeEvent) => boolean,
      updater: (event: StoredChatRuntimeEvent) => StoredChatRuntimeEvent
    ) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        runtimeEvents: (message.runtimeEvents || []).map((event) => (matcher(event) ? updater(event) : event)),
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );
  const upsertRuntimeToolUseInMessage = useCallback(
    (
      messageId: string,
      input: {
        toolCallId: string;
        parentToolCallId?: string | null;
        toolName: string;
        toolInput: Record<string, unknown>;
        status: RuntimeToolStep['status'];
      }
    ) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        runtimeEvents: upsertRuntimeToolUseEvent(message.runtimeEvents, input),
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );
  const upsertRuntimeToolResultInMessage = useCallback(
    (
      messageId: string,
      input: {
        toolCallId: string;
        parentToolCallId?: string | null;
        toolName: string;
        status: RuntimeToolStep['status'];
        output: string;
        fileChanges?: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges'];
      }
    ) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        runtimeEvents: upsertRuntimeToolResultEvent(message.runtimeEvents, input),
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );
  const requestRuntimeApproval = useCallback(
    async ({
      threadId,
      actionType,
      riskLevel,
      summary,
      messageId,
      toolCallId,
      onApprove,
      onDeny,
      display,
    }: {
      threadId: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high';
      summary: string;
      messageId?: string | null;
      toolCallId?: string | null;
      onApprove: () => Promise<void>;
      onDeny?: () => void | Promise<void>;
      display?: RuntimePendingApprovalAction['display'];
    }) => {
      patchLiveState(threadId, (state) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: 'Waiting for approval',
        pendingApprovalSummary: summary,
        pendingPermissionCount: state.pendingPermissionCount + 1,
      }));
      const approval = await requestRuntimeApprovalFlow({
        threadId,
        actionType,
        riskLevel,
        summary,
        messageId,
        onApprove,
        onDeny,
        display,
        enqueueAgentApproval,
        enqueueApproval,
        pendingApprovalActions: pendingApprovalActionsRef.current,
      });
      if (messageId) {
        appendRuntimeEventToMessage(messageId, {
          id: buildRuntimeEventId('approval', approval.id),
          kind: 'approval',
          approvalId: approval.id,
          toolCallId,
          actionType,
          summary,
          riskLevel,
          status: 'pending',
          display,
          createdAt: Date.now(),
        });
      }
      return approval;
    },
    [appendRuntimeEventToMessage, enqueueAgentApproval, enqueueApproval, patchLiveState]
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
      if (pendingAction?.messageId) {
        patchRuntimeEventInMessage(
          pendingAction.messageId,
          (event) => event.kind === 'approval' && event.approvalId === approvalId,
          (event) => (event.kind === 'approval' ? { ...event, status: 'approved' } : event)
        );
      }
      if (pendingAction) {
        await pendingAction.onApprove();
      }
    },
    [patchRuntimeEventInMessage, resolveAgentApproval, resolveStoredApproval]
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
      if (pendingAction?.messageId) {
        patchRuntimeEventInMessage(
          pendingAction.messageId,
          (event) => event.kind === 'approval' && event.approvalId === approvalId,
          (event) => (event.kind === 'approval' ? { ...event, status: 'denied' } : event)
        );
      }
      if (pendingAction?.onDeny) {
        await pendingAction.onDeny();
      }
    },
    [patchRuntimeEventInMessage, resolveAgentApproval, resolveStoredApproval]
  );
  const handleAnswerRuntimeQuestion = useCallback(
    async (messageId: string, question: RuntimeQuestionPayload, answers: Record<string, string>) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        runtimeQuestion: message.runtimeQuestion
          ? {
              ...message.runtimeQuestion,
              status: 'answered',
              answers,
            }
          : message.runtimeQuestion,
        runtimeEvents: (message.runtimeEvents || []).map((event) =>
          event.kind === 'question' && event.questionId === question.id
            ? {
                ...event,
                payload: {
                  ...event.payload,
                  status: 'answered',
                  answers,
                },
              }
            : event
        ),
      }));
      patchLiveState(activeSessionId, (state) => ({
        ...state,
        pendingQuestionSummary: null,
        statusVerb: state.pendingPermissionCount > 0 ? 'Waiting for approval' : '',
        activeToolName: state.pendingPermissionCount > 0 ? state.activeToolName : null,
        streamingToolInput: state.pendingPermissionCount > 0 ? state.streamingToolInput : '',
      }));

      const pendingAction = pendingQuestionActionsRef.current[question.id];
      if (pendingAction) {
        delete pendingQuestionActionsRef.current[question.id];
        pendingAction.resolve(answers);
      }
    },
    [activeSessionId, currentProject, patchLiveState, updateMessage]
  );
const buildInlineDiff = (oldStr: string, newStr: string): string[] => {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');

    // Find common prefix
    let prefixEnd = 0;
    while (prefixEnd < oldLines.length && prefixEnd < newLines.length && oldLines[prefixEnd] === newLines[prefixEnd]) {
      prefixEnd += 1;
    }

    // Find common suffix
    let suffixStartOld = oldLines.length;
    let suffixStartNew = newLines.length;
    while (
      suffixStartOld > prefixEnd &&
      suffixStartNew > prefixEnd &&
      oldLines[suffixStartOld - 1] === newLines[suffixStartNew - 1]
    ) {
      suffixStartOld -= 1;
      suffixStartNew -= 1;
    }

    const result: string[] = [];

    // Context before
    for (let i = Math.max(0, prefixEnd - 2); i < prefixEnd; i += 1) {
      result.push(` ${oldLines[i]}`);
    }

    // Removed lines
    for (let i = prefixEnd; i < suffixStartOld; i += 1) {
      result.push(`-${oldLines[i]}`);
    }

    // Added lines
    for (let i = prefixEnd; i < suffixStartNew; i += 1) {
      result.push(`+${newLines[i]}`);
    }

    // Context after
    for (let i = suffixStartNew; i < Math.min(suffixStartNew + 2, newLines.length); i += 1) {
      result.push(` ${newLines[i]}`);
    }

    return result;
  };

  const renderRuntimeApprovalCard = useCallback(
    (message: { id: string; role: StoredChatMessage['role']; projectFileProposal?: ProjectFileProposal; runtimeEvents?: StoredChatRuntimeEvent[] }) => {
      if ((message.runtimeEvents || []).some((event) => event.kind === 'approval')) {
        return null;
      }
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
            const pendingDisplay = pendingApprovalActionsRef.current[approval.id]?.display;
            const showEditDiff =
              pendingDisplay?.toolName === 'edit' &&
              typeof pendingDisplay.oldString === 'string' &&
              typeof pendingDisplay.newString === 'string';
            const showWritePreview =
              pendingDisplay?.toolName === 'write' && typeof pendingDisplay.content === 'string';
            const showCommand =
              pendingDisplay?.toolName === 'bash' && typeof pendingDisplay.command === 'string';
            const showFilePath = !!pendingDisplay?.filePath;
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
                {showFilePath ? (
                  <div className="chat-runtime-approval-file">
                    <code>{summarizeProjectFilePath(pendingDisplay.filePath!)}</code>
                  </div>
                ) : null}
                {showEditDiff ? (
                  <pre className="chat-runtime-approval-diff">
                    {buildInlineDiff(pendingDisplay.oldString!, pendingDisplay.newString!).map((line, i) => (
                      <span
                        key={i}
                        className={
                          line.startsWith('-') ? 'diff-removed' : line.startsWith('+') ? 'diff-added' : 'diff-context'
                        }
                      >
                        {line}{'\n'}
                      </span>
                    ))}
                  </pre>
                ) : showWritePreview ? (
                  <pre className="chat-runtime-approval-write-preview">
                    {pendingDisplay.content!.slice(0, 800)}
                    {pendingDisplay.content!.length > 800 ? '\n...' : ''}
                  </pre>
                ) : showCommand ? (
                  <pre className="chat-runtime-approval-command">{pendingDisplay.command}</pre>
                ) : pendingDisplay?.inputJson ? (
                  <pre className="chat-runtime-approval-pre">{pendingDisplay.inputJson}</pre>
                ) : null}
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
  const renderRuntimeQuestionCard = useCallback(
    (message: StoredChatMessage) => {
      if ((message.runtimeEvents || []).some((event) => event.kind === 'question')) {
        return null;
      }
      const question = message.runtimeQuestion;
      if (message.role !== 'assistant' || !question) {
        return null;
      }

      const isAnswered = question.status === 'answered';
      const answers = question.answers || {};

      return (
        <section className={`chat-runtime-question-card ${isAnswered ? 'answered' : 'pending'}`}>
          <div className="chat-runtime-question-head">
            <strong>需要你的确认</strong>
            <span>{isAnswered ? '已回答' : '等待输入'}</span>
          </div>
          <div className="chat-runtime-question-list">
            {question.questions.map((item, index) => {
              const answerKey = item.question;
              const answeredValue = answers[answerKey] || '';
              return (
                <RuntimeQuestionBlock
                  key={`${question.id}-${index}`}
                  item={item}
                  answered={isAnswered}
                  answeredValue={answeredValue}
                  onSubmit={(value) =>
                    handleAnswerRuntimeQuestion(message.id, question, {
                      ...answers,
                      [answerKey]: value,
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      );
    },
    [handleAnswerRuntimeQuestion]
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
      const projectFileFlowToolCallId = buildSyntheticRuntimeToolCallId('project-file', messageId);
      const projectFileApplyToolCallId = buildSyntheticRuntimeToolCallId('project-file', messageId, 'apply');

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
        onExecutionStart: () => {
          upsertRuntimeToolUseInMessage(messageId, {
            toolCallId: projectFileApplyToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_apply',
            toolInput: {
              mode: proposal.mode,
              summary: proposal.summary,
              paths: proposal.operations.map((operation) => operation.targetPath),
            },
            status: 'running',
          });
        },
        onExecutionSuccess: async ({ runId, messageId: executedMessageId, summary, fileChanges }) => {
          upsertRuntimeToolResultInMessage(messageId, {
            toolCallId: projectFileApplyToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_apply',
            status: 'completed',
            output: summary,
            fileChanges,
          });
          upsertRuntimeToolResultInMessage(messageId, {
            toolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_flow',
            status: 'completed',
            output: summary,
          });
          await persistTurnCheckpointForRun({
            threadId: approvalThreadId,
            runId,
            messageId: executedMessageId,
            summary,
            files: fileChanges,
          });
        },
        onExecutionFailed: ({ message }) => {
          upsertRuntimeToolResultInMessage(messageId, {
            toolCallId: projectFileApplyToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_apply',
            status: 'failed',
            output: message,
          });
          upsertRuntimeToolResultInMessage(messageId, {
            toolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_flow',
            status: 'failed',
            output: message,
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
      upsertRuntimeToolResultInMessage,
      upsertRuntimeToolUseInMessage,
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
  const runtimeConnectionLabel =
    activeRuntimeLiveState?.connectionState === 'connecting'
      ? 'Connecting'
      : activeRuntimeLiveState?.connectionState === 'reconnecting'
        ? 'Reconnecting'
        : activeRuntimeLiveState?.connectionState === 'connected'
          ? 'Connected'
          : 'Disconnected';
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
        : activeRuntimeLiveState?.pendingQuestionSummary
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
      : activeRuntimeLiveState?.statusVerb
        ? activeRuntimeLiveState.statusVerb
      : isLoading
        ? 'Running'
        : latestActivityEntry?.type === 'failed'
          ? 'Failed'
          : 'Ready';
  const runStateTone =
    latestTurnSessionStatus === 'waiting_approval' || latestTurnSessionStatus === 'resumable'
      ? 'warning'
      : activeRuntimeLiveState?.pendingQuestionSummary
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
    if (streamingFlushFrameRef.current !== null) {
      cancelAnimationFrame(streamingFlushFrameRef.current);
      streamingFlushFrameRef.current = null;
    }
    setStreamingDraftContents(nextDrafts);
  }, []);
  const pushStreamingDraft = useCallback((messageId: string, draft: StreamingDraftState) => {
    streamingDraftBufferRef.current = {
      ...streamingDraftBufferRef.current,
      [messageId]: draft,
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
  const renderToolExecutionCard = useCallback((message: StoredChatMessage) => {
    const toolCalls = message.toolCalls || [];
    const runtimeEvents = message.runtimeEvents || [];
    const teamRun = message.teamRun || null;

    if (toolCalls.length === 0 && runtimeEvents.length === 0 && !teamRun) {
      return null;
    }

    if (teamRun && runtimeEvents.length === 0) {
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

    const renderApprovalEvent = (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => (
      <section key={event.id} className={`chat-runtime-approval-card ${event.riskLevel}`}>
        <div className="chat-runtime-approval-head">
          <strong>继续前想和你确认一下</strong>
          <span>{approvalStatusLabelMap[event.status]}</span>
        </div>
        <div className="chat-runtime-approval-summary">{event.summary}</div>
        <div className="chat-runtime-approval-meta">
          <span>{approvalActionLabelMap[event.actionType] || event.actionType}</span>
          <span>{approvalRiskLabelMap[event.riskLevel]}</span>
        </div>
        {event.display?.filePath ? (
          <div className="chat-runtime-approval-preview">
            <code>{summarizeProjectFilePath(event.display.filePath)}</code>
          </div>
        ) : null}
        {event.display?.command ? <pre className="chat-runtime-approval-pre">{event.display.command}</pre> : null}
        {event.display?.content && event.display.toolName === 'write' ? (
          <pre className="chat-runtime-approval-pre">{event.display.content}</pre>
        ) : null}
        {event.display?.newString && event.display.toolName === 'edit' ? (
          <pre className="chat-runtime-approval-pre">{event.display.newString}</pre>
        ) : null}
        {!event.display?.command && !event.display?.content && !event.display?.newString && event.display?.inputJson ? (
          <pre className="chat-runtime-approval-pre">{event.display.inputJson}</pre>
        ) : null}
        {event.status === 'pending' ? (
          <div className="chat-runtime-approval-actions">
            <button type="button" onClick={() => void handleApproveRuntimeApproval(event.approvalId)}>
              批准执行
            </button>
            <button type="button" onClick={() => void handleDenyRuntimeApproval(event.approvalId)}>
              拒绝
            </button>
          </div>
        ) : null}
      </section>
    );
    const renderQuestionEvent = (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => {
      const question = event.payload;
      const isAnswered = question.status === 'answered';
      const answers = question.answers || {};
      return (
        <section key={event.id} className={`chat-runtime-question-card ${isAnswered ? 'answered' : 'pending'}`}>
          <div className="chat-runtime-question-head">
            <strong>还需要你补充一点信息</strong>
            <span>{isAnswered ? '已回答' : '等待输入'}</span>
          </div>
          <div className="chat-runtime-question-list">
            {question.questions.map((item, questionIndex) => {
              const answerKey = item.question;
              const answeredValue = answers[answerKey] || '';
              return (
                <RuntimeQuestionBlock
                  key={`${event.questionId}-${questionIndex}`}
                  item={item}
                  answered={isAnswered}
                  answeredValue={answeredValue}
                  onSubmit={(value) =>
                    handleAnswerRuntimeQuestion(message.id, question, {
                      ...answers,
                      [answerKey]: value,
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      );
    };
    const renderRuntimeFileChanges = (
      fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
    ) => (
      <div className="chat-tool-trace-file-list">
        {fileChanges.map((change) => {
          const isActiveDiff = message.runId ? isRunDiffActive(expandedRunDiffKey, message.runId, change.path) : false;

          return (
            <div key={`${message.id}-${change.path}`} className="chat-tool-trace-file-row">
              {message.runId ? (
                <button
                  type="button"
                  className={`chat-tool-trace-file-item chat-tool-trace-file-item-button ${isActiveDiff ? 'active' : ''}`}
                  onClick={() => void loadCheckpointDiff(message.runId!, change.path)}
                >
                  <strong title={change.path}>{summarizeProjectFilePath(change.path)}</strong>
                  <span>{getFileChangeTypeLabel(change)} · 查看更改</span>
                </button>
              ) : (
                <div className="chat-tool-trace-file-item">
                  <strong title={change.path}>{summarizeProjectFilePath(change.path)}</strong>
                  <span>{getFileChangeTypeLabel(change)}</span>
                </div>
              )}
              {message.runId ? renderCheckpointDiffPanel(message.runId, change.path) : null}
            </div>
          );
        })}
      </div>
    );

    return (
      <AIChatRuntimeToolExecutionCard
        toolCalls={toolCalls}
        runtimeEvents={runtimeEvents}
        renderApprovalEvent={renderApprovalEvent}
        renderQuestionEvent={renderQuestionEvent}
        renderRuntimeFileChanges={renderRuntimeFileChanges}
        helpers={{
          summarizeRuntimeToolCall,
          getRuntimeToolHeadline,
          buildRuntimeToolStepPreview,
          shouldOpenRuntimeToolStep,
          shouldOpenRuntimeToolGroup,
          shouldShowRuntimeToolBrief,
          shouldShowRuntimeToolTechnicalDetails,
          summarizeRuntimeFileChanges,
          summarizeRuntimeOutput,
          getRuntimeStatusLabel,
          getRuntimeCommandCountLabel,
          buildRuntimeEventGroupSummary,
          summarizeProjectFilePath,
        }}
      />
    );
  }, [
    handleAnswerRuntimeQuestion,
    handleApproveRuntimeApproval,
    handleDenyRuntimeApproval,
    loadCheckpointDiff,
    renderCheckpointDiffPanel,
  ]);
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
      const pendingProjectFileAction = findLatestPendingProjectFileProposalAction(targetSession?.messages || []);
      if (
        pendingProjectFileAction &&
        (isShortPendingActionAffirmation(rawContent) || isShortPendingActionRejection(rawContent))
      ) {
        const runId = createRunId();
        appendMessage(currentProject.id, targetSessionId, createStoredChatMessage('user', rawContent, 'default', { runId }));

        if (!targetSession || targetSession.title === '新对话') {
          renameSession(currentProject.id, targetSessionId, summarizeSessionTitle(rawContent));
        }

        setIsLoading(true);
        try {
          if (isShortPendingActionAffirmation(rawContent)) {
            await handleExecuteProjectFileProposal(
              pendingProjectFileAction.messageId,
              pendingProjectFileAction.proposal
            );
          } else {
            await handleCancelProjectFileProposal(pendingProjectFileAction.messageId);
          }
        } finally {
          setIsLoading(false);
        }
        return;
      }

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

      const assistantMessage = createStoredChatMessage('assistant', '', 'default', {
        runId,
        thinkingContent: '',
        answerContent: '',
      });
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
        const contextProjectRoot = await getProjectDir(currentProject.id);
        const conversationHistory = targetSession?.messages || activeSession?.messages || [];
        const projectInstructionReferences = await loadProjectInstructionReferences(contextProjectRoot);
        const agentInstructions = [
          contextSnapshot.primaryLabel,
          contextSnapshot.secondaryLabel,
          contextSnapshot.currentFileLabel,
          contextSnapshot.vaultLabel,
          projectInstructionReferences.length > 0
            ? `项目规则文件 / ${projectInstructionReferences.map((item) => item.path.split(/[/\\]/).pop()).join(', ')}`
            : null,
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
          referenceFiles: [
            ...projectInstructionReferences,
            ...resolvedReferenceContextFiles.map((file) => ({
              path: file.path,
              summary: file.summary,
              content: file.content || file.summary || file.title,
            })),
          ],
          memoryEntries: projectMemoryEntries,
          activeSkills: runtimeVisibleSkillsForTurn,
        });
        setThreadContext(targetSessionId, agentContextSnapshot);
        patchLiveState(runtimeStoreThreadId, (state) => ({
          ...state,
          connectionState: 'connected',
          statusVerb: 'Thinking',
          elapsedSeconds: 0,
          startedAt: Date.now(),
          activeThinking: true,
          activeToolName: null,
          streamingToolInput: '',
          streamingText: '',
          tokenUsage: {
            inputTokens: estimateTokenCount(
              `${cleanedContent}\n${agentInstructions.join('\n')}\n${agentContextSnapshot.prompt}`
            ),
            outputTokens: 0,
          },
        }));
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
          const mcpToolEventKey = `mcp:${mcpCommand.serverId}:${mcpCommand.toolName}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: mcpToolEventKey,
            toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
            toolInput: {
              serverId: mcpCommand.serverId,
              toolName: mcpCommand.toolName,
              arguments: mcpCommand.argumentsText || '',
            },
            status: 'running',
          });
          const mcpToolDefinition = findRuntimeMcpToolDefinition(
            runtimeMcpServers,
            mcpCommand.serverId,
            mcpCommand.toolName
          );
          if (mcpToolDefinition?.requiresApproval) {
            if (sandboxPolicy === 'deny') {
              const blockedMessage = `当前 sandbox policy 为 deny，已阻止 MCP 工具 ${mcpCommand.serverId}/${mcpCommand.toolName}。`;
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: mcpToolEventKey,
                toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
                status: 'blocked',
                output: blockedMessage,
              });
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
                ...currentMessage,
                role: 'system',
                tone: 'error',
                content: blockedMessage,
                ...clearAssistantContentState(),
              }));
              await failTurnSession(blockedMessage);
              return;
            }

            if (sandboxPolicy === 'ask') {
              const approved = await new Promise<boolean>(async (resolve) => {
                await requestRuntimeApproval({
                  threadId: runtimeThreadId || targetSessionId,
                  actionType: 'mcp_tool_call',
                  riskLevel: 'medium',
                  summary: `允许执行 MCP 工具: ${mcpCommand.serverId}/${mcpCommand.toolName}`,
                  messageId: assistantMessage.id,
                  toolCallId: mcpToolEventKey,
                  display: {
                    toolName: mcpCommand.toolName,
                    inputJson: JSON.stringify(
                      {
                        serverId: mcpCommand.serverId,
                        toolName: mcpCommand.toolName,
                        arguments: mcpCommand.argumentsText || '',
                      },
                      null,
                      2
                    ),
                  },
                  onApprove: async () => {
                    resolve(true);
                  },
                  onDeny: async () => {
                    resolve(false);
                  },
                });
              });

              if (!approved) {
                const deniedMessage = `已取消 MCP 工具 ${mcpCommand.serverId}/${mcpCommand.toolName}。`;
                upsertRuntimeToolResultInMessage(assistantMessage.id, {
                  toolCallId: mcpToolEventKey,
                  toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
                  status: 'blocked',
                  output: deniedMessage,
                });
                updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
                  ...currentMessage,
                  role: 'system',
                  tone: 'error',
                  content: deniedMessage,
                  ...clearAssistantContentState(),
                }));
                await failTurnSession(deniedMessage);
                return;
              }
            }
          }

          markTurnExecuting(
            `Run MCP tool: ${mcpCommand.toolName}`,
            `Preparing ${mcpCommand.serverId}/${mcpCommand.toolName}`,
            mcpCommand.toolName
          );
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: mcpToolEventKey,
            toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
            toolInput: {
              serverId: mcpCommand.serverId,
              toolName: mcpCommand.toolName,
              arguments: mcpCommand.argumentsText || '',
            },
            status: 'running',
          });
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
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: mcpToolEventKey,
              toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
              status: 'failed',
              output: message,
            });
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
              ...currentMessage,
              role: 'system',
              tone: 'error',
              content: message,
              ...clearAssistantContentState(),
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
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: mcpToolEventKey,
            toolName: `${toolCall.serverId}/${toolCall.toolName}`,
            status: toolCall.error ? 'failed' : 'completed',
            output: toolCall.error || toolCall.resultPreview || mcpResult.content,
          });
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
            ...currentMessage,
            role: toolCall.error ? 'system' : currentMessage.role,
            tone: toolCall.error ? 'error' : currentMessage.tone,
            ...(toolCall.error ? { content: mcpResult.content } : buildAssistantContentState(mcpResult.content)),
            runtimeEvents: (currentMessage.runtimeEvents || []).map((event) =>
              event.kind === 'tool_use' && event.toolCallId === mcpToolEventKey
                ? {
                    ...event,
                    status: toolCall.error ? ('failed' as const) : ('completed' as const),
                  }
                : event
            ),
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
          const workflowToolCallId = buildSyntheticRuntimeToolCallId('workflow', assistantMessage.id);
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: workflowToolCallId,
            toolName: 'workflow_package',
            toolInput: {
              package: targetWorkflowPackage,
              summary: buildSessionPreview(cleanedContent) || cleanedContent,
            },
            status: 'running',
          });
          let workflowCompletion;
          const workflowRunSnapshots = new Map<
            AIWorkflowPackage,
            {
              targetPackage: AIWorkflowPackage;
              status: AIWorkflowRun['status'];
              currentStage: AIWorkflowRun['currentStage'];
              completedStages: AIWorkflowRun['completedStages'];
              stageSummaries: AIWorkflowRun['stageSummaries'];
              skillExecutions: AIWorkflowRun['skillExecutions'];
            }
          >();
          try {
            workflowCompletion = await executeRuntimeWorkflowPackage({
              targetPackage: targetWorkflowPackage,
              runWorkflowPackage: runAIWorkflowPackage,
              getLatestRun: () => useAIWorkflowStore.getState().projects[currentProject.id]?.runs[0] || null,
              onRunUpdate: ({ targetPackage, run }) => {
                workflowRunSnapshots.set(targetPackage, {
                  targetPackage,
                  status: run.status,
                  currentStage: run.currentStage,
                  completedStages: [...run.completedStages],
                  stageSummaries: { ...run.stageSummaries },
                  skillExecutions: [...run.skillExecutions],
                });
                updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                  ...message,
                  runtimeEvents: syncWorkflowRuntimeEvents(
                    message.runtimeEvents,
                    workflowToolCallId,
                    Array.from(workflowRunSnapshots.values())
                  ),
                }));
              },
            });
          } catch (error) {
            const message = normalizeErrorMessage(error);
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: workflowToolCallId,
              toolName: 'workflow_package',
              status: 'failed',
              output: message,
            });
            throw error;
          }
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: workflowToolCallId,
            toolName: 'workflow_package',
            status: 'completed',
            output: workflowCompletion.finalContent,
          });
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            runtimeEvents: syncWorkflowRuntimeEvents(
              message.runtimeEvents,
              workflowToolCallId,
              Array.from(workflowRunSnapshots.values())
            ),
          }));

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            ...buildAssistantContentState(workflowCompletion.finalContent),
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
            const projectFileReadToolCallId = buildSyntheticRuntimeToolCallId('project-file-read', assistantMessage.id);
            upsertRuntimeToolUseInMessage(assistantMessage.id, {
              toolCallId: projectFileReadToolCallId,
              toolName: 'project_file_read',
              toolInput: {
                request: buildSessionPreview(cleanedContent) || cleanedContent,
              },
              status: 'running',
            });
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: '',
              ...clearAssistantContentState(),
            }));
            let finalContent: string;
            let streamedReadContent = '';
            try {
              finalContent = await executeRuntimeProjectFileRead({
                userInput: cleanedContent,
                projectName: currentProject.name || '当前项目',
                projectRoot,
                allowedTools: READ_ONLY_CHAT_TOOLS,
                onChunk: (chunk) => {
                  streamedReadContent += chunk;
                  const sanitizedDraft = sanitizeInternalWorkspaceMentions(streamedReadContent).trim();
                  updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                    ...message,
                    ...buildAssistantContentState(sanitizedDraft),
                  }));
                },
                readFiles: (payload) => aiService.chatWithTools(payload),
              });
            } catch (error) {
              const message = normalizeErrorMessage(error);
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: projectFileReadToolCallId,
                toolName: 'project_file_read',
                status: 'failed',
                output: message,
              });
              throw error;
            }
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: projectFileReadToolCallId,
              toolName: 'project_file_read',
              status: 'completed',
              output: finalContent,
            });

            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              ...buildAssistantContentState(finalContent),
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
          const projectFileFlowToolCallId = buildSyntheticRuntimeToolCallId('project-file', assistantMessage.id);
          const projectFilePlanToolCallId = buildSyntheticRuntimeToolCallId(
            'project-file',
            assistantMessage.id,
            'plan'
          );
          const projectFileApplyToolCallId = buildSyntheticRuntimeToolCallId(
            'project-file',
            assistantMessage.id,
            'apply'
          );

          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_flow',
            toolInput: {
              mode: projectFileOperationMode,
              summary: buildSessionPreview(cleanedContent) || cleanedContent,
            },
            status: 'running',
          });
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: projectFilePlanToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_plan',
            toolInput: {
              mode: projectFileOperationMode,
              request: buildSessionPreview(cleanedContent) || cleanedContent,
            },
            status: 'running',
          });

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: '',
            ...clearAssistantContentState(),
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
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: projectFilePlanToolCallId,
              parentToolCallId: projectFileFlowToolCallId,
              toolName: 'project_file_plan',
              status: 'completed',
              output: planningResult.message || '需要补充更多信息后才能继续文件操作。',
            });
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: projectFileFlowToolCallId,
              toolName: 'project_file_flow',
              status: 'completed',
              output: planningResult.message || '文件改动规划已暂停，等待补充信息。',
            });
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              ...buildAssistantContentState('还需要你补充一点信息，才能继续这次文件操作。'),
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
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: projectFilePlanToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_plan',
            status: 'completed',
            output: nextProposal.summary,
          });
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: projectFileApplyToolCallId,
            parentToolCallId: projectFileFlowToolCallId,
            toolName: 'project_file_apply',
            toolInput: {
              mode: projectFileOperationMode,
              summary: nextProposal.summary,
              paths: nextProposal.operations.map((operation) => operation.targetPath),
            },
            status: decision === 'blocked' ? 'blocked' : 'running',
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
            ...buildAssistantContentState(nextProposal.assistantMessage),
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
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: projectFileApplyToolCallId,
                parentToolCallId: projectFileFlowToolCallId,
                toolName: 'project_file_apply',
                status: 'blocked',
                output: projectFileDecisionFeedback.blockedReason,
              });
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: projectFileFlowToolCallId,
                toolName: 'project_file_flow',
                status: 'blocked',
                output: projectFileDecisionFeedback.blockedReason,
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
              await requestRuntimeApproval({
                threadId: approvalThreadId,
                actionType: approvalActionType,
                riskLevel,
                summary: nextProposal.summary,
                messageId: assistantMessage.id,
                toolCallId: projectFileApplyToolCallId,
                display: {
                  toolName: 'project_file_apply',
                  inputJson: JSON.stringify(
                    {
                      mode: projectFileOperationMode,
                      summary: nextProposal.summary,
                      paths: nextProposal.operations.map((operation) => operation.targetPath),
                    },
                    null,
                    2
                  ),
                },
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
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileApplyToolCallId,
                    parentToolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_apply',
                    status: 'blocked',
                    output: projectFileDecisionFeedback.deniedReason,
                  });
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_flow',
                    status: 'blocked',
                    output: projectFileDecisionFeedback.deniedReason,
                  });
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
                onExecutionStart: () => {
                  upsertRuntimeToolUseInMessage(assistantMessage.id, {
                    toolCallId: projectFileApplyToolCallId,
                    parentToolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_apply',
                    toolInput: {
                      mode: projectFileOperationMode,
                      summary: nextProposal.summary,
                      paths: nextProposal.operations.map((operation) => operation.targetPath),
                    },
                    status: 'running',
                  });
                },
                onExecutionSuccess: async ({ runId: executedRunId, messageId, summary, fileChanges }) => {
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileApplyToolCallId,
                    parentToolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_apply',
                    status: 'completed',
                    output: summary,
                    fileChanges,
                  });
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_flow',
                    status: 'completed',
                    output: summary,
                  });
                  await persistTurnCheckpointForRun({
                    threadId: approvalThreadId,
                    runId: executedRunId,
                    messageId,
                    summary,
                    files: fileChanges,
                  });
                },
                onExecutionFailed: ({ message }) => {
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileApplyToolCallId,
                    parentToolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_apply',
                    status: 'failed',
                    output: message,
                  });
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: projectFileFlowToolCallId,
                    toolName: 'project_file_flow',
                    status: 'failed',
                    output: message,
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
          const localAgentToolCallId = buildSyntheticRuntimeToolCallId('local-agent', assistantMessage.id);
          upsertRuntimeToolUseInMessage(assistantMessage.id, {
            toolCallId: localAgentToolCallId,
            toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
            toolInput: {
              agent: localExecutionAgentId,
              summary: localAgentFlow.summary,
            },
            status: localAgentFlow.decision === 'blocked' ? 'blocked' : 'running',
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
                      threadId: runtimeStoreThreadId,
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
                        patchLiveState(runtimeStoreThreadId, (state) => ({
                          ...state,
                          connectionState: 'connected',
                          statusVerb:
                            teamRun.status === 'running'
                              ? 'Running team tasks'
                              : teamRun.status === 'failed'
                                ? 'Team run failed'
                                : '',
                          activeThinking: false,
                          activeToolName: 'team',
                          streamingToolInput: '',
                        }));
                        upsertTeamRun(runtimeStoreThreadId, teamRun);
                        upsertBackgroundTask(runtimeStoreThreadId, {
                          id: teamRun.id,
                          threadId: runtimeStoreThreadId,
                          runKind: 'team',
                          title: teamRun.summary,
                          status: teamRun.status,
                          summary: teamRun.finalSummary || teamRun.strategy,
                          payloadJson: JSON.stringify(teamRun),
                          createdAt: teamRun.createdAt,
                          updatedAt: teamRun.updatedAt,
                        });
                        void upsertAgentBackgroundTask({
                          id: teamRun.id,
                          threadId: runtimeStoreThreadId,
                          runKind: 'team',
                          title: teamRun.summary,
                          status: teamRun.status,
                          summary: teamRun.finalSummary || teamRun.strategy,
                          payloadJson: JSON.stringify(teamRun),
                          createdAt: teamRun.createdAt,
                        });
                        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                          ...message,
                          teamRun,
                          runtimeEvents: syncTeamRunRuntimeEvents(
                            message.runtimeEvents,
                            localAgentToolCallId,
                            teamRun
                          ),
                        }));
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
                          changedPaths: teamResult.changedPaths,
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
              patchLiveState(runtimeStoreThreadId, (state) => ({
                ...state,
                connectionState: 'connected',
                statusVerb: '',
                activeThinking: false,
                activeToolName: null,
                streamingToolInput: '',
                streamingText: '',
                tokenUsage: {
                  ...state.tokenUsage,
                  outputTokens: state.tokenUsage.outputTokens + estimateTokenCount(executionResult.finalContent),
                },
              }));
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: localAgentToolCallId,
                toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
                status: 'completed',
                output: executionResult.finalContent,
              });
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                ...message,
                ...buildAssistantContentState(executionResult.finalContent),
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

            patchLiveState(runtimeStoreThreadId, (state) => ({
              ...state,
              connectionState: 'connected',
              statusVerb: 'Failed',
              activeThinking: false,
              activeToolName: null,
              streamingToolInput: '',
              streamingText: '',
            }));
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: localAgentToolCallId,
              toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
              status: 'failed',
              output: executionResult.message,
            });
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
              ...currentMessage,
              role: 'system',
              tone: 'error',
              content: executionResult.message,
              ...clearAssistantContentState(),
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
              patchLiveState(runtimeStoreThreadId, (state) => ({
                ...state,
                connectionState: 'connected',
                statusVerb: 'Blocked',
                activeThinking: false,
                activeToolName: null,
                streamingToolInput: '',
              }));
              updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                ...message,
                role: 'system',
                tone: 'error',
                content: localAgentDecisionState?.messageContent || '已阻止本地 Agent 执行。',
                ...clearAssistantContentState(),
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
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: localAgentToolCallId,
                toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
                status: 'blocked',
                output: localAgentDecisionFeedback.blockedReason,
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
                ...buildAssistantContentState(localAgentDecisionFeedback.messageContent),
              }));
              await requestRuntimeApproval({
                threadId: approvalThreadId,
                actionType: localAgentFlow.actionType,
                riskLevel: localAgentFlow.riskLevel,
                summary: localAgentFlow.summary,
                messageId: assistantMessage.id,
                toolCallId: localAgentToolCallId,
                onApprove: async () => {
                  await executeLocalAgentFlow(false);
                },
                onDeny: async () => {
                  upsertRuntimeToolResultInMessage(assistantMessage.id, {
                    toolCallId: localAgentToolCallId,
                    toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
                    status: 'blocked',
                    output: localAgentDecisionFeedback.deniedReason,
                  });
                  updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
                    ...message,
                    role: 'system',
                    tone: 'error',
                    content: localAgentDecisionFeedback.deniedMessageContent,
                    ...clearAssistantContentState(),
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
                display: {
                  toolName: 'agent',
                  inputJson: JSON.stringify(
                    {
                      agent: localExecutionAgentId,
                      projectRoot,
                      summary: localAgentFlow.summary,
                    },
                    null,
                    2
                  ),
                },
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
        const builtInAllowedTools =
          sandboxPolicy === 'deny' ? READ_ONLY_CHAT_TOOLS : BUILT_IN_EXECUTION_TOOLS;
        const runBuiltInQuestionTool = async (call: ToolCall): Promise<ToolResult> => {
          const questions = parseRuntimeQuestionInput(call.input);
          if (questions.length === 0) {
            return {
              type: 'text',
              content: 'AskUserQuestion requires a question or questions payload.',
              is_error: true,
            };
          }

          const questionId = `runtime-question_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const payload: RuntimeQuestionPayload = {
            id: questionId,
            toolCallId: call.id,
            status: 'pending',
            questions,
            createdAt: Date.now(),
          };

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            runtimeQuestion: payload,
            runtimeEvents: [
              ...(message.runtimeEvents || []),
              {
                id: buildRuntimeEventId('question', questionId),
                kind: 'question',
                questionId,
                payload,
                createdAt: Date.now(),
              },
            ],
          }));
          patchLiveState(runtimeStoreThreadId, (state) => ({
            ...state,
            connectionState: 'connected',
            statusVerb: 'Waiting for input',
            activeThinking: false,
            activeToolName: call.name,
            pendingQuestionSummary: questions[0]?.question || null,
          }));

          const answers = await new Promise<Record<string, string>>((resolve, reject) => {
            pendingQuestionActionsRef.current[questionId] = {
              messageId: assistantMessage.id,
              questionId,
              resolve,
              reject,
            };
          });

          return {
            type: 'text',
            content: `User answers:\n${JSON.stringify(answers, null, 2)}`,
          };
        };
        const requestBuiltInToolApproval = async (call: ToolCall) => {
          if (sandboxPolicy !== 'ask' || !RISKY_BUILT_IN_TOOLS.has(call.name)) {
            return;
          }

          const approved = await new Promise<boolean>(async (resolve) => {
            await requestRuntimeApproval({
              threadId: runtimeThreadId || targetSessionId,
              actionType: buildBuiltInToolApprovalActionType(call.name),
              riskLevel: call.name === 'bash' || call.name === 'fetch' ? 'high' : 'medium',
              summary: buildBuiltInToolApprovalSummary(call.name, call.input),
              messageId: assistantMessage.id,
              toolCallId: call.id,
              display: buildBuiltInToolApprovalDisplay(call.name, call.input),
              onApprove: async () => {
                resolve(true);
              },
              onDeny: async () => {
                resolve(false);
              },
            });
          });

          if (!approved) {
            throw new Error(`User denied ${call.name}.`);
          }
        };
        setThreadToolCalls(targetSessionId, []);
        let toolStartTime = 0;
        let toolTimerInterval: ReturnType<typeof setInterval> | null = null;
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
          allowedTools: builtInAllowedTools,
          onToolCallsChange: (toolCalls) => {
            setStallFP((n) => n + 1);
            setThreadToolCalls(targetSessionId, toolCalls);
            const runningToolCall = [...toolCalls].reverse().find((toolCall) => toolCall.status === 'running') || null;

            if (runningToolCall && toolStartTime === 0) {
              toolStartTime = Date.now();
              toolTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - toolStartTime) / 1000);
                if (elapsed >= 3) {
                  patchLiveState(runtimeStoreThreadId, (state) => ({
                    ...state,
                    statusVerb: state.activeToolName ? `Running ${state.activeToolName} (${elapsed}s)` : state.statusVerb,
                  }));
                }
              }, 1000);
            } else if (!runningToolCall) {
              toolStartTime = 0;
              if (toolTimerInterval) {
                clearInterval(toolTimerInterval);
                toolTimerInterval = null;
              }
            }

            patchLiveState(runtimeStoreThreadId, (state) => ({
              ...state,
              activeToolName: runningToolCall?.name || null,
              streamingToolInput: summarizeLiveToolInput(runningToolCall?.input),
              statusVerb: runningToolCall?.name
                ? `Running ${runningToolCall.name}${toolStartTime && Date.now() - toolStartTime > 3000 ? ` (${Math.floor((Date.now() - toolStartTime) / 1000)}s)` : ''}`
                : state.statusVerb,
            }));
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              runtimeEvents: syncRuntimeEventsWithToolCalls(message.runtimeEvents, toolCalls),
            }));
          },
          onModelEvent: (event) => {
            setStallFP((n) => n + 1);
            const draftState = streamingAssembler.append(event);
            const draft = {
              content: draftState.content,
              thinkingContent: draftState.thinkingContent,
              answerContent: draftState.answerContent,
              assistantParts: draftState.assistantParts,
            };
            patchLiveState(runtimeStoreThreadId, (state) => ({
              ...state,
              connectionState: 'connected',
              statusVerb: event.kind === 'thinking' ? 'Reasoning' : 'Streaming response',
              activeThinking: event.kind === 'thinking',
              streamingToolInput: event.kind === 'thinking' ? state.streamingToolInput : '',
              streamingText:
                event.kind === 'text' ? `${state.streamingText}${event.delta}` : state.streamingText,
              tokenUsage: {
                ...state.tokenUsage,
                outputTokens: state.tokenUsage.outputTokens + estimateTokenCount(event.delta),
              },
            }));
            pushStreamingDraft(assistantMessage.id, draft);
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: draft.content,
              thinkingContent: draft.thinkingContent,
              answerContent: draft.answerContent,
              assistantParts: draft.assistantParts,
            }));
          },
          beforeToolCall: async (call) => {
            const boundaryDraft = streamingAssembler.markToolBoundary();
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: boundaryDraft.content,
              thinkingContent: boundaryDraft.thinkingContent,
              answerContent: boundaryDraft.answerContent,
              assistantParts: boundaryDraft.assistantParts,
            }));
            await requestBuiltInToolApproval(call);
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
          executeTool: (call) =>
            call.name === ASK_USER_TOOL_NAME ? runBuiltInQuestionTool(call) : toolExecutor.execute(call),
        });

        const finalDraft = streamingAssembler.buildFinal(agentTurn.finalContent);
        const normalizedFinalContent = finalDraft.content;
        if (toolTimerInterval) clearInterval(toolTimerInterval);
        clearStreamingDraft(assistantMessage.id);
        patchLiveState(runtimeStoreThreadId, (state) => ({
          ...state,
          connectionState: 'connected',
          statusVerb: '',
          activeThinking: false,
          activeToolName: null,
          streamingToolInput: '',
          streamingText: '',
        }));
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
          ...message,
          ...buildAssistantContentState(
            normalizedFinalContent,
            message.thinkingContent,
            finalDraft.assistantParts as AIChatMessagePart[]
          ),
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
        patchLiveState(runtimeStoreThreadId, (state) => ({
          ...state,
          connectionState: 'connected',
          statusVerb: 'Failed',
          activeThinking: false,
          activeToolName: null,
          streamingToolInput: '',
          streamingText: '',
        }));
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
          ...currentMessage,
          role: 'system',
          tone: 'error',
          content: message,
          ...clearAssistantContentState(),
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
      upsertRuntimeToolResultInMessage,
      upsertRuntimeToolUseInMessage,
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
      setSlashMenuOpen(false);
      setSlashFilter('');
      setSlashTriggerIndex(-1);
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
  const runtimeTaskBar =
    activeBackgroundTasks.length > 0 ? (
      <section className="chat-runtime-task-strip" aria-label="Runtime tasks">
        {activeBackgroundTasks.slice(0, 3).map((task) => {
          let progressLabel = task.status;

          if (task.runKind === 'team') {
            try {
              const teamRun = JSON.parse(task.payloadJson) as AgentTeamRunRecord;
              const completedCount = teamRun.members.filter((member) => member.status === 'completed').length;
              progressLabel = `${completedCount}/${teamRun.members.length}`;
            } catch {
              progressLabel = task.status;
            }
          }

          const tone =
            task.status === 'failed'
              ? 'error'
              : task.status === 'completed'
                ? 'success'
                : task.status === 'running' || task.status === 'planning'
                  ? 'running'
                  : '';

          return (
            <article key={task.id} className={`chat-runtime-task-chip ${tone}`.trim()}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.summary || task.runKind}</span>
              </div>
              <code>{progressLabel}</code>
            </article>
          );
        })}
      </section>
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
      renderRuntimeQuestion={renderRuntimeQuestionCard}
      listRef={messageListRef}
      messagesEndRef={messagesEndRef}
      leadingContent={runtimeTaskBar}
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
                <span className="chat-shell-status-pill">Session / {runtimeConnectionLabel}</span>
                <span className="chat-shell-status-pill">Skills / {activeSkills.length}</span>
                <span className="chat-shell-status-pill">MCP / {runtimeMcpServers.length}</span>
                <span className="chat-shell-status-pill">权限模式 / {PERMISSION_MODE_LABELS[permissionMode]}</span>
                <span className={`chat-shell-status-pill ${pendingApprovalCount > 0 ? 'warning' : ''}`}>
                  Approvals / {pendingApprovalCount}
                </span>
                {activeRuntimeLiveState?.activeToolName ? (
                  <span className="chat-shell-status-pill">Tool / {activeRuntimeLiveState.activeToolName}</span>
                ) : null}
                {activeRuntimeLiveState?.streamingToolInput ? (
                  <span className="chat-shell-status-pill">Input / {activeRuntimeLiveState.streamingToolInput}</span>
                ) : null}
                {activeRuntimeLiveState?.pendingQuestionSummary ? (
                  <span className="chat-shell-status-pill warning">Question / Waiting</span>
                ) : null}
                <span className="chat-shell-status-pill">
                  Elapsed / {activeRuntimeLiveState?.elapsedSeconds || 0}s
                </span>
                <span className="chat-shell-status-pill">
                  Tokens / ~{activeRuntimeLiveState?.tokenUsage.inputTokens || 0} in / ~
                  {activeRuntimeLiveState?.tokenUsage.outputTokens || 0} out
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
                          type="submit"
                          className="chat-send-btn"
                          aria-label={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
                          title={isLoading ? '\u53d1\u9001\u4e2d' : '\u53d1\u9001'}
                          disabled={!input.trim() || isLoading}
                        >
                          <SendIcon />
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


