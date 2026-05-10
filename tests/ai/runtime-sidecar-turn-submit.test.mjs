import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const runtimeEntry = path.resolve(process.cwd(), 'apps/runtime/src/index.ts');
const sidecarIndexPath = path.resolve(process.cwd(), 'apps/runtime/src/index.ts');

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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

const startOpenAICompatibleProbeServer = () =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      const authorization = request.headers.authorization || '';
      const contentType = request.headers['content-type'] || '';
      const extraHeader = request.headers['x-extra'] || '';
      const ok =
        authorization === 'Bearer real-runtime-key' &&
        String(contentType).includes('application/json') &&
        extraHeader === 'allowed';

      response.statusCode = ok ? 200 : 401;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: ok ? 'protected headers preserved' : 'protected headers were overridden',
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

const startHistoryAwareProbeServer = () =>
  new Promise((resolve) => {
    let lastBody = null;
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'history and references received',
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
        getLastBody: () => lastBody,
      });
    });
  });

const startToolLoopProbeServer = () =>
  new Promise((resolve) => {
    const requests = [];
    let round = 0;
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push(body);
      round += 1;

      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  round === 1
                    ? '<think>Need to inspect notes first.</think>\n<tool_use>\n<tool name="view">\n<tool_params>{"file_path":"notes.txt"}</tool_params>\n</tool>\n</tool_use>'
                    : 'Based on notes: hello context',
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
        getRequests: () => requests,
      });
    });
  });

test('runtime sidecar owns turn execution and writes failed completion state into the session snapshot', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-'));
  const port = 45831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
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

    const unauthorizedResponse = await fetch(`${baseUrl}/sessions`);
    assert.equal(unauthorizedResponse.status, 401);

    const invalidJsonResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: '{"projectId":',
    });
    assert.equal(invalidJsonResponse.status, 400);
    assert.deepEqual(await invalidJsonResponse.json(), { error: 'Invalid JSON body' });

    const createResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-test',
        title: 'Sidecar Test',
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
        prompt: 'hello from runtime sidecar integration test',
      }),
    });
    assert.equal(turnResponse.status, 202);

    const snapshot = await waitForSessionStatus(baseUrl, authToken, session.session.id, 'failed');
    assert.equal(snapshot.messages[0]?.role, 'user');
    assert.match(snapshot.messages[0]?.content || '', /hello from runtime sidecar integration test/);
    assert.equal(snapshot.messages[1]?.role, 'assistant');
    assert.match(snapshot.messages[1]?.content || '', /Node runtime sidecar 执行失败/);
    assert.match(snapshot.messages[1]?.content || '', /缺少可用模型配置/);
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar keeps model auth headers protected from custom header overrides', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-'));
  const port = 46831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startOpenAICompatibleProbeServer();
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

    const createResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-header-test',
        title: 'Sidecar Header Test',
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
        prompt: 'check headers',
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'real-runtime-key',
          baseURL: probe.baseUrl,
          model: 'test-model',
          contextWindowTokens: 4096,
          customHeaders: JSON.stringify({
            authorization: 'Bearer attacker-token',
            'content-type': 'text/plain',
            'x-api-key': 'attacker-key',
            'x-extra': 'allowed',
          }),
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    const snapshot = await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    assert.equal(snapshot.messages[1]?.role, 'assistant');
    assert.equal(snapshot.messages[1]?.content, 'protected headers preserved');
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar forwards conversation history and reference context into model requests', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-'));
  const port = 47331 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startHistoryAwareProbeServer();
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

    const createResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-context-test',
        title: 'Sidecar Context Test',
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
        prompt: 'Use the selected file and prior answer',
        conversationHistory: [
          { role: 'user', content: 'What did we decide?' },
          { role: 'assistant', content: 'We chose the sidecar cutover.' },
        ],
        referenceFiles: [
          {
            path: 'docs/plan.md',
            title: 'plan.md',
            content: 'The selected file says we should preserve timeline and context.',
            type: 'md',
            updatedAt: '2026-05-10T08:00:00.000Z',
            readableByAI: true,
            summary: 'Contains the cutover constraints.',
            tags: [],
          },
        ],
        contextLabels: ['Project / all-in-one', 'Reference / plan.md'],
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'real-runtime-key',
          baseURL: probe.baseUrl,
          model: 'test-model',
          contextWindowTokens: 4096,
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    const requestBody = probe.getLastBody();
    assert.equal(Array.isArray(requestBody?.messages), true);
    const serializedMessages = JSON.stringify(requestBody.messages);
    assert.match(serializedMessages, /What did we decide\?/);
    assert.match(serializedMessages, /We chose the sidecar cutover\./);
    assert.match(serializedMessages, /<history title=\\"Recent History\\"/);
    assert.match(serializedMessages, /<reference title=\\"References\\"/);
    assert.match(serializedMessages, /project-sidecar-context-test/);
    assert.match(serializedMessages, /The selected file says we should preserve timeline and context\./);
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar executes the built-in tool loop and persists assistant timelines into snapshots', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-project-'));
  const port = 48831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startToolLoopProbeServer();
  await writeFile(path.join(projectRoot, 'notes.txt'), 'hello context', 'utf8');
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
        projectId: 'project-sidecar-tool-loop-test',
        title: 'Tool Loop Test',
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
        projectName: 'Tool Loop Project',
        projectRoot,
        permissionMode: 'bypass',
        prompt: 'Read notes.txt and answer with its contents.',
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'tool-loop-key',
          baseURL: probe.baseUrl,
          model: 'tool-loop-model',
          contextWindowTokens: 32000,
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    const snapshot = await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    const assistantMessage = snapshot.messages.find((message) => message.role === 'assistant');
    assert.ok(assistantMessage);
    assert.match(assistantMessage.content, /Based on notes: hello context/);
    assert.ok(Array.isArray(assistantMessage.timeline));
    assert.ok(
      assistantMessage.timeline.some((event) => event.kind === 'tool_use' && event.toolName === 'view'),
    );
    assert.ok(
      assistantMessage.timeline.some(
        (event) =>
          event.kind === 'tool_result' &&
          event.toolName === 'view' &&
          /hello context/.test(event.output || ''),
      ),
    );

    const requests = probe.getRequests();
    assert.equal(requests.length, 2);
    assert.match(JSON.stringify(requests[1]), /Tool view result:/);
    assert.match(JSON.stringify(requests[1]), /hello context/);
    await waitForRuntimeEventTypes(runtimeEvents, [
      'turn.started',
      'turn.reasoning',
      'tool.started',
      'tool.finished',
      'turn.completed',
    ]);
    socket.close();
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(projectRoot, { recursive: true, force: true });
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar uses shared allowed-tools policy for built-in turns', async () => {
  const sidecarSource = await readFile(sidecarIndexPath, 'utf8');

  assert.match(sidecarSource, /allowedTools:\s*getTurnAllowedRuntimeTools/);
  assert.doesNotMatch(
    sidecarSource,
    /allowedTools:\s*sandboxPolicy === 'deny' \? READ_ONLY_CHAT_TOOLS : SIDE_EFFECT_TOOLS/,
  );
});

