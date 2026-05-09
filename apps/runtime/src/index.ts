import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  DEFAULT_RUNTIME_HOST,
  type RuntimeEventEnvelope,
  type RuntimeModelConfig,
  type RuntimeMessageRecord,
  type RuntimeSessionCreateInput,
  type RuntimeSessionSnapshot,
  type RuntimeSessionSummary,
  type RuntimeTurnSubmitInput,
  buildRuntimeReadyEvent,
} from '@goodnight/runtime-protocol';

type RuntimeState = {
  sessions: RuntimeSessionSnapshot[];
};

type RuntimeConfig = {
  host: string;
  port: number;
  authToken: string;
  dataDir: string;
};

const DEFAULT_RUNTIME_PORT = 45731;
const STATE_FILE_NAME = 'sidecar-runtime-state.json';

const readConfig = (): RuntimeConfig => ({
  host: process.env.GOODNIGHT_RUNTIME_HOST || DEFAULT_RUNTIME_HOST,
  port: Number(process.env.GOODNIGHT_RUNTIME_PORT || DEFAULT_RUNTIME_PORT),
  authToken: process.env.GOODNIGHT_RUNTIME_TOKEN || 'goodnight-local-dev-token',
  dataDir: process.env.GOODNIGHT_RUNTIME_DATA_DIR || path.resolve(process.cwd(), '.runtime-data'),
});

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createEmptyState = (): RuntimeState => ({
  sessions: [],
});

const getStateFilePath = (config: RuntimeConfig) => path.join(config.dataDir, STATE_FILE_NAME);

const loadState = async (config: RuntimeConfig): Promise<RuntimeState> => {
  await mkdir(config.dataDir, { recursive: true });
  try {
    const file = await readFile(getStateFilePath(config), 'utf8');
    const parsed = JSON.parse(file) as Partial<RuntimeState>;
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return createEmptyState();
  }
};

const saveState = async (config: RuntimeConfig, state: RuntimeState) => {
  await writeFile(getStateFilePath(config), JSON.stringify(state, null, 2), 'utf8');
};

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

const readBody = async <T>(request: Request) => (await request.json()) as T;

const isAuthorized = (request: Request, authToken: string) =>
  request.headers.get('authorization') === `Bearer ${authToken}`;

const buildSessionSummary = (input: RuntimeSessionCreateInput): RuntimeSessionSummary => {
  const now = Date.now();
  return {
    id: createId('session'),
    projectId: input.projectId,
    title: input.title || '新对话',
    providerId: input.providerId || 'built-in',
    createdAt: now,
    updatedAt: now,
  };
};

const buildSnapshot = (input: RuntimeSessionCreateInput): RuntimeSessionSnapshot => ({
  session: buildSessionSummary(input),
  messages: [],
  status: 'idle',
});

const buildAssistantMessage = (content: string): RuntimeMessageRecord => ({
  id: createId('message'),
  role: 'assistant',
  content,
  createdAt: Date.now(),
});

const buildUserMessage = (prompt: string): RuntimeMessageRecord => ({
  id: createId('message'),
  role: 'user',
  content: prompt,
  createdAt: Date.now(),
});

const matchSession = (state: RuntimeState, sessionId: string) =>
  state.sessions.find((entry) => entry.session.id === sessionId) || null;

const getProjectSessions = (state: RuntimeState, projectId?: string | null) =>
  state.sessions
    .filter((entry) => !projectId || entry.session.projectId === projectId)
    .map((entry) => entry.session);

const buildSnapshotEvent = (snapshot: RuntimeSessionSnapshot): RuntimeEventEnvelope => ({
  type: 'session.snapshot',
  emittedAt: Date.now(),
  payload: snapshot,
});

const buildTurnEvent = (
  sessionId: string,
  message: RuntimeMessageRecord,
  final: boolean,
): RuntimeEventEnvelope => ({
  type: final ? 'turn.finished' : 'message.delta',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    message,
  },
});

const parseCustomHeaders = (customHeaders?: string) => {
  if (!customHeaders?.trim()) {
    return {};
  }

  try {
    const protectedHeaderNames = new Set(['authorization', 'content-type', 'x-api-key']);
    const parsed = JSON.parse(customHeaders) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key]) => !protectedHeaderNames.has(key.trim().toLowerCase()))
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
};

const hasUsableRuntimeConfig = (config?: RuntimeModelConfig | null): config is RuntimeModelConfig =>
  Boolean(config?.provider && config.apiKey.trim() && config.model.trim());

const readOpenAICompatibleText = async (prompt: string, config: RuntimeModelConfig) => {
  const response = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      max_tokens: 4096,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are Goodnight, a desktop workspace AI assistant. Answer directly, helpfully, and in the user language when possible.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible API error (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content.map((item) => item?.text || '').join('\n').trim();
    if (text) {
      return text;
    }
  }

  throw new Error('OpenAI-compatible API returned empty content');
};

const readAnthropicText = async (prompt: string, config: RuntimeModelConfig) => {
  const baseUrl = config.baseURL.trim() || 'https://api.anthropic.com/v1';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      temperature: 0.4,
      system:
        'You are Goodnight, a desktop workspace AI assistant. Answer directly, helpfully, and in the user language when possible.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.content)) {
    throw new Error('Anthropic API returned empty content');
  }

  const text = payload.content.map((block: { text?: string }) => block?.text || '').join('\n').trim();
  if (!text) {
    throw new Error('Anthropic API returned empty content');
  }

  return text;
};

