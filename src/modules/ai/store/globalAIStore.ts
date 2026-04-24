import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  aiService,
  AIAction,
  AIProviderType,
  AIRequest,
  AIResponse,
  AIModule,
  CodeBlock,
  AISuggestion,
} from '../core/AIService';
import { AIStreamChunk } from '../../../types';
import { hasUsableAIConfiguration } from '../core/configStatus';

const resolveConfiguredState = (state: {
  provider: AIProviderType;
  apiKey: string;
  model: string;
}) => hasUsableAIConfiguration(state);

interface GlobalAIState {
  // Config
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
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

export const useGlobalAIStore = create<GlobalAIState>()(
  persist(
    (set, get) => ({
      // Initial state
      provider: 'openai-compatible',
      apiKey: '',
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'gpt-4o-mini',
      customHeaders: '',
      isConfigured: false,
      currentRequestId: null,
      isStreaming: false,
      error: null,
      requestHistory: [],
      codeBlocks: [],
      suggestions: [],
      isPanelOpen: false,
      panelPosition: 'right',

      setProvider: (provider) => {
        aiService.setConfig({ provider });
        set({
          provider,
          isConfigured: resolveConfiguredState({
            provider,
            apiKey: get().apiKey,
            model: get().model,
          }),
        });
      },

      setApiKey: (key) => {
        aiService.setConfig({ apiKey: key });
        set({
          apiKey: key,
          isConfigured: resolveConfiguredState({
            provider: get().provider,
            apiKey: key,
            model: get().model,
          }),
        });
      },

      setBaseURL: (baseURL) => {
        aiService.setConfig({ baseURL });
        set({ baseURL });
      },

      setModel: (model) => {
        aiService.setConfig({ model });
        set({
          model,
          isConfigured: resolveConfiguredState({
            provider: get().provider,
            apiKey: get().apiKey,
            model,
          }),
        });
      },

      setCustomHeaders: (customHeaders) => {
        aiService.setConfig({ customHeaders });
        set({ customHeaders });
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

              set((state) => ({
                requestHistory: [historyRecord, ...state.requestHistory].slice(0, 50),
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
      name: 'devflow-ai-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        aiService.setConfig({
          provider: state.provider,
          apiKey: state.apiKey,
          baseURL: state.baseURL,
          model: state.model,
          customHeaders: state.customHeaders,
        });
        state.isConfigured = resolveConfiguredState({
          provider: state.provider,
          apiKey: state.apiKey,
          model: state.model,
        });
      },
    }
  )
);
