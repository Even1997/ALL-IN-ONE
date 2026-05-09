export const DEFAULT_RUNTIME_HOST = '127.0.0.1';

export type RuntimeSessionSummary = {
  id: string;
  projectId: string;
  title: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
};

export type RuntimeMessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
};

export type RuntimeSessionSnapshot = {
  session: RuntimeSessionSummary;
  messages: RuntimeMessageRecord[];
  status: 'idle' | 'running' | 'failed';
};

export type RuntimeSessionCreateInput = {
  projectId: string;
  title?: string;
  providerId?: string;
};

export type RuntimeModelConfig = {
  provider: 'openai-compatible' | 'anthropic';
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders?: string;
};

export type RuntimeTurnSubmitInput = {
  sessionId: string;
  prompt: string;
  providerId?: string;
  runtimeConfig?: RuntimeModelConfig | null;
};

export type RuntimeEventEnvelope =
  | {
      type: 'runtime.ready';
      emittedAt: number;
      payload: {
        host: string;
      };
    }
  | {
      type: 'session.snapshot';
      emittedAt: number;
      payload: RuntimeSessionSnapshot;
    }
  | {
      type: 'message.delta' | 'turn.finished';
      emittedAt: number;
      payload: {
        sessionId: string;
        message: RuntimeMessageRecord;
      };
    };

export const buildRuntimeReadyEvent = (): RuntimeEventEnvelope => ({
  type: 'runtime.ready',
  emittedAt: Date.now(),
  payload: {
    host: DEFAULT_RUNTIME_HOST,
  },
});

export const isRuntimeEventEnvelope = (value: unknown): value is RuntimeEventEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RuntimeEventEnvelope>;
  return typeof candidate.type === 'string' && typeof candidate.emittedAt === 'number';
};
