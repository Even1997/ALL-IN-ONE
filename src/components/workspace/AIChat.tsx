import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError, listModelsSupportMode } from '../../modules/ai/core/configStatus';
import { aiService, type AIProviderType } from '../../modules/ai/core/AIService';
import type { AITextStreamEvent } from '../../modules/ai/core/AIService';
import { buildDirectChatPrompt } from '../../modules/ai/chat/directChatPrompt';
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
  resolveKnowledgeSelectionForPrompt,
} from '../../modules/ai/chat/chatContext';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import type { ActivityEntry } from '../../modules/ai/skills/activityLog';
import { type AIConfigEntry, hasUsableAIConfigEntry } from '../../modules/ai/store/aiConfigState';
import { toRuntimeAIConfig } from '../../modules/ai/store/aiConfigState';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../modules/ai/claudian/localConfig';
import { ClaudeRuntime } from '../../modules/ai/claudian/runtime/claude/ClaudeRuntime';
import { CodexRuntime } from '../../modules/ai/claudian/runtime/codex/CodexRuntime';
import {
  createChatSession,
  createStoredChatMessage,
  useAIChatStore,
} from '../../modules/ai/store/aiChatStore';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { useAIWorkflowStore } from '../../modules/ai/store/workflowStore';
import { AI_CHAT_COMMAND_EVENT, type AIChatCommandDetail } from '../../modules/ai/chat/chatCommands';
import { runChangeSyncLane } from '../../modules/ai/knowledge/runChangeSyncLane';
import { runKnowledgeOrganizeLane } from '../../modules/ai/knowledge/runKnowledgeOrganizeLane';
import { resolveSkillIntent, type SkillIntent } from '../../modules/ai/workflow/skillRouting';
import { buildKnowledgeEntries } from '../../modules/knowledge/knowledgeEntries';
import { projectKnowledgeNotesToRequirementDocs } from '../../features/knowledge/adapters/knowledgeRequirementAdapter';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
import type { RequirementDoc } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import { usePreviewStore } from '../../store/previewStore';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { getProjectDir, saveKnowledgeDocsToProjectDir } from '../../utils/projectPersistence';
import { runAIWorkflowPackage } from '../../modules/ai/workflow/AIWorkflowService';
import { chooseNextWorkflowPackage } from '../../modules/ai/workflow/chatWorkflowRouting';
import {
  ClaudianActivityPanel,
  ClaudianEmbeddedComposer,
  ClaudianHistoryMenu,
  ClaudianMessageList,
} from '../ai/claudian/ClaudianEmbeddedPieces';
import { ClaudianModeSwitch } from '../ai/claudian-shell/ClaudianModeSwitch';
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
  variant?: 'default' | 'claudian-embedded' | 'gn-agent-embedded';
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

type DrawerPanelId = 'context' | 'run' | 'artifacts';
type AgentLaneId = 'chat' | 'tasks' | 'artifacts' | 'context' | 'skills' | 'activity';

type GNAgentSuggestion = {
  label: string;
  description: string;
  prompt: string;
};

