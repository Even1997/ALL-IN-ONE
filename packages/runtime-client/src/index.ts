import type {
  RuntimeApprovalResolveInput,
  RuntimeBackgroundTaskRecord,
  RuntimeCheckpointDiffRecord,
  RuntimeCheckpointRecord,
  RuntimeCheckpointRewindInput,
  RuntimeCheckpointRewindResult,
  RuntimeEventEnvelope,
  RuntimeMcpDeleteResult,
  RuntimeMcpServerRecord,
  RuntimeMcpToolCallRecord,
  RuntimeMcpToolInvokeInput,
  RuntimeReplayAppendInput,
  RuntimeReplayEvent,
  RuntimeQuestionAnswerInput,
  RuntimeTurnSubmitInput,
  RuntimeSessionCreateInput,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
} from '@goodnight/runtime-protocol';
import { isRuntimeEventEnvelope } from '@goodnight/runtime-protocol';

export type RuntimeSidecarDescriptor = {
  baseUrl: string;
  authToken: string;
};

type RuntimeEventListener = (event: RuntimeEventEnvelope) => void;

const createHeaders = (authToken: string) => ({
  authorization: `Bearer ${authToken}`,
  'content-type': 'application/json',
});

export class RuntimeSidecarClient {
  private readonly baseUrl: string;
  private readonly authToken: string;

  constructor(descriptor: RuntimeSidecarDescriptor) {
    this.baseUrl = descriptor.baseUrl.replace(/\/$/, '');
    this.authToken = descriptor.authToken;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: createHeaders(this.authToken),
    });
    if (!response.ok) {
      throw new Error(`Runtime request failed for GET ${path}: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, input: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: createHeaders(this.authToken),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Runtime request failed for POST ${path}: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Runtime health check failed with status ${response.status}`);
    }

    return response.json() as Promise<{ ok: boolean; runtime: string }>;
  }

  async listSessions(projectId?: string) {
    const url = new URL(`${this.baseUrl}/sessions`);
    if (projectId) {
      url.searchParams.set('projectId', projectId);
    }
    const response = await fetch(url, {
      headers: createHeaders(this.authToken),
    });
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status}`);
    }

    const payload = (await response.json()) as { sessions: RuntimeSessionSummary[] };
    return payload.sessions;
  }

  async createSession(input: RuntimeSessionCreateInput) {
    return this.post<RuntimeSessionSnapshot>('/sessions', input);
  }

  async openSession(sessionId: string) {
    return this.get<RuntimeSessionSnapshot>(`/sessions/${sessionId}`);
  }

  async submitTurn(input: RuntimeTurnSubmitInput) {
    await this.post<void>('/turns', input);
  }

  async answerQuestion(input: RuntimeQuestionAnswerInput) {
    await this.post<void>('/questions/answer', input);
  }

  async resolveApproval(input: RuntimeApprovalResolveInput) {
    await this.post<void>('/approvals/resolve', input);
  }

  async listCheckpoints(sessionId: string) {
    const payload = await this.get<{ checkpoints: RuntimeCheckpointRecord[] }>(
      `/sessions/${sessionId}/checkpoints`,
    );
    return payload.checkpoints;
  }

  async listBackgroundTasks(sessionId: string) {
    const payload = await this.get<{ tasks: RuntimeBackgroundTaskRecord[] }>(
      `/sessions/${sessionId}/background-tasks`,
    );
    return payload.tasks;
  }

  async listReplayEvents(sessionId: string) {
    const payload = await this.get<{ events: RuntimeReplayEvent[] }>(
      `/sessions/${sessionId}/replay-events`,
    );
    return payload.events;
  }

  async appendReplayEvent(input: RuntimeReplayAppendInput) {
    return this.post<RuntimeReplayEvent>('/replay-events/append', input);
  }

  async getCheckpointDiff(input: {
    sessionId: string;
    runId: string;
    path: string;
  }) {
    const url = new URL(`${this.baseUrl}/checkpoints/diff`);
    url.searchParams.set('sessionId', input.sessionId);
    url.searchParams.set('runId', input.runId);
    url.searchParams.set('path', input.path);
    const response = await fetch(url, {
      headers: createHeaders(this.authToken),
    });
    if (!response.ok) {
      throw new Error(`Failed to load checkpoint diff: ${response.status}`);
    }

    return response.json() as Promise<RuntimeCheckpointDiffRecord>;
  }

  async rewindCheckpoint(input: RuntimeCheckpointRewindInput) {
    return this.post<RuntimeCheckpointRewindResult>('/checkpoints/rewind', input);
  }

  async listMcpServers() {
    const payload = await this.get<{ servers: RuntimeMcpServerRecord[] }>('/mcp/servers');
    return payload.servers;
  }

  async upsertMcpServer(input: RuntimeMcpServerRecord) {
    return this.post<RuntimeMcpServerRecord>('/mcp/servers/upsert', input);
  }

  async deleteMcpServer(id: string) {
    return this.post<RuntimeMcpDeleteResult>('/mcp/servers/delete', { id });
  }

  async listMcpToolCalls(threadId: string) {
    const payload = await this.get<{ toolCalls: RuntimeMcpToolCallRecord[] }>(
      `/sessions/${threadId}/mcp-tool-calls`,
    );
    return payload.toolCalls;
  }

  async invokeMcpTool(input: RuntimeMcpToolInvokeInput) {
    return this.post<RuntimeMcpToolCallRecord>('/mcp/tools/invoke', input);
  }

  connect(listener: RuntimeEventListener) {
    const eventsUrl = new URL(`${this.baseUrl.replace(/^http/, 'ws')}/events`);
    eventsUrl.searchParams.set('token', this.authToken);
    const socket = new WebSocket(eventsUrl);
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (isRuntimeEventEnvelope(payload)) {
          listener(payload);
        }
      } catch {
        // Ignore malformed events from local runtime bootstrap.
      }
    });
    return socket;
  }
}
