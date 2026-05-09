import type {
  RuntimeEventEnvelope,
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
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: createHeaders(this.authToken),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    return (await response.json()) as RuntimeSessionSnapshot;
  }

  async openSession(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      headers: createHeaders(this.authToken),
    });
    if (!response.ok) {
      throw new Error(`Failed to open session: ${response.status}`);
    }

    return (await response.json()) as RuntimeSessionSnapshot;
  }

  async submitTurn(input: RuntimeTurnSubmitInput) {
    const response = await fetch(`${this.baseUrl}/turns`, {
      method: 'POST',
      headers: createHeaders(this.authToken),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Failed to submit turn: ${response.status}`);
    }
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
