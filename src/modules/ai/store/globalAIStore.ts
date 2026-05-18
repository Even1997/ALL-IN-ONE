// 文件作用：维护全局 AI 配置、当前运行时配置投影和请求历史。
// 所在链路：设置页 / store -> AIService。
// 排查入口：先看 buildRuntimeState / applyRuntimeConfig，再看 updateConfig 和 rehydrate。

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  aiService,
  AIAction,
  AIConfig,
  AIProviderType,
  AIRequest,
  AIResponse,
  AIModule,
  CodeBlock,
  AISuggestion,
} from '../core/AIService';
import { AIStreamChunk } from '../../../types';
import {
  buildDefaultAIConfigEntries,
  createAIConfigEntry,
  hasUsableAIConfigEntry,
  mergePresetAIConfigEntries,
  normalizeAIProtocol,
  normalizeSavedModels,
  resolveSelectedAIConfigId,
  type AIConfigEntry,
  type AIProtocolType,
} from './aiConfigState';

interface GlobalAIState {
  aiConfigs: AIConfigEntry[];
  selectedConfigId: string | null;

  provider: AIProviderType;
  protocol: AIProtocolType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders: string;
  isConfigured: boolean;

  currentRequestId: string | null;
  isStreaming: boolean;
  error: string | null;

  requestHistory: AIRequestRecord[];
  codeBlocks: CodeBlock[];
  suggestions: AISuggestion[];

  isPanelOpen: boolean;
  panelPosition: 'right' | 'bottom';

  setProvider: (provider: AIProviderType) => void;
  setProtocol: (protocol: AIProtocolType) => void;
  setApiKey: (key: string) => void;
  setBaseURL: (baseURL: string) => void;
  setModel: (model: string) => void;
  setCustomHeaders: (headers: string) => void;
  addConfig: (seed?: Partial<AIConfigEntry>) => string;
  updateConfig: (configId: string, updates: Partial<Omit<AIConfigEntry, 'id'>>) => void;
  setConfigEnabled: (configId: string, enabled: boolean) => boolean;
  deleteConfig: (configId: string) => void;
  selectConfig: (configId: string | null) => void;
  applyConfiguration: (config: Partial<Pick<AIConfig, 'provider' | 'protocol' | 'apiKey' | 'baseURL' | 'model' | 'contextWindowTokens' | 'customHeaders'>>) => void;

  generateForModule: (
    module: AIModule,
    action: AIAction,
    scope: AIRequest['scope'],
    prompt: string,
    context?: AIRequest['context']
  ) => Promise<string>;

  interrupt: () => void;
  togglePanel: () => void;
  setPanelPosition: (position: 'right' | 'bottom') => void;
  clearHistory: () => void;
  getHistory: () => AIRequestRecord[];
}

interface AIRequestRecord {
  id: string;
  timestamp: Date;
  module: AIModule;
  action: AIAction;
  prompt: string;
  status: 'completed' | 'error' | 'interrupted';
  codeBlocks: CodeBlock[];
  responseContent: string;
}

export type { GlobalAIState, AIRequestRecord };

type PersistedGlobalAIState = Pick<
  GlobalAIState,
  | 'aiConfigs'
  | 'selectedConfigId'
  | 'provider'
  | 'protocol'
  | 'apiKey'
  | 'baseURL'
  | 'model'
  | 'contextWindowTokens'
  | 'customHeaders'
  | 'isConfigured'
  | 'isPanelOpen'
  | 'panelPosition'
>;

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_RUNTIME_STATE = {
  provider: 'openai-compatible' as AIProviderType,
  protocol: 'openai-chat-completions' as AIProtocolType,
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  model: '',
  contextWindowTokens: 258000,
  customHeaders: '',
  isConfigured: false,
};

