import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { buildAIConfigurationError, listModelsSupportMode } from '../../modules/ai/core/configStatus';
import { aiService, type AIProviderType } from '../../modules/ai/core/AIService';
import { buildContextIndex } from '../../modules/ai/chat/contextIndex';
import { buildDirectChatPrompt } from '../../modules/ai/chat/directChatPrompt';
import { buildContextUsageSummary } from '../../modules/ai/chat/contextBudget';
import {
  type AIReferenceScopeMode,
  buildChatContextSnapshot,
  collectDesignPages,
  getSelectedElementLabel,
  resolveReferenceScopeSelection,
  resolveKnowledgeSelectionForPrompt,
} from '../../modules/ai/chat/chatContext';
import { buildReferencePromptContext } from '../../modules/ai/chat/referencePromptContext';
import { PROVIDER_PRESETS, type ProviderPreset } from '../../modules/ai/providerPresets';
import { type AIConfigEntry, hasUsableAIConfigEntry } from '../../modules/ai/store/aiConfigState';
import {
  createChatSession,
  createStoredChatMessage,
  useAIChatStore,
} from '../../modules/ai/store/aiChatStore';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { AVAILABLE_CHAT_SKILLS, resolveSkillIntent } from '../../modules/ai/workflow/skillRouting';
import { buildKnowledgeEntries } from '../../modules/knowledge/knowledgeEntries';
import {
  buildReferenceFiles,
  buildSketchReferencePath,
  type DesignStyleReferenceNode,
} from '../../modules/knowledge/referenceFiles';
import { useProjectStore } from '../../store/projectStore';
import { usePreviewStore } from '../../store/previewStore';
import { loadDesignBoardStateFromDisk, saveContextIndexToDisk } from '../../utils/projectPersistence';
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

  return normalized.length > 18 ? `${normalized.slice(0, 18)}…` : normalized;
};

const buildSessionPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 32 ? `${normalized.slice(0, 32)}…` : normalized;
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

const getDirectoryPath = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex) : '';
};

const normalizeDesignStyleNode = (value: unknown): DesignStyleReferenceNode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const node = value as Partial<DesignStyleReferenceNode>;
  if (typeof node.id !== 'string' || typeof node.title !== 'string') {
    return null;
  }

  return {
    id: node.id,
    title: node.title,
    summary: typeof node.summary === 'string' ? node.summary : '',
    keywords: Array.isArray(node.keywords)
      ? node.keywords.filter((item): item is string => typeof item === 'string')
      : [],
    palette: Array.isArray(node.palette)
      ? node.palette.filter((item): item is string => typeof item === 'string')
      : [],
    prompt: typeof node.prompt === 'string' ? node.prompt : '',
    filePath: typeof (node as { styleFilePath?: unknown }).styleFilePath === 'string'
      ? (node as { styleFilePath?: string }).styleFilePath
      : typeof (node as { filePath?: unknown }).filePath === 'string'
        ? (node as { filePath?: string }).filePath
        : undefined,
  };
};

const PlusIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M10 4V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const HistoryIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M3.5 10A6.5 6.5 0 1 0 5.4 5.36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3.5 4.75V7.75H6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M10 6.7V10L12.55 11.55" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const SparkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M10 2.8L11.9 7.2L16.3 9.1L11.9 11L10 15.4L8.1 11L3.7 9.1L8.1 7.2L10 2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M6.2 3.5H11.2L14.8 7.1V15.2C14.8 15.92 14.22 16.5 13.5 16.5H6.5C5.78 16.5 5.2 15.92 5.2 15.2V4.5C5.2 3.95 5.65 3.5 6.2 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M11 3.75V7H14.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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
      <div className="chat-thinking-pill" key={`${messageId}-thinking-${index}`}>
        <span className="chat-thinking-pulse" aria-hidden="true" />
        <span>Thinking</span>
        <span className="chat-thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
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

