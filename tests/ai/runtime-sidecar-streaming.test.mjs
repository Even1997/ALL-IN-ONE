import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

const waitForRuntimeEventTypes = async (collectedEvents, expectedTypes) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const seenTypes = new Set(collectedEvents.map((event) => event?.type));
    if (expectedTypes.every((type) => seenTypes.has(type))) {
      return;
    }

    await delay(100);
  }

  assert.fail(
    `Timed out waiting for runtime events: ${expectedTypes.join(', ')}. Seen: ${collectedEvents
      .map((event) => event?.type)
      .join(', ')}`,
  );
};

const startOpenAICompatibleStreamingProbeServer = () =>
  new Promise((resolve) => {
    let lastBody = null;
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      response.statusCode = 200;
      response.setHeader('content-type', 'text/event-stream');
      response.write('data: {"choices":[{"delta":{"reasoning":"Inspect files first. "}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"streamed "}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"answer"}}]}\n\n');
      response.write('data: {"usage":{"prompt_tokens":17,"completion_tokens":9,"total_tokens":26}}\n\n');
      response.write('data: [DONE]\n\n');
      response.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        getLastBody: () => lastBody,
      });
    });
  });

test('runtime sidecar streams provider deltas, reasoning, and token usage events', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-streaming-'));
  const port = 49831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startOpenAICompatibleStreamingProbeServer();
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
        projectId: 'project-sidecar-streaming-test',
        title: 'Streaming Test',
        providerId: 'built-in',
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
        prompt: 'Give me a streamed answer.',
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'stream-key',
          baseURL: probe.baseUrl,
          model: 'stream-model',
          contextWindowTokens: 32000,
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    const snapshot = await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    const assistantMessage = snapshot.messages.find((message) => message.role === 'assistant');
    assert.ok(assistantMessage);
    assert.equal(assistantMessage.content, 'streamed answer');

    await waitForRuntimeEventTypes(runtimeEvents, [
      'turn.started',
      'turn.delta',
      'turn.reasoning',
      'turn.usage',
      'turn.completed',
    ]);

    assert.equal(probe.getLastBody()?.stream, true);
    assert.equal(probe.getLastBody()?.stream_options?.include_usage, true);

    const streamedText = runtimeEvents
      .filter((event) => event.type === 'turn.delta')
      .map((event) => event.payload.delta)
      .join('');
    assert.equal(streamedText, 'streamed answer');

    const usageEvent = runtimeEvents.find((event) => event.type === 'turn.usage');
    assert.deepEqual(usageEvent?.payload?.usage, {
      inputTokens: 17,
      outputTokens: 9,
      totalTokens: 26,
    });

    socket.close();
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
