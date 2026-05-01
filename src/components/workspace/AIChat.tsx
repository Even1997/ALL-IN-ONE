import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError, listModelsSupportMode } from '../../modules/ai/core/configStatus';
import { aiService, type AIProviderType } from '../../modules/ai/core/AIService';
import type { AITextStreamEvent } from '../../modules/ai/core/AIService';
import { buildDirectChatPrompt } from '../../modules/ai/chat/directChatPrompt';
import type { ChatStructuredCard } from '../../modules/ai/chat/chatCards';
import { buildContextUsageSummary } from '../../modules/ai/chat/contextBudget';
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
import { type AIConfigEntry, hasUsableAIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { toRuntimeAIConfig } from '../../modules/ai/store/aiConfigState';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../modules/ai/gn-agent/localConfig';
import { ClaudeRuntime } from '../../modules/ai/gn-agent/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../modules/ai/gn-agent/runtime/codex/CodexRuntime';
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
  detectProjectFileWriteIntent,
  type ProjectFileOperation,
  type ProjectFileOperationMode,
  type ProjectFileProposal,
  parseProjectFileOperationsPlan,
  resolveProjectOperationPath,
  isSupportedProjectTextFilePath,
} from '../../modules/ai/chat/projectFileOperations';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
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

type GNAgentSuggestion = {
  label: string;
  description: string;
  prompt: string;
};

type ProjectFileExecutionResult = {
  ok: boolean;
  changedPaths: string[];
  message: string;
};

type TauriToolResponse = {
  success: boolean;
  content: string;
  error: string | null;
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

const createProjectFileProposalId = () => `file-proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const modeLabelMap: Record<ProjectFileOperationMode, string> = {
  manual: '手动确认',
  auto: '自动确认',
};

const buildProjectFilePlanningSystemPrompt = (projectName: string, projectRoot: string) => `你是 ${projectName} 的项目文件助手。
你只能规划当前项目根目录内的文本文件操作，根目录是 ${projectRoot}。
你可以使用只读工具 glob、grep、ls、view 来查看目录和文件，但绝不能尝试 write、edit、remove。

你必须只返回合法 JSON，对象结构如下：
{
  "status": "ready" | "needs_clarification" | "reject",
  "assistantMessage": "string",
  "summary": "string",
  "operations": [
    {
      "type": "create_file" | "edit_file" | "delete_file",
      "targetPath": "相对路径，优先使用相对项目根目录的路径",
      "summary": "本次操作摘要",
      "content": "create_file 或全量 edit_file 时需要",
      "oldString": "局部替换 edit_file 时需要",
      "newString": "局部替换 edit_file 时需要"
    }
  ]
}

规则：
1. 查询和读取不属于这个 JSON 规划范围，只有写操作才返回 operations。
2. 如果信息不足，返回 status = "needs_clarification"。
3. 不要规划目录删除。
4. 不要规划二进制文件写改删。
5. create_file 不能把已存在文件静默当作新建覆盖。
6. 只返回 JSON，不要返回 Markdown。`;

const buildProjectFilePlanningPrompt = (userInput: string) => `请根据用户请求规划项目文件写操作。

用户请求：
${userInput}

如果这是新建、编辑或删除文件的请求，请返回 JSON 计划。
如果用户请求不明确，返回 needs_clarification。
如果请求不应该执行，返回 reject。`;

const buildProjectFileReadSystemPrompt = (projectName: string, projectRoot: string) => `你是 ${projectName} 的项目文件阅读助手。
当前项目根目录是 ${projectRoot}。
你可以使用 glob、grep、ls、view 这四个只读工具来帮助回答用户关于项目文件的问题。
不要尝试 write、edit、remove 之类的写工具。
先查看必要文件，再用简洁中文回答。`;

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

const createWelcomeSession = (projectId: string, projectName?: string | null) => {
  const session = createChatSession(projectId, '新对话');
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

const GN_AGENT_SUGGESTIONS: GNAgentSuggestion[] = [
  {
    label: '@索引',
    description: '刷新系统索引并准备文档上下文',
    prompt: '@索引 请刷新当前项目的系统索引，并为后续需求文档和功能文档准备上下文',
  },
  {
    label: '@需求',
    description: '从目标倒推出功能清单和页面范围',
    prompt: '@需求 我想做一个新功能，请先帮我拆成功能清单、用户流程和页面范围',
  },
  {
    label: '@草图',
    description: '根据当前需求生成线框草图方向',
    prompt: '@草图 请基于当前需求给我一版可编辑的低保真线框方案',
  },
  {
    label: '@UI',
    description: '结合原型和风格生成设计页面',
    prompt: '@UI 请基于当前原型和设计标准生成对应的页面设计方案',
  },
  {
    label: '@变更同步',
    description: '把原型改动同步成可复用项目事实',
    prompt: '@变更同步 请检查当前原型和项目文档的差异，列出需要同步的变更',
  },
];

const extractChangedPaths = (content: string) =>
  Array.from(content.matchAll(/`([^`]+\.(?:md|json|html|tsx|ts|css))`/g)).map((match) => match[1]);

const buildRunSummaryEntry = ({
  runId,
  content,
  skill,
}: {
  runId: string;
  content: string;
  skill: string | null;
}): ActivityEntry | null => {
  const changedPaths = extractChangedPaths(content);
  if (changedPaths.length === 0) {
    return null;
  }

  return {
    id: createActivityEntryId(),
    runId,
    type: 'run-summary',
    summary: `更新了 ${changedPaths.join('、')}`,
    changedPaths,
    runtime: 'built-in',
    skill,
    createdAt: Date.now(),
  };
};

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

const renderMessagePart = (messageId: string, part: AIChatMessagePart, index: number) => {
  if (part.type === 'thinking') {
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
          ) : null}
        </summary>
        {part.content ? <pre>{part.content}</pre> : <div className="chat-thinking-empty">等待模型输出思考内容...</div>}
      </details>
    );
  }

  if (part.type === 'tool') {
    return (
      <div className={`chat-tool-card ${part.status}`} key={`${messageId}-tool-${index}`}>
        <div className="chat-tool-card-header">
          <span className="chat-tool-icon" aria-hidden="true" />
          <div>
            <strong>{part.title}</strong>
            <span>{part.status === 'running' ? '正在执行' : part.status === 'error' ? '执行失败' : '已完成'}</span>
          </div>
        </div>
        {part.command ? <pre className="chat-tool-command">{part.command}</pre> : null}
        {part.output ? <pre className="chat-tool-output">{part.output}</pre> : null}
      </div>
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
  contextWindowTokens: config?.contextWindowTokens || 200000,
  customHeaders: config?.customHeaders || '',
  enabled: config?.enabled || false,
});

