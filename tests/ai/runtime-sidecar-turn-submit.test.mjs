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