export const AIChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [showReferenceMenu, setShowReferenceMenu] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({});
  const [selectedSettingsConfigId, setSelectedSettingsConfigId] = useState<string | null>(null);
  const [isKnowledgeReferenceEnabled] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState<AISettingsDraft>(buildSettingsDraft(null));
  const [persistedDesignStyleNodes, setPersistedDesignStyleNodes] = useState<DesignStyleReferenceNode[]>([]);
  const [referencePickerValue, setReferencePickerValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    aiConfigs,
    selectedConfigId,
    isConfigured,
    addConfig,
    updateConfig,
    setConfigEnabled,
  } = useGlobalAIStore(
    useShallow((state) => ({
      aiConfigs: state.aiConfigs,
      selectedConfigId: state.selectedConfigId,
      isConfigured: state.isConfigured,
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
      setRawRequirementInput: state.setRawRequirementInput,
    }))
  );
  const previewElements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const aiContextState = useAIContextStore((state) =>
    currentProject ? state.projects[currentProject.id] : undefined
  );
  const {
    setSelectedReferenceFileIds,
    setSelectedReferenceDirectory,
    setReferenceScopeMode,
  } = useAIContextStore(
    useShallow((state) => ({
      setSelectedReferenceFileIds: state.setSelectedReferenceFileIds,
      setSelectedReferenceDirectory: state.setSelectedReferenceDirectory,
      setReferenceScopeMode: state.setReferenceScopeMode,
    }))
  );

  const projectChatState = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id] : undefined
  );
  const {
    ensureProjectState,
    upsertSession,
    setActiveSession,
    appendMessage,
    updateMessage,
    renameSession,
  } = useAIChatStore(
    useShallow((state) => ({
      ensureProjectState: state.ensureProjectState,
      upsertSession: state.upsertSession,
      setActiveSession: state.setActiveSession,
      appendMessage: state.appendMessage,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

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
    () => aiConfigs.find((item) => item.id === selectedConfigId) || null,
    [aiConfigs, selectedConfigId]
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

  const knowledgeEntries = useMemo(
    () => buildKnowledgeEntries(requirementDocs, generatedFiles),
    [generatedFiles, requirementDocs]
  );

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedReferenceFileIds = aiContextState?.selectedReferenceFileIds || [];
  const selectedReferenceDirectory = aiContextState?.selectedReferenceDirectory || null;
  const referenceScopeMode = aiContextState?.referenceScopeMode || 'current';
  const buildReferenceFileSnapshot = useCallback(
    (styleNodes: DesignStyleReferenceNode[] = persistedDesignStyleNodes) =>
      buildReferenceFiles({
        requirementDocs,
        generatedFiles,
        designPages,
        wireframes,
        designStyleNodes: styleNodes,
      }),
    [designPages, generatedFiles, persistedDesignStyleNodes, requirementDocs, wireframes]
  );
  const referenceFiles = useMemo(() => buildReferenceFileSnapshot(), [buildReferenceFileSnapshot]);
  const availableReferenceDirectories = useMemo(
    () =>
      Array.from(new Set(referenceFiles.map((file) => getDirectoryPath(file.path)).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [referenceFiles]
  );
  const selectedPage = useMemo(
    () => designPages.find((page) => page.id === aiContextState?.selectedPageId) || null,
    [aiContextState?.selectedPageId, designPages]
  );
  const selectedElementLabel = useMemo(
    () => getSelectedElementLabel(previewElements, selectedElementId),
    [previewElements, selectedElementId]
  );
  const currentReferenceFileIds = useMemo(() => {
    const ids = new Set<string>();
    if (isKnowledgeReferenceEnabled) {
      if (activeKnowledgeFileId) {
        ids.add(activeKnowledgeFileId);
      }
      selectedKnowledgeContextIds.forEach((id) => ids.add(id));
    }

    if (selectedPage) {
      ids.add(buildSketchReferencePath(selectedPage));
    }

    return Array.from(ids).filter((id) => referenceFiles.some((file) => file.id === id));
  }, [
    activeKnowledgeFileId,
    isKnowledgeReferenceEnabled,
    referenceFiles,
    selectedKnowledgeContextIds,
    selectedPage,
  ]);
  const selectedReferenceFiles = useMemo(
    () =>
      selectedReferenceFileIds
        .map((id) => referenceFiles.find((file) => file.id === id) || null)
        .filter((file): file is (typeof referenceFiles)[number] => Boolean(file)),
    [referenceFiles, selectedReferenceFileIds]
  );
  const referencePromptContext = useMemo(
    () =>
      buildReferencePromptContext({
        userInput: input.trim(),
        selectedFiles: selectedReferenceFiles,
      }),
    [input, selectedReferenceFiles]
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
  const effectiveKnowledgeSelection = selectedReferenceFiles.length > 0
    ? {
        currentFile: null,
        relatedFiles: [],
      }
    : knowledgeSelectionMeta;
  const contextSnapshot = useMemo(
    () =>
      buildChatContextSnapshot({
        scene: aiContextState?.scene || 'knowledge',
        pageTitle: selectedPage?.name || null,
        selectedElementLabel,
        knowledgeLabel: displayKnowledgeFile && isKnowledgeReferenceEnabled
          ? `知识文档 / ${displayKnowledgeFile.title}`
          : null,
      }),
    [aiContextState?.scene, displayKnowledgeFile, isKnowledgeReferenceEnabled, selectedElementLabel, selectedPage?.name]
  );

  const currentContextUsage = useMemo(() => {
    const previewPrompt = buildDirectChatPrompt({
      userInput: input.trim() || '继续当前对话',
      currentProjectName: currentProject?.name,
      contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
      skillIntent: null,
      knowledgeSelection: effectiveKnowledgeSelection,
      referenceContext: referencePromptContext.labels.length > 0 ? referencePromptContext : null,
      contextLabels: [
        selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
        contextSnapshot.primaryLabel,
        contextSnapshot.secondaryLabel,
        contextSnapshot.knowledgeLabel,
        ...referencePromptContext.labels,
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
    effectiveKnowledgeSelection,
    referencePromptContext,
    selectedRuntimeConfig,
  ]);

  useEffect(() => {
    if (!currentProject) {
      setPersistedDesignStyleNodes([]);
      return;
    }

    let cancelled = false;
    void loadDesignBoardStateFromDisk(currentProject.id)
      .then((persisted) => {
        if (cancelled) {
          return;
        }

        const nextStyleNodes = Array.isArray(persisted?.styleNodes)
          ? persisted.styleNodes
              .map((node) => normalizeDesignStyleNode(node))
              .filter((node): node is DesignStyleReferenceNode => Boolean(node))
          : [];
        setPersistedDesignStyleNodes(nextStyleNodes);
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedDesignStyleNodes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentProject]);

  useEffect(() => {
    if (!currentProject || aiContextState) {
      return;
    }

    if (currentReferenceFileIds.length > 0) {
      setSelectedReferenceFileIds(currentProject.id, currentReferenceFileIds);
    }
  }, [aiContextState, currentProject, currentReferenceFileIds, setSelectedReferenceFileIds]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    const nextIds =
      referenceScopeMode === 'all'
        ? resolveReferenceScopeSelection({
            mode: 'all',
            currentFileIds: selectedReferenceFileIds,
            directoryPath: selectedReferenceDirectory,
            allFiles: referenceFiles,
          })
        : referenceScopeMode === 'directory'
          ? resolveReferenceScopeSelection({
              mode: 'directory',
              currentFileIds: selectedReferenceFileIds,
              directoryPath: selectedReferenceDirectory,
              allFiles: referenceFiles,
            })
          : selectedReferenceFileIds.filter((id) => referenceFiles.some((file) => file.id === id));

    const hasChanged =
      nextIds.length !== selectedReferenceFileIds.length ||
      nextIds.some((id, index) => id !== selectedReferenceFileIds[index]);

    if (hasChanged) {
      setSelectedReferenceFileIds(currentProject.id, nextIds);
    }
  }, [
    currentProject,
    referenceFiles,
    referenceScopeMode,
    selectedReferenceDirectory,
    selectedReferenceFileIds,
    setSelectedReferenceFileIds,
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

  const refreshPersistedReferenceAssets = useCallback(async () => {
    if (!currentProject) {
      return persistedDesignStyleNodes;
    }

    const persisted = await loadDesignBoardStateFromDisk(currentProject.id).catch(() => null);
    const nextStyleNodes = Array.isArray(persisted?.styleNodes)
      ? persisted.styleNodes
          .map((node) => normalizeDesignStyleNode(node))
          .filter((node): node is DesignStyleReferenceNode => Boolean(node))
      : [];
    setPersistedDesignStyleNodes(nextStyleNodes);
    return nextStyleNodes;
  }, [currentProject, persistedDesignStyleNodes]);

  const handleRebuildContextIndex = useCallback(async () => {
    if (!currentProject) {
      return null;
    }

    const latestStyleNodes = await refreshPersistedReferenceAssets();
    const nextReferenceFiles = buildReferenceFileSnapshot(latestStyleNodes);
    const index = buildContextIndex(nextReferenceFiles);
    await saveContextIndexToDisk(currentProject.id, index);
    return { index, referenceFiles: nextReferenceFiles };
  }, [buildReferenceFileSnapshot, currentProject, refreshPersistedReferenceAssets]);

  const handleApplyReferenceScope = useCallback(
    (mode: AIReferenceScopeMode) => {
      if (!currentProject) {
        return;
      }

      let directoryPath = selectedReferenceDirectory;
      if (mode === 'directory' && !directoryPath) {
        const fallbackFile =
          referenceFiles.find((file) => currentReferenceFileIds.includes(file.id)) || referenceFiles[0] || null;
        directoryPath = fallbackFile ? getDirectoryPath(fallbackFile.path) : availableReferenceDirectories[0] || null;
      }

      const nextIds = resolveReferenceScopeSelection({
        mode,
        currentFileIds: currentReferenceFileIds,
        directoryPath,
        allFiles: referenceFiles,
      });

      setReferenceScopeMode(currentProject.id, mode);
      setSelectedReferenceDirectory(currentProject.id, directoryPath);
      setSelectedReferenceFileIds(currentProject.id, nextIds);
    },
    [
      availableReferenceDirectories,
      currentProject,
      currentReferenceFileIds,
      referenceFiles,
      selectedReferenceDirectory,
      setReferenceScopeMode,
      setSelectedReferenceDirectory,
      setSelectedReferenceFileIds,
    ]
  );

  const handleReferenceDirectoryChange = useCallback(
    (directoryPath: string) => {
      if (!currentProject) {
        return;
      }

      const nextIds = resolveReferenceScopeSelection({
        mode: 'directory',
        currentFileIds: currentReferenceFileIds,
        directoryPath,
        allFiles: referenceFiles,
      });

      setReferenceScopeMode(currentProject.id, 'directory');
      setSelectedReferenceDirectory(currentProject.id, directoryPath || null);
      setSelectedReferenceFileIds(currentProject.id, nextIds);
    },
    [
      currentProject,
      currentReferenceFileIds,
      referenceFiles,
      setReferenceScopeMode,
      setSelectedReferenceDirectory,
      setSelectedReferenceFileIds,
    ]
  );

  const handleAddReferenceFile = useCallback(
    (fileId: string) => {
      if (!currentProject || !fileId) {
        return;
      }

      setReferenceScopeMode(currentProject.id, 'current');
      setSelectedReferenceFileIds(currentProject.id, [...selectedReferenceFileIds, fileId]);
      setReferencePickerValue('');
    },
    [currentProject, selectedReferenceFileIds, setReferenceScopeMode, setSelectedReferenceFileIds]
  );

  const handleRemoveReferenceFile = useCallback(
    (fileId: string) => {
      if (!currentProject) {
        return;
      }

      setReferenceScopeMode(currentProject.id, 'current');
      setSelectedReferenceFileIds(
        currentProject.id,
        selectedReferenceFileIds.filter((id) => id !== fileId)
      );
    },
    [currentProject, selectedReferenceFileIds, setReferenceScopeMode, setSelectedReferenceFileIds]
  );

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
    setShowSkillMenu(false);
    setShowReferenceMenu(false);
  }, [currentProject, setActiveSession, upsertSession]);

  const insertSkillToken = useCallback((token: string) => {
    setShowSkillMenu(false);
    setInput((current) => {
      if (current.includes(token)) {
        return current;
      }

      const textarea = textareaRef.current;
      if (!textarea) {
        return current ? `${token} ${current}` : `${token} `;
      }

      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? current.length;
      const next = `${current.slice(0, start)}${token} ${current.slice(end)}`;
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + token.length + 1;
        textarea.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!input.trim() || isLoading || !currentProject) {
        return;
      }

      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const session = createWelcomeSession(currentProject.id, currentProject.name);
        upsertSession(currentProject.id, session);
        setActiveSession(currentProject.id, session.id);
        targetSessionId = session.id;
      }

      const rawContent = input.trim();
      const requestedReindex = rawContent.includes('@整理');
      const skillIntent = resolveSkillIntent(rawContent);
      const cleanedContent = skillIntent?.cleanedInput.trim() ? skillIntent.cleanedInput.trim() : rawContent;
      const userMessage = createStoredChatMessage('user', rawContent);

      setInput('');
      appendMessage(currentProject.id, targetSessionId, userMessage);

      if (!activeSession || activeSession.title === '新对话') {
        renameSession(currentProject.id, targetSessionId, summarizeSessionTitle(rawContent));
      }

      if (!isConfigured) {
        appendMessage(
          currentProject.id,
          targetSessionId,
          createStoredChatMessage('system', normalizeErrorMessage(buildAIConfigurationError()), 'error')
        );
        return;
      }

      const assistantMessage = createStoredChatMessage('assistant', '正在思考…');
      appendMessage(currentProject.id, targetSessionId, assistantMessage);
      setIsLoading(true);

      let promptReferenceFiles = referenceFiles;
      try {
        try {
          const rebuilt = await handleRebuildContextIndex();
          if (rebuilt?.referenceFiles) {
            promptReferenceFiles = rebuilt.referenceFiles;
          }
        } catch (error) {
          if (requestedReindex && rawContent.replace(/@整理/g, '').trim().length === 0) {
            throw error;
          }
        }

        if (requestedReindex && rawContent.replace(/@整理/g, '').trim().length === 0) {
          updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            role: 'system',
            content: `已整理上下文索引，共 ${buildContextIndex(promptReferenceFiles).files.length} 个可读文件。`,
          }));
          return;
        }

        const promptSelectedReferenceFiles = promptReferenceFiles.filter((file) =>
          selectedReferenceFileIds.includes(file.id)
        );
        const promptReferenceContext = buildReferencePromptContext({
          userInput: cleanedContent,
          selectedFiles: promptSelectedReferenceFiles,
        });
        const directChat = buildDirectChatPrompt({
          userInput: cleanedContent,
          currentProjectName: currentProject.name,
          contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
          skillIntent,
          knowledgeSelection: promptSelectedReferenceFiles.length > 0
            ? {
                currentFile: null,
                relatedFiles: [],
              }
            : knowledgeSelectionMeta,
          referenceContext: promptReferenceContext.labels.length > 0 ? promptReferenceContext : null,
          contextLabels: [
            selectedRuntimeConfig ? `当前 AI / ${selectedRuntimeConfig.name}` : null,
            contextSnapshot.primaryLabel,
            contextSnapshot.secondaryLabel,
            contextSnapshot.knowledgeLabel,
            ...promptReferenceContext.labels,
          ].filter((item): item is string => Boolean(item)),
        });

        if (skillIntent?.skill === 'requirements') {
          setRawRequirementInput(cleanedContent);
        }

        const chunks: string[] = [];
        const response = await aiService.completeText({
          systemPrompt: directChat.systemPrompt,
          prompt: directChat.prompt,
          onChunk: (text) => {
            chunks.push(text);
            updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: chunks.join('').trim() || '正在思考…',
            }));
          },
        });

        const finalContent = response.trim() || chunks.join('').trim() || '已收到，但这次没有返回内容。';
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
          ...message,
          content: finalContent,
        }));
      } catch (error) {
        const message = normalizeErrorMessage(error);
        updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (currentMessage) => ({
          ...currentMessage,
          role: 'system',
          tone: 'error',
          content: message,
        }));
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSession,
      activeSessionId,
      appendMessage,
      contextSnapshot.knowledgeLabel,
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      currentProject,
      handleRebuildContextIndex,
      input,
      isConfigured,
      isLoading,
      knowledgeSelectionMeta,
      referenceFiles,
      selectedReferenceFileIds,
      selectedRuntimeConfig,
      renameSession,
      setActiveSession,
      setRawRequirementInput,
      updateMessage,
      upsertSession,
    ]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <>
      {isSettingsOpen ? <div className="chat-settings-overlay" onClick={closeSettings} /> : null}

      <section className={getChatShellLayoutClassName(isCollapsed)}>
        <header className="chat-shell-header">
          <div className="chat-shell-title">
            <strong>{isCollapsed ? 'AI' : 'AI 对话'}</strong>
            {!isCollapsed ? <span>{activeSession?.title || currentProject?.name || '新对话'}</span> : null}
          </div>
          <div className="chat-shell-header-actions">
            {!isCollapsed ? (
              <>
                <div className="chat-header-menu">
                  <button
                    className="chat-shell-icon-btn"
                    type="button"
                    aria-label="\u5386\u53f2\u4f1a\u8bdd"
                    title="\u5386\u53f2\u4f1a\u8bdd"
                    onClick={() => {
                      setShowHistoryMenu((current) => !current);
                      setShowSkillMenu(false);
                      setShowReferenceMenu(false);
                    }}
                  >
                    <HistoryIcon />
                  </button>
                  {showHistoryMenu ? (
                    <div className="chat-history-menu">
                      <button className="chat-history-new-btn" type="button" onClick={handleCreateSession}>
                        {'\u65b0\u5efa\u5bf9\u8bdd'}
                      </button>
                      <div className="chat-history-menu-list">
                        {sessions.map((session) => {
                          const lastMessage = session.messages[session.messages.length - 1];
                          return (
                            <button
                              key={session.id}
                              type="button"
                              className={`chat-history-item ${session.id === activeSessionId ? 'active' : ''}`}
                              onClick={() => {
                                if (!currentProject) {
                                  return;
                                }

                                setActiveSession(currentProject.id, session.id);
                                setShowHistoryMenu(false);
                              }}
                            >
                              <strong>{session.title}</strong>
                              <span>{lastMessage ? buildSessionPreview(lastMessage.content) : '\u7a7a\u4f1a\u8bdd'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
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
            <button
              className="chat-shell-icon-btn"
              type="button"
              aria-label={isCollapsed ? '\u5c55\u5f00\u804a\u5929\u680f' : '\u6536\u8d77\u804a\u5929\u680f'}
              title={isCollapsed ? '\u5c55\u5f00\u804a\u5929\u680f' : '\u6536\u8d77\u804a\u5929\u680f'}
              onClick={() => setIsCollapsed((current) => !current)}
            >
              <CollapseIcon collapsed={isCollapsed} />
            </button>
          </div>
        </header>

        {!isCollapsed ? (
          <>
            <div className="chat-message-list">
              {messages.map((message) => {
                const parts = parseAIChatMessageParts(message.content);
                return (
                  <article key={message.id} className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
                    <div className="chat-message-bubble">
                      <div className="chat-message-content">
                        {parts.map((part, index) => renderMessagePart(message.id, part, index))}
                      </div>
                      <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
                    </div>
                  </article>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <div className="chat-composer-shell">
                {showSkillMenu ? (
                  <div className="chat-skill-menu">
                    {AVAILABLE_CHAT_SKILLS.map((skill) => (
                      <button key={skill.token} type="button" onClick={() => insertSkillToken(skill.token)}>
                        <strong>{skill.token}</strong>
                        <span>{skill.package}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {showReferenceMenu ? (
                  <div className="chat-reference-menu">
                    <button
                      type="button"
                      className={`chat-reference-menu-action ${referenceScopeMode === 'current' ? 'active' : ''}`}
                      onClick={() => handleApplyReferenceScope('current')}
                      disabled={referenceFiles.length === 0}
                    >
                      {'\u5f15\u7528\u5f53\u524d'}
                    </button>
                    <button
                      type="button"
                      className={`chat-reference-menu-action ${referenceScopeMode === 'directory' ? 'active' : ''}`}
                      onClick={() => handleApplyReferenceScope('directory')}
                      disabled={referenceFiles.length === 0}
                    >
                      {'\u5f15\u7528\u76ee\u5f55'}
                    </button>
                    <button
                      type="button"
                      className={`chat-reference-menu-action ${referenceScopeMode === 'all' ? 'active' : ''}`}
                      onClick={() => handleApplyReferenceScope('all')}
                      disabled={referenceFiles.length === 0}
                    >
                      {'\u5f15\u7528\u5168\u90e8'}
                    </button>
                    <button
                      type="button"
                      className="chat-reference-menu-action"
                      onClick={() => void handleRebuildContextIndex()}
                      disabled={!currentProject}
                    >
                      {'\u6574\u7406\u7d22\u5f15'}
                    </button>
                    <label className="chat-reference-menu-select">
                      <span>{'\u76ee\u5f55'}</span>
                      <select
                        value={selectedReferenceDirectory || ''}
                        onChange={(event) => handleReferenceDirectoryChange(event.target.value)}
                        disabled={availableReferenceDirectories.length === 0}
                      >
                        <option value="">{'\u9009\u62e9\u76ee\u5f55'}</option>
                        {availableReferenceDirectories.map((directory) => (
                          <option key={directory} value={directory}>
                            {directory}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="chat-reference-menu-select">
                      <span>{'\u6587\u4ef6'}</span>
                      <select
                        value={referencePickerValue}
                        onChange={(event) => {
                          setReferencePickerValue(event.target.value);
                          handleAddReferenceFile(event.target.value);
                        }}
                        disabled={referenceFiles.length === 0}
                      >
                        <option value="">{'\u6dfb\u52a0\u6587\u4ef6'}</option>
                        {referenceFiles.map((file) => (
                          <option key={file.id} value={file.id}>
                            {`${file.title} / ${file.path}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {selectedReferenceFiles.length > 0 ? (
                  <div className="chat-selected-reference-chips">
                    {selectedReferenceFiles.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="chat-reference-chip compact"
                        onClick={() => handleRemoveReferenceFile(file.id)}
                        title={file.path}
                      >
                        <FileIcon />
                        <span>{file.title}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="chat-composer-main">
                  <button
                    type="button"
                    className="chat-composer-plus-btn"
                    aria-label="\u4e0a\u4e0b\u6587\u4e0e\u5f15\u7528"
                    title="\u4e0a\u4e0b\u6587\u4e0e\u5f15\u7528"
                    onClick={() => {
                      setShowReferenceMenu((current) => !current);
                      setShowSkillMenu(false);
                      setShowHistoryMenu(false);
                    }}
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    className="chat-composer-icon-btn"
                    aria-label={'Skill \u83dc\u5355'}
                    title={'Skill \u83dc\u5355'}
                    onClick={() => {
                      setShowSkillMenu((current) => !current);
                      setShowReferenceMenu(false);
                      setShowHistoryMenu(false);
                    }}
                  >
                    <SparkIcon />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={getComposerPlaceholder(isConfigured)}
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
              </div>
            </form>
          </>
        ) : (
          <div className="chat-collapsed-state">
            <span>聊天栏已收起</span>
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
                  placeholder='{"HTTP-Referer":"https://your-app.com","X-Title":"DevFlow"}'
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
