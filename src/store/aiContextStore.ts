import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ChangeScope, AIStreamChunk, AIStreamStatus, MiniContext, ElementType } from '../types';

interface AIContextState {
  // AI Configuration
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;

  // Stream state
  streamStatus: AIStreamStatus;
  streamedContent: string;
  chunks: AIStreamChunk[];

  // Context management
  currentScope: ChangeScope | null;
  contextHistory: MiniContext[];

  // Actions
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setConfig: (config: { maxTokens?: number; temperature?: number }) => void;

  // Stream actions
  startStream: () => void;
  appendChunk: (chunk: AIStreamChunk) => void;
  completeStream: () => void;
  errorStream: (error: string) => void;
  resetStream: () => void;

  // Scope management
  setScope: (scope: ChangeScope) => void;
  clearScope: () => void;

  // Context history
  addToHistory: (context: MiniContext) => void;
  getFromHistory: (requestId: string) => MiniContext | null;
  clearHistory: () => void;

  // Helpers
  buildMiniContext: (target: { type: ElementType; id: string; filePath: string }, change: { type: string; before?: string; after: string }) => MiniContext;
}

export const useAIContextStore = create<AIContextState>((set, get) => ({
  // Initial state
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
  streamStatus: 'idle',
  streamedContent: '',
  chunks: [],
  currentScope: null,
  contextHistory: [],

  // Configuration actions
  setApiKey: (key) => set({ apiKey: key }),
  setModel: (model) => set({ model }),
  setConfig: (config) => set(state => ({
    maxTokens: config.maxTokens ?? state.maxTokens,
    temperature: config.temperature ?? state.temperature,
  })),

  // Stream actions
  startStream: () => set({
    streamStatus: 'streaming',
    streamedContent: '',
    chunks: [],
  }),

  appendChunk: (chunk) => set(state => ({
    streamedContent: state.streamedContent + chunk.content,
    chunks: [...state.chunks, chunk],
  })),

  completeStream: () => set({ streamStatus: 'completed' }),

  errorStream: (error) => set(state => ({
    streamStatus: 'error',
    chunks: [...state.chunks, {
      type: 'error',
      content: error,
      timestamp: Date.now(),
    }],
  })),

  resetStream: () => set({
    streamStatus: 'idle',
    streamedContent: '',
    chunks: [],
  }),

  // Scope management
  setScope: (scope) => set({ currentScope: scope }),

  clearScope: () => set({ currentScope: null }),

  // Context history
  addToHistory: (context) => set(state => ({
    contextHistory: [...state.contextHistory, context].slice(-50),
  })),

  getFromHistory: (requestId) => {
    const { contextHistory } = get();
    return contextHistory.find(c => c.requestId === requestId) || null;
  },

  clearHistory: () => set({ contextHistory: [] }),

  // Helper to build precise context
  buildMiniContext: (target, change) => {
    const requestId = uuidv4();
    const scope: ChangeScope = {
      target,
      change: {
        type: change.type as 'modify' | 'add' | 'delete' | 'replace',
        before: change.before,
        after: change.after,
      },
      related: {
        files: [],
        elements: [],
      },
      tokenBudget: 500,
    };

    const miniContext: MiniContext = {
      requestId,
      scope,
    };

    set(state => ({
      currentScope: scope,
      contextHistory: [...state.contextHistory, miniContext].slice(-50),
    }));

    return miniContext;
  },
}));
