import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
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