test('sidecar turn submission delegates tool-loop policy to shared runtime modules', async () => {
  const sidecarSource = await readFile(sidecarIndexPath, 'utf8');

  assert.doesNotMatch(sidecarSource, /READ_ONLY_CHAT_TOOLS,\s*RISKY_BUILT_IN_TOOLS,\s*SIDE_EFFECT_TOOLS/);
  assert.match(sidecarSource, /getTurnAllowedRuntimeTools/);
  assert.match(sidecarSource, /RISKY_RUNTIME_TOOLS/);
});

test('runtime sidecar allows desktop webview CORS health checks and turn preflights', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-'));
  const port = 47831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
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

    const healthResponse = await fetch(`${baseUrl}/health`, {
      headers: {
        origin: 'http://localhost:1420',
      },
    });
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get('access-control-allow-origin'), '*');

    const preflightResponse = await fetch(`${baseUrl}/turns`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:1420',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    assert.equal(preflightResponse.status, 204);
    assert.equal(preflightResponse.headers.get('access-control-allow-origin'), '*');
    assert.match(preflightResponse.headers.get('access-control-allow-methods') || '', /\bPOST\b/);
    assert.match(
      preflightResponse.headers.get('access-control-allow-headers') || '',
      /\bauthorization\b/i,
    );
    assert.match(
      preflightResponse.headers.get('access-control-allow-headers') || '',
      /\bcontent-type\b/i,
    );
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await rm(tempDir, { recursive: true, force: true });
  }
});