const GN_AGENT_LANES: Array<{ id: AgentLaneId; label: string; description: string }> = [
  { id: 'chat', label: 'Chat', description: '自然语言协作' },
  { id: 'tasks', label: 'Tasks', description: '任务与运行状态' },
  { id: 'artifacts', label: 'Artifacts', description: '产物和变更' },
  { id: 'context', label: 'Context', description: '引用与上下文' },
  { id: 'skills', label: 'Skills', description: 'GN Agent 能力' },
  { id: 'activity', label: 'Activity', description: '执行记录' },
];

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
const GN_AGENT_SUGGESTIONS: GNAgentSuggestion[] = [
  {
    label: '@整理',
    description: '整理知识库并补齐项目索引',
    prompt: '@整理 帮我整理当前项目知识库，并输出清晰的 wiki 索引',
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

const toKnowledgeSources = (docs: RequirementDoc[]) =>
  docs.map((doc) => ({
    title: doc.title,
    content: doc.content,
    filePath: doc.filePath || '',
    updatedAt: doc.updatedAt,
    tags: doc.tags || [],
  }));

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
  const isGNAgentEmbedded = variant === 'gn-agent-embedded';
  const isClaudianEmbedded = variant === 'claudian-embedded' || isGNAgentEmbedded;
  const lockExpandedForEmbedded = variant === 'claudian-embedded';
  const [input, setInput] = useState('');
  const [activeDrawer, setActiveDrawer] = useState<DrawerPanelId | null>(null);
  const [activeAgentLane, setActiveAgentLane] = useState<AgentLaneId>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
  const [isKnowledgeReferenceEnabled] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState<AISettingsDraft>(buildSettingsDraft(null));
  const [streamingDraftContents, setStreamingDraftContents] = useState<Record<string, string>>({});
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
    selectedKnowledgeContextIds,
    generatedFiles,
    pageStructure,
    wireframes,
    replaceRequirementDocs,
    setRawRequirementInput,
  } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      requirementDocs: state.requirementDocs,
      activeKnowledgeFileId: state.activeKnowledgeFileId,
      selectedKnowledgeContextIds: state.selectedKnowledgeContextIds,
      generatedFiles: state.generatedFiles,
      pageStructure: state.pageStructure,
      wireframes: state.wireframes,
      replaceRequirementDocs: state.replaceRequirementDocs,
      setRawRequirementInput: state.setRawRequirementInput,
    }))
  );
  const previewElements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const featureTree = useFeatureTreeStore((state) => state.tree);
  const serverNotes = useKnowledgeStore((state) => state.notes);
  const syncKnowledgeNotes = useKnowledgeStore((state) => state.syncProjectNotes);
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
  const messages = activeSession?.messages || [];
  const activityEntries = projectChatState?.activityEntries || [];

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

  const knowledgeSourceDocs = useMemo(
    () => serverNotes.length > 0 ? projectKnowledgeNotesToRequirementDocs(serverNotes) : requirementDocs,
    [serverNotes, requirementDocs]
  );
  const knowledgeEntries = useMemo(
    () => buildKnowledgeEntries(knowledgeSourceDocs, generatedFiles),
    [generatedFiles, knowledgeSourceDocs]
  );

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const workflowAvailability = useMemo(
    () => ({
      hasRequirementsSpec: requirementDocs.some(
        (doc) => doc.sourceType === 'ai' && doc.title.includes('需求规格说明书')
      ),
      hasFeatureTree: Boolean(featureTree?.children.length),
      hasPageStructure: designPages.length > 0,
      hasWireframes: Object.keys(wireframes).length > 0,
    }),
    [designPages.length, featureTree, requirementDocs, wireframes]
  );
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
  const effectiveKnowledgeMode = knowledgeEntries.length > 0 ? 'all' : 'off';
  const displayKnowledgeFile = useMemo(
    () => knowledgeEntries.find((entry) => entry.id === activeKnowledgeFileId) || null,
    [activeKnowledgeFileId, knowledgeEntries]
  );
  const focusedKnowledgeFileId = isKnowledgeReferenceEnabled ? activeKnowledgeFileId : null;
  const knowledgeSelectionMeta = useMemo(
    () =>
      resolveKnowledgeSelectionForPrompt({
        scene: aiContextState?.scene || 'knowledge',
        knowledgeMode: effectiveKnowledgeMode,
        knowledgeEntries,
        activeKnowledgeFileId: focusedKnowledgeFileId,
        selectedKnowledgeContextIds,
      }),
    [aiContextState?.scene, effectiveKnowledgeMode, focusedKnowledgeFileId, knowledgeEntries, selectedKnowledgeContextIds]
  );
  const contextSnapshot = useMemo(
    () =>
      buildChatContextSnapshot({
        scene: aiContextState?.scene || 'knowledge',
        pageTitle: selectedPage?.name || null,
        selectedElementLabel,
        knowledgeLabel: displayKnowledgeFile && isKnowledgeReferenceEnabled
          ? `鐭ヨ瘑鏂囨。 / ${displayKnowledgeFile.title}`
          : null,
      }),
    [aiContextState?.scene, displayKnowledgeFile, isKnowledgeReferenceEnabled, selectedElementLabel, selectedPage?.name]
  );

  const currentContextUsage = useMemo(() => {
    const previewPrompt = buildDirectChatPrompt({
      userInput: input.trim() || '缁х画褰撳墠瀵硅瘽',
      currentProjectName: currentProject?.name,
      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
      skillIntent: null,
      knowledgeSelection: knowledgeSelectionMeta,
      conversationHistory: activeSession?.messages || [],
      contextLabels: [
        selectedRuntimeConfig ? `褰撳墠 AI / ${selectedRuntimeConfig.name}` : null,
        contextSnapshot.primaryLabel,
        contextSnapshot.secondaryLabel,
        contextSnapshot.knowledgeLabel,
      ].filter((item): item is string => Boolean(item)),
    });

    return buildContextUsageSummary(
      [previewPrompt.systemPrompt, previewPrompt.prompt],
      selectedRuntimeConfig?.contextWindowTokens || 200000
    );
  }, [
    contextSnapshot.knowledgeLabel,
    contextSnapshot.primaryLabel,
    contextSnapshot.secondaryLabel,
    currentProject?.name,
    input,
    knowledgeSelectionMeta,
    activeSession?.messages,
    selectedRuntimeConfig,
  ]);
  const selectedAgent = useMemo(
    () => CHAT_AGENTS.find((agent) => agent.id === selectedChatAgentId) || CHAT_AGENTS[0],
    [selectedChatAgentId]
  );
  const isFreshSession = messages.length <= 1;
  const artifactPaths = useMemo(
    () =>
      Array.from(
        new Set(
          activityEntries
            .flatMap((entry) => entry.changedPaths)
            .filter(Boolean)
        )
      ),
    [activityEntries]
  );
  const latestActivityEntry = activityEntries[0] || null;
  const runStateLabel = isLoading ? 'Running' : latestActivityEntry?.type === 'failed' ? 'Failed' : 'Ready';
  const runStateTone = isLoading ? 'running' : latestActivityEntry?.type === 'failed' ? 'error' : 'success';
  const toggleDrawer = useCallback((drawer: DrawerPanelId) => {
    setActiveDrawer((current) => (current === drawer ? null : drawer));
    setShowHistoryMenu(false);
  }, []);
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
    setActiveAgentLane('chat');
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
        : skillIntent?.package === 'knowledge-organize'
          ? '请整理当前项目知识库，并输出清晰的 wiki 索引。'
          : skillIntent?.package === 'change-sync'
            ? '请检查当前原型、知识文档和已有产物的差异，生成可确认的变更同步提案。'
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
        const directChat = buildDirectChatPrompt({
          userInput: cleanedContent,
          currentProjectName: currentProject.name,
          contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
          skillIntent,
          knowledgeSelection: knowledgeSelectionMeta,
          conversationHistory: activeSession?.messages || [],
          contextLabels: [
            selectedRuntimeConfig ? `褰撳墠 AI / ${selectedRuntimeConfig.name}` : null,
            contextSnapshot.primaryLabel,
            contextSnapshot.secondaryLabel,
            contextSnapshot.knowledgeLabel,
          ].filter((item): item is string => Boolean(item)),
        });

        const executeLaneText = async (prompt: string) => {
          if (effectiveChatAgentId !== 'built-in') {
            const projectRoot = await getProjectDir(currentProject.id);
            const result = await invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
              params: {
                agent: effectiveChatAgentId,
                projectRoot,
                prompt,
              },
            });

            if (!result.success) {
              throw new Error(result.error || 'Local agent execution failed.');
            }

            return result.content.trim();
          }

          if (providerExecutionMode === 'claude' && selectedRuntimeConfig) {
            return claudeRuntimeExecutor.executePrompt({
              sessionId: targetSessionId,
              config: selectedRuntimeConfig,
              systemPrompt: '你是产品知识库整理助手。',
              prompt,
            });
          }

          if (providerExecutionMode === 'codex' && selectedRuntimeConfig) {
            return codexRuntimeExecutor.executePrompt({
              sessionId: targetSessionId,
              config: selectedRuntimeConfig,
              systemPrompt: 'You are a product knowledge base organizer.',
              prompt,
            });
          }

          return aiService.completeText({
            systemPrompt: '你是产品知识库整理助手。',
            prompt,
          });
        };

        if (skillIntent?.skill === 'requirements') {
          setRawRequirementInput(cleanedContent);
        }

        if (skillIntent?.package === 'knowledge-organize') {
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: '正在整理知识库并生成 wiki 索引...',
          }));

          const docs = await runKnowledgeOrganizeLane({
            project: {
              id: currentProject.id,
              name: currentProject.name,
            },
            requirementDocs: knowledgeSourceDocs,
            generatedFiles,
            executeText: executeLaneText,
          });
          const persistedDocs = await saveKnowledgeDocsToProjectDir(currentProject.id, docs);
          const syncedNotes = await syncKnowledgeNotes(currentProject.id, toKnowledgeSources(persistedDocs));
          const mergedDocs = projectKnowledgeNotesToRequirementDocs(syncedNotes);
          replaceRequirementDocs(mergedDocs);

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: `已整理知识库，并生成 ${docs.length} 份文档：${docs.map((doc) => doc.title).join('、')}`,
          }));
          appendActivityEntry(currentProject.id, {
            id: createActivityEntryId(),
            runId,
            type: 'run-summary',
            summary: `AI 整理了知识库并生成 ${docs.length} 份 wiki 文档`,
            changedPaths: persistedDocs.map((doc) => doc.filePath || doc.title),
            runtime: effectiveChatAgentId === 'built-in' ? 'built-in' : 'local',
            skill: resolvedSkill,
            createdAt: Date.now(),
          });
          return;
        }

        if (skillIntent?.package === 'change-sync') {
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: '正在检查差异并生成变更同步提案...',
          }));

          const docs = await runChangeSyncLane({
            project: {
              id: currentProject.id,
              name: currentProject.name,
            },
            requirementDocs: knowledgeSourceDocs,
            generatedFiles,
            executeText: executeLaneText,
          });
          const persistedDocs = await saveKnowledgeDocsToProjectDir(currentProject.id, docs);
          const syncedNotes = await syncKnowledgeNotes(currentProject.id, toKnowledgeSources(persistedDocs));
          const mergedDocs = projectKnowledgeNotesToRequirementDocs(syncedNotes);
          replaceRequirementDocs(mergedDocs);

          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: `已生成 ${docs.length} 份变更同步文档：${docs.map((doc) => doc.title).join('、')}`,
          }));

          appendActivityEntry(currentProject.id, {
            id: createActivityEntryId(),
            runId,
            type: 'run-summary',
            summary: `AI 生成了 ${docs.length} 份变更同步提案文档`,
            changedPaths: persistedDocs.map((doc) => doc.filePath || doc.title),
            runtime: effectiveChatAgentId === 'built-in' ? 'built-in' : 'local',
            skill: resolvedSkill,
            createdAt: Date.now(),
          });
          return;
        }

        if (skillIntent) {
          if (selectedRuntimeConfig) {
            aiService.setConfig(toRuntimeAIConfig(selectedRuntimeConfig));
          }

          const fallbackWorkflowPackage = chooseNextWorkflowPackage(workflowAvailability);
          const requestedWorkflowPackage = skillIntent.package;
          const targetWorkflowPackage =
            requestedWorkflowPackage === 'requirements' || requestedWorkflowPackage === fallbackWorkflowPackage
              ? requestedWorkflowPackage
              : fallbackWorkflowPackage;

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

        if (effectiveChatAgentId !== 'built-in') {
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
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
          ...message,
          content: finalContent.trim() || response.trim() || '已收到请求，但这次没有返回内容。',
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
      contextSnapshot.knowledgeLabel,
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      currentProject,
      generatedFiles,
      isLoading,
      isRuntimeConfigured,
      knowledgeSelectionMeta,
      knowledgeSourceDocs,
      providerExecutionMode,
      renameSession,
      replaceRequirementDocs,
      selectedChatAgentId,
      selectedRuntimeConfig,
      setActiveSession,
      setRawRequirementInput,
      setSelectedChatAgentId,
      syncKnowledgeNotes,
      updateMessage,
      updateStreamingDraft,
      upsertSession,
      workflowAvailability,
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
    <ClaudianHistoryMenu
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
        <span className="chat-shell-kicker">AI Workspace</span>
        <h2>让 GN Agent 直接开始推进项目</h2>
        <p>
          它现在更像一个真正的 AI 产品：先聊天，再按需展开 Context、Run 和 Artifacts。
          你可以直接描述目标，或者从下面的 PM 超能力开始。
        </p>
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
  const headerDrawerContent = activeDrawer === 'context' ? (
    <div className="chat-shell-drawer-panel">
      <div className="chat-shell-drawer-header">
        <div>
          <strong>Context Drawer</strong>
          <span>AI 当前会读到的上下文和预算。</span>
        </div>
        <button className="chat-shell-drawer-close" type="button" onClick={() => setActiveDrawer(null)}>
          关闭
        </button>
      </div>

      <div className="chat-shell-drawer-summary-grid">
        <div className="chat-shell-drawer-summary-card">
          <span>Agent</span>
          <strong>{selectedAgent.label}</strong>
        </div>
        <div className="chat-shell-drawer-summary-card">
          <span>Model</span>
          <strong>{selectedRuntimeConfig?.model || '未启用 AI'}</strong>
        </div>
        <div className="chat-shell-drawer-summary-card">
          <span>Context</span>
          <strong>{currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}</strong>
        </div>
      </div>

      <div className="chat-shell-context-stack">
        <div className="chat-shell-drawer-copy">
          <strong>当前摘要</strong>
          <div className="chat-context-strip">
            {contextSnapshot.primaryLabel ? <span className="chat-context-chip subtle">{contextSnapshot.primaryLabel}</span> : null}
            {contextSnapshot.secondaryLabel ? <span className="chat-context-chip subtle">{contextSnapshot.secondaryLabel}</span> : null}
            {contextSnapshot.knowledgeLabel ? <span className="chat-context-chip subtle">{contextSnapshot.knowledgeLabel}</span> : null}
            {!contextSnapshot.primaryLabel && !contextSnapshot.secondaryLabel && !contextSnapshot.knowledgeLabel ? (
              <span className="chat-context-chip subtle">当前没有额外上下文摘要</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ) : activeDrawer === 'run' ? (
    <div className="chat-shell-drawer-panel">
      <div className="chat-shell-drawer-header">
        <div>
          <strong>Run Drawer</strong>
          <span>AI 做了什么、当前跑到哪一步。</span>
        </div>
        <button className="chat-shell-drawer-close" type="button" onClick={() => setActiveDrawer(null)}>
          关闭
        </button>
      </div>

      <div className="chat-shell-drawer-summary-grid">
        <div className={`chat-shell-drawer-summary-card ${runStateTone}`}>
          <span>Run State</span>
          <strong>{runStateLabel}</strong>
        </div>
        <div className="chat-shell-drawer-summary-card">
          <span>Latest Event</span>
          <strong>{latestActivityEntry?.summary || '暂无执行记录'}</strong>
        </div>
      </div>

      <ClaudianActivityPanel activityEntries={activityEntries} formatTimestamp={formatTimestamp} />
    </div>
  ) : activeDrawer === 'artifacts' ? (
    <div className="chat-shell-drawer-panel">
      <div className="chat-shell-drawer-header">
        <div>
          <strong>Artifacts Drawer</strong>
          <span>本轮对项目留下了什么产物。</span>
        </div>
        <button className="chat-shell-drawer-close" type="button" onClick={() => setActiveDrawer(null)}>
          关闭
        </button>
      </div>

      <div className="chat-shell-drawer-summary-grid">
        <div className="chat-shell-drawer-summary-card">
          <span>Changed Files</span>
          <strong>{artifactPaths.length}</strong>
        </div>
        <div className="chat-shell-drawer-summary-card">
          <span>Latest Summary</span>
          <strong>{latestActivityEntry?.summary || '暂无产物摘要'}</strong>
        </div>
      </div>

      <div className="chat-shell-artifact-list">
        {artifactPaths.length > 0 ? (
          artifactPaths.map((artifactPath) => (
            <article key={artifactPath} className="chat-shell-artifact-card">
              <strong>{artifactPath.split('/').pop() || artifactPath}</strong>
              <span>{artifactPath}</span>
            </article>
          ))
        ) : (
          <div className="chat-panel-note">还没有检测到可归档的文件变更。</div>
        )}
      </div>
    </div>
  ) : null;

  const agentLaneContent =
    activeAgentLane === 'chat' ? (
      <ClaudianMessageList
        messages={messages}
        draftContents={streamingDraftContents}
        formatTimestamp={formatTimestamp}
        parseMessageParts={parseAIChatMessageParts}
        renderMessagePart={renderMessagePart}
        messagesEndRef={messagesEndRef}
        leadingContent={launchpad}
      />
    ) : activeAgentLane === 'tasks' ? (
      <section className="chat-agent-panel chat-agent-task-panel" aria-label="GN Agent tasks">
        <div className="chat-agent-panel-header">
          <strong>Tasks</strong>
          <span>GN Agent 当前任务、能力链和运行状态。</span>
        </div>
        <div className="chat-agent-task-list">
          <article className={`chat-agent-task-card ${runStateTone}`}>
            <div>
              <strong>{isLoading ? '正在执行当前请求' : '等待你的下一条指令'}</strong>
              <span>{latestActivityEntry?.summary || '还没有新的执行记录。'}</span>
            </div>
            <span>{runStateLabel}</span>
          </article>
          <article className="chat-agent-task-card">
            <div>
              <strong>下一段能力链</strong>
              <span>
                {!workflowAvailability.hasRequirementsSpec || !workflowAvailability.hasFeatureTree
                  ? '需求分析'
                  : !workflowAvailability.hasPageStructure || !workflowAvailability.hasWireframes
                    ? '原型草图'
                    : 'UI 设计'}
              </span>
            </div>
            <span>Ready</span>
          </article>
        </div>
      </section>
    ) : activeAgentLane === 'artifacts' ? (
      <section className="chat-agent-panel chat-agent-artifact-panel" aria-label="GN Agent artifacts">
        <div className="chat-agent-panel-header">
          <strong>Artifacts</strong>
          <span>Agent 生成、更新或引用过的项目产物。</span>
        </div>
        <div className="chat-agent-artifact-list">
          {artifactPaths.length > 0 ? (
            artifactPaths.map((artifactPath) => (
              <article key={artifactPath} className="chat-agent-artifact-card">
                <strong>{artifactPath.split('/').pop() || artifactPath}</strong>
                <span>{artifactPath}</span>
              </article>
            ))
          ) : (
            <div className="chat-panel-note">还没有可展示的产物。执行 @整理、@需求、@草图 或 @UI 后会出现在这里。</div>
          )}
        </div>
      </section>
    ) : activeAgentLane === 'context' ? (
      <section className="chat-agent-panel chat-agent-context-panel" aria-label="GN Agent context">
        <div className="chat-agent-panel-header">
          <strong>Context</strong>
          <span>GN Agent 当前会读到的项目和上下文预算。</span>
        </div>
        <div className="chat-shell-drawer-summary-grid">
          <div className="chat-shell-drawer-summary-card">
            <span>Project</span>
            <strong>{currentProject?.name || '未打开项目'}</strong>
          </div>
          <div className="chat-shell-drawer-summary-card">
            <span>Budget</span>
            <strong>{currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}</strong>
          </div>
        </div>
        <div className="chat-context-strip">
          {contextSnapshot.primaryLabel ? <span className="chat-context-chip subtle">{contextSnapshot.primaryLabel}</span> : null}
          {contextSnapshot.secondaryLabel ? <span className="chat-context-chip subtle">{contextSnapshot.secondaryLabel}</span> : null}
          {contextSnapshot.knowledgeLabel ? <span className="chat-context-chip subtle">{contextSnapshot.knowledgeLabel}</span> : null}
          {!contextSnapshot.primaryLabel && !contextSnapshot.secondaryLabel && !contextSnapshot.knowledgeLabel ? (
            <span className="chat-context-chip subtle">当前没有额外上下文摘要</span>
          ) : null}
        </div>
      </section>
    ) : activeAgentLane === 'skills' ? (
      <section className="chat-agent-panel chat-agent-skills-panel" aria-label="GN Agent skills">
        <div className="chat-agent-panel-header">
          <strong>Skills</strong>
          <span>选择一个能力，GN Agent 会把对应指令放入输入区。</span>
        </div>
        <div className="chat-agent-capability-grid">
          {GN_AGENT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              className="chat-agent-capability-card"
              onClick={() => handleApplySuggestion(suggestion.prompt)}
            >
              <strong>{suggestion.label}</strong>
              <span>{suggestion.description}</span>
            </button>
          ))}
        </div>
      </section>
    ) : (
      <section className="chat-agent-panel chat-agent-activity-panel" aria-label="GN Agent activity">
        <div className="chat-agent-panel-header">
          <strong>Activity</strong>
          <span>记录 GN Agent 的真实执行、产物和失败节点。</span>
        </div>
        <div className="chat-activity-list">
          {activityEntries.length > 0 ? (
            activityEntries.map((entry) => (
              <article key={entry.id} className="chat-activity-entry">
                <div className="chat-activity-entry-head">
                  <strong>{entry.summary}</strong>
                  <span>{formatTimestamp(entry.createdAt)}</span>
                </div>
                <div className="chat-activity-entry-meta">
                  <span>{entry.type}</span>
                  {entry.skill ? <span>{entry.skill}</span> : null}
                  <span>{entry.runtime}</span>
                </div>
                {entry.changedPaths.length > 0 ? (
                  <div className="chat-activity-entry-paths">
                    {entry.changedPaths.map((changedPath) => (
                      <code key={changedPath}>{changedPath}</code>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="chat-panel-note">还没有执行记录。Agent 产生变更或运行能力链后会写入这里。</div>
          )}
        </div>
      </section>
    );
  useEffect(() => {
    if (selectedChatAgentId !== 'built-in' && !agentAvailability[selectedChatAgentId].ready) {
      setSelectedChatAgentId('built-in');
    }
  }, [agentAvailability, selectedChatAgentId]);

  return (
    <>
      {isSettingsOpen ? <div className="chat-settings-overlay" onClick={closeSettings} /> : null}

      <section
        className={`${getChatShellLayoutClassName(lockExpandedForEmbedded ? false : isCollapsed)}${isClaudianEmbedded ? ' chat-shell-embedded' : ''}`}
      >
        <header className={`chat-shell-header chat-shell-gn-header${isClaudianEmbedded ? ' embedded' : ''}`}>
          <div className="chat-shell-header-main">
            <div className="chat-shell-title">
              <span className="chat-shell-kicker">GN Agent</span>
              <strong>{isCollapsed && !lockExpandedForEmbedded ? 'GN' : activeSession?.title || '新对话'}</strong>
              {showExpandedShell ? <span>{currentProject?.name || '未打开项目'}</span> : null}
            </div>

            {showExpandedShell && !isGNAgentEmbedded ? (
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
                  <button
                    className={`chat-shell-drawer-toggle ${activeDrawer === 'context' ? 'active' : ''}`}
                    type="button"
                    aria-pressed={activeDrawer === 'context'}
                    aria-expanded={activeDrawer === 'context'}
                    onClick={() => toggleDrawer('context')}
                  >
                    <span>Context</span>
                    <strong>{currentContextUsage.usedLabel}</strong>
                  </button>
                  <button
                    className={`chat-shell-drawer-toggle ${activeDrawer === 'run' ? 'active' : ''}`}
                    type="button"
                    aria-pressed={activeDrawer === 'run'}
                    aria-expanded={activeDrawer === 'run'}
                    onClick={() => toggleDrawer('run')}
                  >
                    <span>Run</span>
                    <strong>{activityEntries.length}</strong>
                  </button>
                  <button
                    className={`chat-shell-drawer-toggle ${activeDrawer === 'artifacts' ? 'active' : ''}`}
                    type="button"
                    aria-pressed={activeDrawer === 'artifacts'}
                    aria-expanded={activeDrawer === 'artifacts'}
                    onClick={() => toggleDrawer('artifacts')}
                  >
                    <span>Artifacts</span>
                    <strong>{artifactPaths.length}</strong>
                  </button>
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

              {!isClaudianEmbedded ? (
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

          {showExpandedShell ? (
            <nav className="chat-agent-lane-tabs" aria-label="GN Agent capabilities">
              {GN_AGENT_LANES.map((lane) => (
                <button
                  key={lane.id}
                  type="button"
                  className={lane.id === activeAgentLane ? 'active' : ''}
                  aria-pressed={lane.id === activeAgentLane}
                  title={lane.description}
                  onClick={() => {
                    setActiveAgentLane(lane.id);
                    setActiveDrawer(null);
                  }}
                >
                  {lane.label}
                </button>
              ))}
            </nav>
          ) : null}

          {headerDrawerContent}
        </header>

          {showExpandedShell ? (
            <>
            {agentLaneContent}

            {isClaudianEmbedded ? (
                <>
                  <ClaudianEmbeddedComposer
                    entrySwitch={isGNAgentEmbedded ? null : <ClaudianModeSwitch compact />}
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
                      <div className="chat-composer-hints">
                        <span>Enter 发送</span>
                        <span>Shift + Enter 换行</span>
                        <span>用 @skill 精准触发能力</span>
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

      <section className={`chat-settings-drawer ${isSettingsOpen ? 'open' : ''}`}>
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
    </>
  );
};