const buildLegacyConfigEntry = (state: {
  provider: AIProviderType;
  protocol?: AIProtocolType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens?: number;
  customHeaders: string;
}): AIConfigEntry =>
  createAIConfigEntry({
    id: 'legacy-default',
    name: '榛樿 AI',
    provider: state.provider,
    protocol: normalizeAIProtocol(state.provider, state.protocol),
    apiKey: state.apiKey,
    baseURL: state.baseURL || DEFAULT_BASE_URL,
    model: state.model,
    contextWindowTokens: state.contextWindowTokens,
    customHeaders: state.customHeaders,
    enabled: hasUsableAIConfigEntry(state),
  });

const getConfigById = (configs: AIConfigEntry[], configId: string | null) =>
  configId ? configs.find((item) => item.id === configId) || null : null;

const buildRuntimeState = (selectedConfig: AIConfigEntry | null) => {
  if (!selectedConfig || !selectedConfig.enabled || !hasUsableAIConfigEntry(selectedConfig)) {
    return DEFAULT_RUNTIME_STATE;
  }

  return {
    provider: selectedConfig.provider,
    protocol: selectedConfig.protocol,
    apiKey: selectedConfig.apiKey,
    baseURL: selectedConfig.baseURL,
    model: selectedConfig.model,
    contextWindowTokens: selectedConfig.contextWindowTokens,
    customHeaders: selectedConfig.customHeaders,
    isConfigured: true,
  };
};

const syncStateFromConfigs = (configs: AIConfigEntry[], previousSelectedId: string | null) => {
  const selectedConfigId = resolveSelectedAIConfigId(configs, previousSelectedId);
  return {
    aiConfigs: configs,
    selectedConfigId,
    ...buildRuntimeState(getConfigById(configs, selectedConfigId)),
  };
};

const applyRuntimeConfig = (state: Pick<GlobalAIState, 'provider' | 'protocol' | 'apiKey' | 'baseURL' | 'model' | 'contextWindowTokens' | 'customHeaders'>) => {
  aiService.setConfig({
    provider: state.provider,
    protocol: state.protocol,
    apiKey: state.apiKey,
    baseURL: state.baseURL,
    model: state.model,
    contextWindowTokens: state.contextWindowTokens,
    customHeaders: state.customHeaders,
  });
};

const buildPersistedGlobalAIState = (state: GlobalAIState): PersistedGlobalAIState => ({
  aiConfigs: state.aiConfigs,
  selectedConfigId: state.selectedConfigId,
  provider: state.provider,
  protocol: state.protocol,
  apiKey: state.apiKey,
  baseURL: state.baseURL,
  model: state.model,
  contextWindowTokens: state.contextWindowTokens,
  customHeaders: state.customHeaders,
  isConfigured: state.isConfigured,
  isPanelOpen: state.isPanelOpen,
  panelPosition: state.panelPosition,
});

