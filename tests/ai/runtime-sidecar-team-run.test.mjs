import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const runtimeEntry = path.resolve(process.cwd(), 'apps/runtime/src/index.ts');

const waitForHealth = async (baseUrl) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for the sidecar process to listen.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for runtime sidecar health at ${baseUrl}`);
};

const waitForSessionStatus = async (baseUrl, authToken, sessionId, expectedStatus) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/sessions/${sessionId}`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    if (snapshot.status === expectedStatus) {
      return snapshot;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for session ${sessionId} to reach status ${expectedStatus}`);
};

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const startTeamProbeServer = () =>
  new Promise((resolve) => {
    const server = createServer(async (_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Team member finished their assigned work.',
              },
            },
          ],
        }),
      );
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });

test('runtime sidecar executes team runs and streams team run updates', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-team-run-'));
  const port = 52831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startTeamProbeServer();
  const sidecar = spawn(process.execPath, ['--experimental-strip-types', runtimeEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOODNIGHT_RUNTIME_HOST: '127.0.0.1',
      GOODNIGHT_RUNTIME_PORT: String(port),
      GOODNIGHT_RUNTIME_TOKEN: authToken,
      GOODNIGHT_RUNTIME_DATA_DIR: tempDir,
    },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(baseUrl);

    const runtimeEvents = [];
    const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/events?token=${authToken}`);
    await new Promise((resolve) => {
      socket.addEventListener('open', resolve, { once: true });
    });
    socket.addEventListener('message', (event) => {
      runtimeEvents.push(JSON.parse(String(event.data)));
    });

    const createResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-team-run-test',
        title: 'Team Run Test',
        providerId: 'team',
      }),
    });
    assert.equal(createResponse.status, 201);
    const session = await createResponse.json();

    const turnResponse = await fetch(`${baseUrl}/turns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: session.session.id,
        providerId: 'team',
        prompt: 'Design, implement, and review a small UI adjustment.',
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'team-key',
          baseURL: probe.baseUrl,
          model: 'team-model',
          contextWindowTokens: 32000,
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    const snapshot = await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    const assistantMessage = snapshot.messages.find((message) => message.role === 'assistant');
    assert.ok(assistantMessage);
    assert.match(assistantMessage.content, /Team member finished their assigned work/);

    assert.ok(runtimeEvents.some((event) => event.type === 'team_run.updated'));
    assert.match(JSON.stringify(runtimeEvents), /product_architecture|implementation|qa_review/);

    socket.close();
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