const claudeRuntimeExecutor = new ClaudeRuntime();
const codexRuntimeExecutor = new CodexRuntime();

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
  const [streamingDraftContents, setStreamingDraftContents] = useState<Record<string, string>>({});
  const [projectFileOperationMode, setProjectFileOperationMode] = useState<ProjectFileOperationMode>('manual');
  const isControlledCollapse = typeof collapsed === 'boolean';
  const isCollapsed = isControlledCollapse ? Boolean(collapsed) : internalIsCollapsed;
  const showExpandedShell = !isCollapsed || lockExpandedForEmbedded;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingDraftBufferRef = useRef<Record<string, string>>({});
  const streamingFlushFrameRef = useRef<number | null>(null);

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
    setConfigEnabled,
  } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
      addConfig: state.addConfig,
      updateConfig: state.updateConfig,
      setConfigEnabled: state.setConfigEnabled,
    }))
  );

  const {
    currentProject,
    requirementDocs,
    activeKnowledgeFileId,
    generatedFiles,
    pageStructure,
    setRawRequirementInput,
  } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
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
    setActiveSession,
    appendMessage,
    appendActivityEntry,
    updateMessage,
    renameSession,
  } = useAIChatStore(
    useShallow((state) => ({
      ensureProjectState: state.ensureProjectState,
      upsertSession: state.upsertSession,
      setActiveSession: state.setActiveSession,
      appendMessage: state.appendMessage,
      appendActivityEntry: state.appendActivityEntry,
      updateMessage: state.updateMessage,
      renameSession: state.renameSession,
    }))
  );

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    ensureProjectState(currentProject.id);

    const projectState = useAIChatStore.getState().projects[currentProject.id];
    if (!projectState || projectState.sessions.length === 0) {
      const session = createWelcomeSession(currentProject.id, currentProject.name);
      upsertSession(currentProject.id, session);
      setActiveSession(currentProject.id, session.id);
    }
  }, [currentProject, ensureProjectState, setActiveSession, upsertSession]);

  const sessions = projectChatState?.sessions || [];
  const activeSessionId = projectChatState?.activeSessionId || sessions[0]?.id || null;
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [activeSessionId, sessions]
  );
  const messages = activeSession?.messages || EMPTY_MESSAGES;
  const activityEntries = projectChatState?.activityEntries || EMPTY_ACTIVITY_ENTRIES;
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
    async (projectRoot: string, operations: ProjectFileOperation[]): Promise<ProjectFileExecutionResult> => {
      const changedPaths: string[] = [];

      for (const operation of operations) {
        const absolutePath = resolveProjectOperationPath(projectRoot, operation.targetPath);

        if (!isSupportedProjectTextFilePath(absolutePath)) {
          throw new Error(`当前版本只支持文本文件操作：${operation.targetPath}`);
        }

        if (operation.type === 'create_file') {
          if (typeof operation.content !== 'string') {
            throw new Error(`新建文件缺少内容：${operation.targetPath}`);
          }

          const existingContent = await readProjectTextFile(absolutePath);
          if (existingContent !== null) {
            throw new Error(`文件已存在，不能按“新建”覆盖：${operation.targetPath}`);
          }

          const parentDirectory = getDirectoryPath(absolutePath);
          if (parentDirectory) {
            const mkdirResult = await invoke<TauriToolResponse>('tool_mkdir', {
              params: {
                file_path: parentDirectory,
              },
            });

            if (!mkdirResult.success) {
              throw new Error(mkdirResult.error || `无法创建目录：${parentDirectory}`);
            }
          }

          await writeProjectTextFile(absolutePath, operation.content);
          changedPaths.push(operation.targetPath);
          continue;
        }

        if (operation.type === 'edit_file') {
          const existingContent = await readProjectTextFile(absolutePath);
          if (existingContent === null) {
            throw new Error(`找不到要编辑的文件：${operation.targetPath}`);
          }

          if (typeof operation.oldString === 'string') {
            const editResult = await invoke<TauriToolResponse>('tool_edit', {
              params: {
                file_path: absolutePath,
                old_string: operation.oldString,
                new_string: operation.newString ?? '',
              },
            });

            if (!editResult.success) {
              throw new Error(editResult.error || `编辑文件失败：${operation.targetPath}`);
            }
          } else if (typeof operation.content === 'string') {
            await writeProjectTextFile(absolutePath, operation.content);
          } else {
            throw new Error(`编辑文件缺少可执行内容：${operation.targetPath}`);
          }

          changedPaths.push(operation.targetPath);
          continue;
        }

        const viewResult = await invoke<TauriToolResponse>('tool_view', {
          params: {
            file_path: absolutePath,
            offset: 0,
            limit: 1,
          },
        });
        if (!viewResult.success) {
          throw new Error(viewResult.error || `只能删除已存在的文本文件：${operation.targetPath}`);
        }

        const removeResult = await invoke<TauriToolResponse>('tool_remove', {
          params: {
            file_path: absolutePath,
          },
        });
        if (!removeResult.success) {
          throw new Error(removeResult.error || `删除文件失败：${operation.targetPath}`);
        }

        changedPaths.push(operation.targetPath);
      }

      return {
        ok: true,
        changedPaths,
        message:
          changedPaths.length > 0
            ? `已执行 ${changedPaths.length} 项文件操作：${changedPaths.join('、')}`
            : '没有执行任何文件操作。',
      };
    },
    []
  );

  const handleCancelProjectFileProposal = useCallback(
    (messageId: string) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        projectFileProposal: message.projectFileProposal
          ? {
              ...message.projectFileProposal,
              status: 'cancelled',
              executionMessage: '已取消本次文件操作。',
            }
          : message.projectFileProposal,
      }));
    },
    [activeSessionId, currentProject, updateMessage]
  );

  const handleExecuteProjectFileProposal = useCallback(
    async (messageId: string, proposal: ProjectFileProposal) => {
      if (!currentProject || !activeSessionId) {
        return;
      }

      updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
        ...message,
        projectFileProposal: message.projectFileProposal
          ? {
              ...message.projectFileProposal,
              status: 'executing',
              executionMessage: '正在执行文件操作...',
            }
          : message.projectFileProposal,
      }));

      const runId = createRunId();

      try {
        const projectRoot = await getProjectDir(currentProject.id);
        const result = await executeProjectFileOperations(projectRoot, proposal.operations);

        updateMessage(currentProject.id, activeSessionId, messageId, (message) => ({
          ...message,
          content: proposal.assistantMessage,
          projectFileProposal: message.projectFileProposal
            ? {
                ...message.projectFileProposal,
                status: 'executed',
                executionMessage: result.message,
              }
            : message.projectFileProposal,
        }));

        appendActivityEntry(currentProject.id, {
          id: createActivityEntryId(),
          runId,
          type: 'run-summary',
          summary: result.message,
          changedPaths: result.changedPaths,
          runtime: 'built-in',
          skill: 'project-file-ops',
          createdAt: Date.now(),
        });
      } catch (error) {
        const message = normalizeErrorMessage(error);

        updateMessage(currentProject.id, activeSessionId, messageId, (currentMessage) => ({
          ...currentMessage,
          projectFileProposal: currentMessage.projectFileProposal
            ? {
                ...currentMessage.projectFileProposal,
                status: 'failed',
                executionMessage: message,
              }
            : currentMessage.projectFileProposal,
        }));

        appendActivityEntry(currentProject.id, {
          id: createActivityEntryId(),
          runId,
          type: 'failed',
          summary: message,
          changedPaths: proposal.operations.map((operation) => operation.targetPath),
          runtime: 'built-in',
          skill: 'project-file-ops',
          createdAt: Date.now(),
        });
      }
    },
    [activeSessionId, appendActivityEntry, currentProject, executeProjectFileOperations, updateMessage]
  );

  const renderProjectFileProposal = useCallback(
    (message: { id: string; projectFileProposal?: ProjectFileProposal }) => {
      const proposal = message.projectFileProposal;
      if (!proposal) {
        return null;
      }

      return (
        <section className="chat-project-file-proposal-card">
          <div className="chat-project-file-proposal-head">
            <strong>{proposal.summary}</strong>
            <span>{projectFileProposalStatusLabel[proposal.status]}</span>
          </div>
          <div className="chat-project-file-proposal-meta">
            <span>模式：{modeLabelMap[proposal.mode]}</span>
            <span>{proposal.operations.length} 项操作</span>
          </div>
          <div className="chat-project-file-proposal-list">
            {proposal.operations.map((operation) => (
              <div className="chat-project-file-proposal-operation" key={operation.id}>
                <strong>
                  {projectFileOperationTypeLabel[operation.type]} <code>{operation.targetPath}</code>
                </strong>
                <span>{operation.summary || '等待执行'}</span>
              </div>
            ))}
          </div>
          {proposal.executionMessage ? <div className="chat-project-file-proposal-note">{proposal.executionMessage}</div> : null}
          <div className="chat-project-file-proposal-actions">
            {proposal.status === 'pending' ? (
              <>
                <button type="button" onClick={() => void handleExecuteProjectFileProposal(message.id, proposal)}>
                  确认执行
                </button>
                <button type="button" onClick={() => handleCancelProjectFileProposal(message.id)}>
                  取消
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
      title: localAgentSnapshot?.codexHome.exists ? 'Codex CLI 已就绪' : '未检测到本地 Codex 配置，将回退到内置 AI',
      fallbackMessage: localAgentSnapshot?.codexHome.exists ? null : '未检测到本地 Codex 配置，已回退到内置 AI。',
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
            title: note.title,
            filePath: note.sourceUrl || '',
          }))
        : requirementDocs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            filePath: doc.filePath || '',
          }));

    const generatedContextFiles = generatedFiles
      .filter((file) => file.language === 'html' || file.language === 'md')
      .map((file) => ({
        id: `generated:${file.path}`,
        title: file.path.split('/').pop() || file.path,
        filePath: file.path,
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

  const currentContextUsage = useMemo(() => {
    const previewPrompt = buildDirectChatPrompt({
      userInput: input.trim() || '继续当前对话',
      currentProjectName: currentProject?.name,
      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
      skillIntent: null,
      conversationHistory: activeSession?.messages || [],
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
      selectedRuntimeConfig?.contextWindowTokens || 200000
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
    selectedRuntimeConfig,
  ]);
  const selectedAgent = useMemo(
    () => CHAT_AGENTS.find((agent) => agent.id === selectedChatAgentId) || CHAT_AGENTS[0],
    [selectedChatAgentId]
  );
  const isFreshSession = messages.length <= 1;
  const latestActivityEntry = activityEntries[0] || null;
  const runStateLabel = isLoading ? 'Running' : latestActivityEntry?.type === 'failed' ? 'Failed' : 'Ready';
  const runStateTone = isLoading ? 'running' : latestActivityEntry?.type === 'failed' ? 'error' : 'success';
  const flushStreamingDrafts = useCallback(() => {
    streamingFlushFrameRef.current = null;
    setStreamingDraftContents({ ...streamingDraftBufferRef.current });
  }, []);
  const scheduleStreamingDraftFlush = useCallback(() => {
    if (streamingFlushFrameRef.current !== null) {
      return;
    }

    streamingFlushFrameRef.current = requestAnimationFrame(() => {
      flushStreamingDrafts();
    });
  }, [flushStreamingDrafts]);
  const updateStreamingDraft = useCallback(
    (messageId: string, content: string) => {
      streamingDraftBufferRef.current[messageId] = content;
      scheduleStreamingDraftFlush();
    },
    [scheduleStreamingDraftFlush]
  );
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
  const handleApplySuggestion = useCallback((prompt: string) => {
    setInput(prompt);
    setShowHistoryMenu(false);
    textareaRef.current?.focus();
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
      name: `AI 閰嶇疆 ${aiConfigs.length + 1}`,
      provider: settingsDraft.provider,
      baseURL: settingsDraft.baseURL || getSuggestedBaseURL(settingsDraft.provider, selectedSettingsPreset),
      model: settingsDraft.model,
      contextWindowTokens: settingsDraft.contextWindowTokens,
    });
    setSelectedSettingsConfigId(nextId);
    setTestState('idle');
    setTestMessage('');
  }, [addConfig, aiConfigs.length, selectedSettingsPreset, settingsDraft.baseURL, settingsDraft.model, settingsDraft.provider]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setShowApiKey(false);
  }, []);

  const closeSkillsModal = useCallback(() => {
    setIsSkillsModalOpen(false);
  }, []);

  const handleCreateSession = useCallback(() => {
    if (!currentProject) {
      return;
    }

    const session = createWelcomeSession(currentProject.id, currentProject.name);
    upsertSession(currentProject.id, session);
    setActiveSession(currentProject.id, session.id);
    setInput('');
    setShowHistoryMenu(false);
  }, [currentProject, setActiveSession, upsertSession]);

  const submitPrompt = useCallback(
    async (promptValue: string) => {
      if (!promptValue.trim() || isLoading || !currentProject) {
        return;
      }

      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const session = createWelcomeSession(currentProject.id, currentProject.name);
        upsertSession(currentProject.id, session);
        setActiveSession(currentProject.id, session.id);
        targetSessionId = session.id;
      }

      const rawContent = promptValue.trim();
      const skillIntent: SkillIntent | null = resolveSkillIntent(rawContent);
      const resolvedSkill = skillIntent?.skill || null;
      const effectiveChatAgentId =
        selectedChatAgentId !== 'built-in' && !agentAvailability[selectedChatAgentId].ready
          ? 'built-in'
          : selectedChatAgentId;
      const fallbackToBuiltInMessage =
        selectedChatAgentId !== effectiveChatAgentId ? agentAvailability[selectedChatAgentId].fallbackMessage : null;
      const cleanedContent = skillIntent?.cleanedInput.trim()
        ? skillIntent.cleanedInput.trim()
        : rawContent;
      const userMessage = createStoredChatMessage('user', rawContent);

      appendMessage(currentProject.id, targetSessionId, userMessage);
      if (fallbackToBuiltInMessage) {
        setSelectedChatAgentId('built-in');
        appendMessage(
          currentProject.id,
          targetSessionId,
          createStoredChatMessage('system', fallbackToBuiltInMessage)
        );
      }

      if (!activeSession || activeSession.title === '新对话') {
        renameSession(currentProject.id, targetSessionId, summarizeSessionTitle(rawContent));
      }

      if (effectiveChatAgentId === 'built-in' && !isRuntimeConfigured) {
        appendMessage(
          currentProject.id,
          targetSessionId,
          createStoredChatMessage('system', normalizeErrorMessage(buildAIConfigurationError()), 'error')
        );
        return;
      }

      const assistantMessage = createStoredChatMessage('assistant', '正在思考...');
      appendMessage(currentProject.id, targetSessionId, assistantMessage);
      setIsLoading(true);
      const runId = createRunId();

      if (selectedRuntimeConfig && !providerExecutionMode) {
        aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
      }

      try {
        const buildDirectChatRequest = () => {
          return buildDirectChatPrompt({
            userInput: cleanedContent,
            currentProjectName: currentProject.name,
            contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
            skillIntent,
            conversationHistory: activeSession?.messages || [],
            contextLabels: [
              selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
              contextSnapshot.primaryLabel,
              contextSnapshot.secondaryLabel,
              contextSnapshot.currentFileLabel,
              contextSnapshot.vaultLabel,
              ...explicitReferenceLabels,
            ].filter((item): item is string => Boolean(item)),
          });
        };

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

          await runAIWorkflowPackage(targetWorkflowPackage);

          const latestWorkflowRun =
            useAIWorkflowStore.getState().projects[currentProject.id]?.runs[0] || null;
          const currentStageSummary = latestWorkflowRun?.currentStage
            ? latestWorkflowRun.stageSummaries[latestWorkflowRun.currentStage]
            : '';
          const finalContent = [
            `已在当前对话中执行 ${targetWorkflowPackage} 能力链。`,
            latestWorkflowRun?.status === 'awaiting_confirmation'
              ? '当前结果已生成，正在等待你确认后再继续下一段。'
              : null,
            currentStageSummary || null,
          ]
            .filter((item): item is string => Boolean(item))
            .join('\n');

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: finalContent || '已在当前对话中开始执行对应能力链。',
          }));

          appendActivityEntry(currentProject.id, {
            id: createActivityEntryId(),
            runId,
            type: 'run-summary',
            summary: `AI 执行了 ${targetWorkflowPackage} 能力链`,
            changedPaths: [],
            runtime: 'built-in',
            skill: resolvedSkill,
            createdAt: Date.now(),
          });
          return;
        }

        const isProjectFileWriteRequest = detectProjectFileWriteIntent(cleanedContent);
        const isProjectFileReadRequest = detectProjectFileReadIntent(cleanedContent);

        if (effectiveChatAgentId === 'built-in' && (isProjectFileWriteRequest || isProjectFileReadRequest)) {
          const projectRoot = await getProjectDir(currentProject.id);

          if (selectedRuntimeConfig) {
            aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
          }

          if (isProjectFileReadRequest && !isProjectFileWriteRequest) {
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: '正在读取项目文件...',
            }));

            const readResponse = await aiService.chatWithTools({
              prompt: cleanedContent,
              systemPrompt: buildProjectFileReadSystemPrompt(currentProject.name || '当前项目', projectRoot),
              allowedTools: READ_ONLY_CHAT_TOOLS,
            });
            const finalContent = readResponse.trim() || '已读取相关文件，但这次没有返回内容。';

            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: finalContent,
            }));

            return;
          }

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: projectFileOperationMode === 'auto' ? '正在规划并执行文件操作...' : '正在生成文件操作提案...',
          }));

          const planResponse = await aiService.chatWithTools({
            prompt: buildProjectFilePlanningPrompt(cleanedContent),
            systemPrompt: buildProjectFilePlanningSystemPrompt(currentProject.name || '当前项目', projectRoot),
            allowedTools: READ_ONLY_CHAT_TOOLS,
          });
          const plan = parseProjectFileOperationsPlan(planResponse);

          if (plan.status !== 'ready' || plan.operations.length === 0) {
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: plan.assistantMessage.trim() || plan.summary.trim() || '这次还不能安全执行文件操作，请补充更明确的路径和内容。',
            }));
            return;
          }

          const proposal: ProjectFileProposal = {
            id: createProjectFileProposalId(),
            mode: projectFileOperationMode,
            status: projectFileOperationMode === 'auto' ? 'executing' : 'pending',
            summary: plan.summary.trim() || `计划执行 ${plan.operations.length} 项文件操作`,
            assistantMessage: plan.assistantMessage.trim() || plan.summary.trim() || '我已经整理好本次文件操作计划。',
            operations: plan.operations,
            executionMessage: projectFileOperationMode === 'auto' ? '系统已自动确认，正在执行。' : '请确认后执行。',
          };

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: proposal.assistantMessage,
            projectFileProposal: proposal,
          }));

          if (projectFileOperationMode === 'manual') {
            return;
          }

          try {
            const result = await executeProjectFileOperations(projectRoot, proposal.operations);
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              projectFileProposal: message.projectFileProposal
                ? {
                    ...message.projectFileProposal,
                    status: 'executed',
                    executionMessage: result.message,
                  }
                : message.projectFileProposal,
            }));
            appendActivityEntry(currentProject.id, {
              id: createActivityEntryId(),
              runId,
              type: 'run-summary',
              summary: result.message,
              changedPaths: result.changedPaths,
              runtime: 'built-in',
              skill: 'project-file-ops',
              createdAt: Date.now(),
            });
          } catch (error) {
            const message = normalizeErrorMessage(error);
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
              ...currentMessage,
              projectFileProposal: currentMessage.projectFileProposal
                ? {
                    ...currentMessage.projectFileProposal,
                    status: 'failed',
                    executionMessage: message,
                  }
                : currentMessage.projectFileProposal,
            }));
            appendActivityEntry(currentProject.id, {
              id: createActivityEntryId(),
              runId,
              type: 'failed',
              summary: message,
              changedPaths: proposal.operations.map((operation) => operation.targetPath),
              runtime: 'built-in',
              skill: 'project-file-ops',
              createdAt: Date.now(),
            });
          }

          return;
        }

        if (effectiveChatAgentId !== 'built-in') {
          const directChat = buildDirectChatRequest();
          const projectRoot = await getProjectDir(currentProject.id);
          const localAgentPrompt = [
            directChat.systemPrompt ? `<system>\n${directChat.systemPrompt}\n</system>` : null,
            directChat.prompt,
          ].filter((item): item is string => Boolean(item)).join('\n\n');
          const result = await invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
            params: {
              agent: effectiveChatAgentId,
              projectRoot,
              prompt: localAgentPrompt,
            },
          });

          if (!result.success) {
            throw new Error(result.error || 'Local agent execution failed.');
          }

          const finalContent = result.content.trim() || '本地 Agent 已执行，但没有返回内容。';
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: finalContent,
          }));
          const activityEntry = buildRunSummaryEntry({
            runId,
            content: finalContent,
            skill: resolvedSkill,
          });
          if (activityEntry) {
            appendActivityEntry(currentProject.id, activityEntry);
          }
          return;
        }

        let thinkingContent = '';
        let answerContent = '';
        const directChat = buildDirectChatRequest();
        const buildStreamingMessage = (completeThinking: boolean) => {
          const sections: string[] = [];
          if (thinkingContent.trim()) {
            sections.push(
              completeThinking
                ? `<think>${thinkingContent}</think>`
                : `<think>${thinkingContent}`
            );
          }
          if (answerContent.trim()) {
            sections.push(answerContent);
          }
          return sections.join('\n\n').trim() || '正在思考...';
        };
        const handleEvent = (event: AITextStreamEvent) => {
          if (event.kind === 'thinking') {
            thinkingContent += event.delta;
          } else {
            answerContent += event.delta;
          }
          updateStreamingDraft(assistantMessage.id, buildStreamingMessage(false));
        };
        const response =
          providerExecutionMode === 'claude' && selectedRuntimeConfig
            ? await claudeRuntimeExecutor.executePrompt({
                sessionId: targetSessionId,
                config: selectedRuntimeConfig,
                systemPrompt: directChat.systemPrompt,
                prompt: directChat.prompt,
                onEvent: handleEvent,
              })
            : providerExecutionMode === 'codex' && selectedRuntimeConfig
              ? await codexRuntimeExecutor.executePrompt({
                  sessionId: targetSessionId,
                  config: selectedRuntimeConfig,
                  systemPrompt: directChat.systemPrompt,
                  prompt: directChat.prompt,
                  onEvent: handleEvent,
                })
              : await aiService.completeText({
                  systemPrompt: directChat.systemPrompt,
                  prompt: directChat.prompt,
                  onEvent: handleEvent,
                });

        const streamedContent = buildStreamingMessage(true);
        const finalContent =
          streamedContent !== '正在思考...'
            ? streamedContent
            : response.trim() || '已收到请求，但这次没有返回内容。';
        clearStreamingDraft(assistantMessage.id);
        const normalizedFinalContent = finalContent.trim() || response.trim() || '已收到请求，但这次没有返回内容。';
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
          ...message,
          content: normalizedFinalContent,
        }));
        const activityEntry = buildRunSummaryEntry({
          runId,
          content: finalContent,
          skill: resolvedSkill,
        });
        if (activityEntry) {
          appendActivityEntry(currentProject.id, activityEntry);
        }
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
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSession,
      activeSessionId,
      agentAvailability,
      appendActivityEntry,
      appendMessage,
      clearStreamingDraft,
      contextSnapshot.currentFileLabel,
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      contextSnapshot.vaultLabel,
      currentProject,
      explicitReferenceLabels,
      isLoading,
      isRuntimeConfigured,
      providerExecutionMode,
      renameSession,
      selectedChatAgentId,
      selectedRuntimeConfig,
      setActiveSession,
      executeProjectFileOperations,
      projectFileOperationMode,
      setRawRequirementInput,
      setSelectedChatAgentId,
      updateMessage,
      updateStreamingDraft,
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      buildSessionPreview={buildSessionPreview}
    />
  ) : null;
  const launchpad = isFreshSession ? (
    <section className="chat-launchpad" aria-label="GN Agent quick actions">
      <div className="chat-launchpad-hero">
        <h2>让 GN Agent 直接开始推进项目</h2>
      </div>

      <div className="chat-launchpad-status">
        <span className="chat-shell-status-pill">{selectedAgent.label}</span>
        <span className="chat-shell-status-pill">{selectedRuntimeConfig?.name || '未启用 AI 配置'}</span>
        <span className="chat-shell-status-pill">按需搜索项目内容</span>
      </div>

      <div className="chat-launchpad-grid">
        {GN_AGENT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className="chat-launchpad-card"
            onClick={() => handleApplySuggestion(suggestion.prompt)}
          >
            <strong>{suggestion.label}</strong>
            <span>{suggestion.description}</span>
          </button>
        ))}
      </div>
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
      messagesEndRef={messagesEndRef}
      leadingContent={launchpad}
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
                    input={input}
                    setInput={setInput}
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
                      <div className="chat-composer-main">
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
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
                <span>上下文长度 (tokens)</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settingsDraft.contextWindowTokens}
                  onChange={(event) =>
                    setSettingsDraft((current) => {
                      const nextValue = Number(event.target.value);
                      return {
                        ...current,
                        contextWindowTokens: Math.max(1000, Number.isFinite(nextValue) ? nextValue : 200000),
                      };
                    })
                  }
                />
                <small>默认 200k，用于提示当前上下文占用，并作为后续引用预算。</small>
              </label>

              <label className="chat-settings-field chat-settings-field-full">
                <span>Custom Headers</span>
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
              <a className="chat-settings-doc-link" href={selectedSettingsPreset.docsUrl} target="_blank" rel="noreferrer">
                查看文档
              </a>
            </div>

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