export const useGlobalAIStore = create<GlobalAIState>()(
  persist(
    (set, get) => ({
      aiConfigs: buildDefaultAIConfigEntries(),
      selectedConfigId: null,
      provider: DEFAULT_RUNTIME_STATE.provider,
      protocol: DEFAULT_RUNTIME_STATE.protocol,
      apiKey: DEFAULT_RUNTIME_STATE.apiKey,
      baseURL: DEFAULT_RUNTIME_STATE.baseURL,
      model: DEFAULT_RUNTIME_STATE.model,
      contextWindowTokens: DEFAULT_RUNTIME_STATE.contextWindowTokens,
      customHeaders: DEFAULT_RUNTIME_STATE.customHeaders,
      isConfigured: DEFAULT_RUNTIME_STATE.isConfigured,
      currentRequestId: null,
      isStreaming: false,
      error: null,
      requestHistory: [],
      codeBlocks: [],
      suggestions: [],
      isPanelOpen: false,
      panelPosition: 'right',

      setProvider: (provider) => {
        const state = get();
        const protocol = normalizeAIProtocol(provider, state.protocol);
        if (state.selectedConfigId) {
          state.updateConfig(state.selectedConfigId, { provider, protocol });
          return;
        }

        aiService.setConfig({ provider, protocol });
        set({ provider, protocol, isConfigured: Boolean(state.apiKey.trim() && state.model.trim()) });
      },

      setProtocol: (protocol) => {
        const state = get();
        const normalizedProtocol = normalizeAIProtocol(state.provider, protocol);
        if (state.selectedConfigId) {
          state.updateConfig(state.selectedConfigId, { protocol: normalizedProtocol });
          return;
        }

        aiService.setConfig({ protocol: normalizedProtocol });
        set({ protocol: normalizedProtocol });
      },

      setApiKey: (apiKey) => {
        const { selectedConfigId } = get();
        if (selectedConfigId) {
          get().updateConfig(selectedConfigId, { apiKey });
          return;
        }

        aiService.setConfig({ apiKey });
        set({ apiKey, isConfigured: Boolean(apiKey.trim() && get().model.trim()) });
      },

      setBaseURL: (baseURL) => {
        const { selectedConfigId } = get();
        if (selectedConfigId) {
          get().updateConfig(selectedConfigId, { baseURL });
          return;
        }

        aiService.setConfig({ baseURL });
        set({ baseURL });
      },

      setModel: (model) => {
        const { selectedConfigId } = get();
        if (selectedConfigId) {
          get().updateConfig(selectedConfigId, { model });
          return;
        }

        aiService.setConfig({ model });
        set({ model, isConfigured: Boolean(get().apiKey.trim() && model.trim()) });
      },

      setCustomHeaders: (customHeaders) => {
        const { selectedConfigId } = get();
        if (selectedConfigId) {
          get().updateConfig(selectedConfigId, { customHeaders });
          return;
        }

        aiService.setConfig({ customHeaders });
        set({ customHeaders });
      },

      addConfig: (seed) => {
        const nextConfig = createAIConfigEntry({
          name: `AI 閰嶇疆 ${get().aiConfigs.length + 1}`,
          ...seed,
        });
        set((state) => ({
          aiConfigs: [...state.aiConfigs, nextConfig],
        }));
        return nextConfig.id;
      },

      updateConfig: (configId, updates) => {
        const state = get();
        const nextConfigs = state.aiConfigs.map((item) =>
          item.id === configId
            ? createAIConfigEntry({
                ...item,
                ...updates,
                provider: typeof updates.provider === 'string' ? updates.provider : item.provider,
                protocol: normalizeAIProtocol(
                  typeof updates.provider === 'string' ? updates.provider : item.provider,
                  'protocol' in updates ? updates.protocol : item.protocol,
                ),
                name: typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : item.name,
                savedModels: normalizeSavedModels(
                  'savedModels' in updates ? updates.savedModels : item.savedModels,
                  typeof updates.model === 'string' ? updates.model : item.model,
                ),
              })
            : item,
        );
        const nextState = syncStateFromConfigs(nextConfigs, state.selectedConfigId);
        applyRuntimeConfig(nextState);
        set(nextState);
      },

      deleteConfig: (configId) => {
        const state = get();
        const nextConfigs = state.aiConfigs.filter((item) => item.id !== configId);
        const nextState = syncStateFromConfigs(nextConfigs, configId === state.selectedConfigId ? null : state.selectedConfigId);
        applyRuntimeConfig(nextState);
        set(nextState);
      },

      setConfigEnabled: (configId, enabled) => {
        const state = get();
        const target = state.aiConfigs.find((item) => item.id === configId);
        if (!target) {
          return false;
        }

        if (enabled && !hasUsableAIConfigEntry(target)) {
          return false;
        }

        const nextConfigs = state.aiConfigs.map((item) =>
          item.id === configId
            ? {
                ...item,
                enabled,
              }
            : item,
        );
        const nextState = syncStateFromConfigs(nextConfigs, state.selectedConfigId);
        applyRuntimeConfig(nextState);
        set(nextState);
        return true;
      },

      selectConfig: (configId) => {
        const state = get();
        const nextSelectedId = resolveSelectedAIConfigId(state.aiConfigs, configId);
        const runtimeState = buildRuntimeState(getConfigById(state.aiConfigs, nextSelectedId));
        applyRuntimeConfig(runtimeState);
        set({
          selectedConfigId: nextSelectedId,
          ...runtimeState,
        });
      },

      applyConfiguration: (config) => {
        const state = get();
        if (state.selectedConfigId) {
          state.updateConfig(state.selectedConfigId, {
            provider: config.provider,
            protocol: config.protocol,
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            model: config.model,
            customHeaders: config.customHeaders,
          });
          return;
        }

        const nextProvider = config.provider ?? state.provider;
        const nextState = {
          provider: nextProvider,
          protocol: normalizeAIProtocol(nextProvider, config.protocol ?? state.protocol),
          apiKey: config.apiKey ?? state.apiKey,
          baseURL: config.baseURL ?? state.baseURL,
          model: config.model ?? state.model,
          contextWindowTokens: config.contextWindowTokens ?? state.contextWindowTokens,
          customHeaders: config.customHeaders ?? state.customHeaders,
          isConfigured: Boolean((config.apiKey ?? state.apiKey).trim() && (config.model ?? state.model).trim()),
        };

        applyRuntimeConfig(nextState);
        set(nextState);
      },

      generateForModule: async (module, action, scope, prompt, context) => {
        set({
          currentRequestId: null,
          isStreaming: true,
          error: null,
          codeBlocks: [],
          suggestions: [],
          isPanelOpen: true,
        });

        const requestId = await aiService.request(
          { module, action, scope, prompt, context },
          {
            onStart: () => {
              set({ currentRequestId: requestId, isStreaming: true, error: null });
            },
            onChunk: (_chunk: AIStreamChunk) => {
              void _chunk;
            },
            onComplete: (response: AIResponse) => {
              set({
                isStreaming: false,
                currentRequestId: null,
                codeBlocks: response.codeBlocks,
                suggestions: response.suggestions || [],
              });

              const historyRecord: AIRequestRecord = {
                id: response.requestId,
                timestamp: new Date(),
                module,
                action,
                prompt,
                status: 'completed',
                codeBlocks: response.codeBlocks,
                responseContent: response.content,
              };

              set((current) => ({
                requestHistory: [historyRecord, ...current.requestHistory].slice(0, 50),
              }));
            },
            onError: (error: string) => {
              set({ isStreaming: false, error, currentRequestId: null });
            },
            onInterrupt: () => {
              set({ isStreaming: false, currentRequestId: null });
            },
          },
        );

        return requestId;
      },

      interrupt: () => {
        const { currentRequestId } = get();
        if (currentRequestId) {
          aiService.interrupt(currentRequestId);
        }
      },

      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      setPanelPosition: (position) => set({ panelPosition: position }),
      clearHistory: () => set({ requestHistory: [], codeBlocks: [], suggestions: [] }),
      getHistory: () => get().requestHistory,
    }),
    {
      name: 'goodnight-ai-store',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => buildPersistedGlobalAIState(state),
      migrate: (persistedState) => persistedState as GlobalAIState,
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.aiConfigs = mergePresetAIConfigEntries(
          !Array.isArray(state.aiConfigs) || state.aiConfigs.length === 0
            ? [buildLegacyConfigEntry(state)]
            : state.aiConfigs,
        );

        const nextSelectedId = resolveSelectedAIConfigId(state.aiConfigs, state.selectedConfigId || null);
        const runtimeState = buildRuntimeState(getConfigById(state.aiConfigs, nextSelectedId));
        state.selectedConfigId = nextSelectedId;
        state.provider = runtimeState.provider;
        state.protocol = runtimeState.protocol;
        state.apiKey = runtimeState.apiKey;
        state.baseURL = runtimeState.baseURL;
        state.model = runtimeState.model;
        state.contextWindowTokens = runtimeState.contextWindowTokens;
        state.customHeaders = runtimeState.customHeaders;
        state.isConfigured = runtimeState.isConfigured;
        applyRuntimeConfig(runtimeState);
      },
    },
  ),
);
