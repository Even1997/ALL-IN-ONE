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
  resolveSelectedAIConfigId,
  type AIConfigEntry,
} from './aiConfigState';

interface GlobalAIState {
  aiConfigs: AIConfigEntry[];
  selectedConfigId: string | null;

  // Config
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders: string;
  isConfigured: boolean;

  // Active request
  currentRequestId: string | null;
  isStreaming: boolean;
  error: string | null;

  // History
  requestHistory: AIRequestRecord[];
  codeBlocks: CodeBlock[];
  suggestions: AISuggestion[];

  // Panel state
  isPanelOpen: boolean;
  panelPosition: 'right' | 'bottom';

  // Actions
  setProvider: (provider: AIProviderType) => void;
  setApiKey: (key: string) => void;
  setBaseURL: (baseURL: string) => void;
  setModel: (model: string) => void;
  setCustomHeaders: (headers: string) => void;
  addConfig: (seed?: Partial<AIConfigEntry>) => string;
  updateConfig: (configId: string, updates: Partial<Omit<AIConfigEntry, 'id'>>) => void;
  setConfigEnabled: (configId: string, enabled: boolean) => boolean;
  selectConfig: (configId: string | null) => void;
  applyConfiguration: (config: Partial<Pick<AIConfig, 'provider' | 'apiKey' | 'baseURL' | 'model' | 'contextWindowTokens' | 'customHeaders'>>) => void;

  // AI operations (can be called from anywhere)
  generateForModule: (
    module: AIModule,
    action: AIAction,
    scope: AIRequest['scope'],
    prompt: string,
    context?: AIRequest['context']
  ) => Promise<string>;

  interrupt: () => void;

  // Panel
  togglePanel: () => void;
  setPanelPosition: (position: 'right' | 'bottom') => void;

  // History
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

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_RUNTIME_STATE = {
  provider: 'openai-compatible' as AIProviderType,
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  model: '',
  contextWindowTokens: 200000,
  customHeaders: '',
  isConfigured: false,
};

const buildLegacyConfigEntry = (state: {
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens?: number;
  customHeaders: string;
}): AIConfigEntry =>
  createAIConfigEntry({
    id: 'legacy-default',
    name: '默认 AI',
    provider: state.provider,
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

const applyRuntimeConfig = (state: Pick<GlobalAIState, 'provider' | 'apiKey' | 'baseURL' | 'model' | 'contextWindowTokens' | 'customHeaders'>) => {
  aiService.setConfig({
    provider: state.provider,
    apiKey: state.apiKey,
    baseURL: state.baseURL,
    model: state.model,
    contextWindowTokens: state.contextWindowTokens,
    customHeaders: state.customHeaders,
  });
};

export const useGlobalAIStore = create<GlobalAIState>()(
  persist(
    (set, get) => ({
      aiConfigs: buildDefaultAIConfigEntries(),
      selectedConfigId: null,
      provider: DEFAULT_RUNTIME_STATE.provider,
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
        const { selectedConfigId } = get();
        if (selectedConfigId) {
          get().updateConfig(selectedConfigId, { provider });
          return;
        }

        aiService.setConfig({ provider });
        set({ provider, isConfigured: Boolean(get().apiKey.trim() && get().model.trim()) });
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
          name: `AI 配置 ${get().aiConfigs.length + 1}`,
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
            ? {
                ...item,
                ...updates,
                name: typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : item.name,
              }
            : item
        );
        const nextState = syncStateFromConfigs(nextConfigs, state.selectedConfigId);
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
            : item
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
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            model: config.model,
            customHeaders: config.customHeaders,
          });
          return;
        }

        const nextState = {
          provider: config.provider ?? state.provider,
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
              // Chunks are handled by the panel subscription
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
          }
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.aiConfigs = mergePresetAIConfigEntries(
          !Array.isArray(state.aiConfigs) || state.aiConfigs.length === 0
            ? [buildLegacyConfigEntry(state)]
            : state.aiConfigs
        );

        const nextSelectedId = resolveSelectedAIConfigId(state.aiConfigs, state.selectedConfigId || null);
        const runtimeState = buildRuntimeState(getConfigById(state.aiConfigs, nextSelectedId));
        state.selectedConfigId = nextSelectedId;
        state.provider = runtimeState.provider;
        state.apiKey = runtimeState.apiKey;
        state.baseURL = runtimeState.baseURL;
        state.model = runtimeState.model;
        state.contextWindowTokens = runtimeState.contextWindowTokens;
        state.customHeaders = runtimeState.customHeaders;
        state.isConfigured = runtimeState.isConfigured;
        applyRuntimeConfig(runtimeState);
      },
    }
  )
);