const executeRuntimeTurn = async (input: RuntimeTurnSubmitInput) => {
  if (!hasUsableRuntimeConfig(input.runtimeConfig)) {
    throw new Error('Node runtime sidecar 缺少可用模型配置，无法继续执行本次对话。');
  }

  if (input.runtimeConfig.provider === 'anthropic') {
    return readAnthropicText(input.prompt, input.runtimeConfig);
  }

  return readOpenAICompatibleText(input.prompt, input.runtimeConfig);
};

const completeSubmittedTurn = async (
  config: RuntimeConfig,
  state: RuntimeState,
  input: RuntimeTurnSubmitInput,
  snapshot: RuntimeSessionSnapshot,
  broadcast: (event: RuntimeEventEnvelope) => void,
) => {
  try {
    const reply = await executeRuntimeTurn(input);
    const assistantMessage = buildAssistantMessage(reply);
    snapshot.messages = [...snapshot.messages, assistantMessage];
    snapshot.status = 'idle';
    snapshot.session.updatedAt = Date.now();
    await saveState(config, state);
    broadcast(buildTurnEvent(snapshot.session.id, assistantMessage, false));
    broadcast(buildSnapshotEvent(snapshot));
    broadcast(buildTurnEvent(snapshot.session.id, assistantMessage, true));
  } catch (error) {
    const assistantMessage = buildAssistantMessage(
      `Node runtime sidecar 执行失败：${error instanceof Error ? error.message : String(error)}`,
    );
    snapshot.messages = [...snapshot.messages, assistantMessage];
    snapshot.status = 'failed';
    snapshot.session.updatedAt = Date.now();
    await saveState(config, state);
    broadcast(buildSnapshotEvent(snapshot));
    broadcast(buildTurnEvent(snapshot.session.id, assistantMessage, true));
  }
};

const main = async () => {
  const config = readConfig();
  const state = await loadState(config);
  const clients = new Set<import('ws').WebSocket>();

  const broadcast = (event: RuntimeEventEnvelope) => {
    const serialized = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  };

  const server = createServer(async (incomingMessage, response) => {
    const origin = `http://${incomingMessage.headers.host || `${config.host}:${config.port}`}`;
    const url = new URL(incomingMessage.url || '/', origin);
    const request = new Request(url, {
      method: incomingMessage.method,
      headers: incomingMessage.headers as HeadersInit,
      body:
        incomingMessage.method && ['POST', 'PUT', 'PATCH'].includes(incomingMessage.method)
          ? incomingMessage
          : null,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const send = async (result: Response) => {
      response.statusCode = result.status;
      result.headers.forEach((value, key) => {
        response.setHeader(key, value);
      });
      response.end(await result.text());
    };

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        await send(
          json(200, {
            ok: true,
            runtime: 'node-sidecar',
          }),
        );
        return;
      }

      if (!isAuthorized(request, config.authToken)) {
        await send(json(401, { error: 'Unauthorized' }));
        return;
      }

      if (url.pathname === '/sessions' && request.method === 'GET') {
        await send(
          json(200, {
            sessions: getProjectSessions(state, url.searchParams.get('projectId')),
          }),
        );
        return;
      }

      if (url.pathname === '/sessions' && request.method === 'POST') {
        const input = await readBody<RuntimeSessionCreateInput>(request);
        const snapshot = buildSnapshot(input);
        state.sessions.unshift(snapshot);
        await saveState(config, state);
        broadcast(buildSnapshotEvent(snapshot));
        await send(json(201, snapshot));
        return;
      }

      if (url.pathname.startsWith('/sessions/') && request.method === 'GET') {
        const sessionId = url.pathname.split('/').pop() || '';
        const snapshot = matchSession(state, sessionId);
        await send(snapshot ? json(200, snapshot) : json(404, { error: 'Session not found' }));
        return;
      }

      if (url.pathname === '/turns' && request.method === 'POST') {
        const body = await readBody<RuntimeTurnSubmitInput>(request);
        const snapshot = matchSession(state, body.sessionId);
        if (!snapshot) {
          await send(json(404, { error: 'Session not found' }));
          return;
        }

        const userMessage = buildUserMessage(body.prompt);
        snapshot.messages = [...snapshot.messages, userMessage];
        snapshot.status = 'running';
        snapshot.session.updatedAt = Date.now();
        await saveState(config, state);
        broadcast(buildSnapshotEvent(snapshot));
        await send(json(202, { accepted: true }));
        void completeSubmittedTurn(config, state, body, snapshot, broadcast);
        return;
      }

      await send(json(404, { error: 'Not found' }));
    } catch (error) {
      if (response.writableEnded) {
        return;
      }

      await send(
        json(error instanceof SyntaxError ? 400 : 500, {
          error: error instanceof SyntaxError ? 'Invalid JSON body' : 'Runtime request failed',
        }),
      );
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const origin = `http://${request.headers.host || `${config.host}:${config.port}`}`;
    const url = new URL(request.url || '/', origin);
    if (url.pathname !== '/events' || url.searchParams.get('token') !== config.authToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (client: import('ws').WebSocket) => {
      clients.add(client);
      client.send(JSON.stringify(buildRuntimeReadyEvent()));
      client.on('close', () => {
        clients.delete(client);
      });
    });
  });

  server.listen(config.port, config.host, () => {
    // Keep startup logs compact because Tauri dev will surface them.
    console.log(
      `[runtime-sidecar] listening on http://${config.host}:${config.port} with data dir ${config.dataDir}`,
    );
  });
};

void main();
