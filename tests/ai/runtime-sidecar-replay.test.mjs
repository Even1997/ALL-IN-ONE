import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const startCheckpointProbeServer = () =>
  new Promise((resolve) => {
    let round = 0;
    const server = createServer(async (_request, response) => {
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
                    ? '<tool_use>\n<tool name="write">\n<tool_params>{"file_path":"notes.ts","content":"export const notes = \\"updated from sidecar checkpoint test\\";\\n"}</tool_params>\n</tool>\n</tool_use>'
                    : 'Updated notes.ts and finished the task.',
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

const waitForCheckpoints = async (baseUrl, authToken, sessionId) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/sessions/${sessionId}/checkpoints`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    if ((payload.checkpoints || []).length > 0) {
      return payload.checkpoints;
    }

    await delay(100);
  }

  assert.fail(`Timed out waiting for checkpoints for session ${sessionId}`);
};

test('runtime sidecar persists replay events and rewinds checkpoints from its own store', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-replay-'));
  const projectRoot = path.join(tempDir, 'project');
  const port = 51831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const probe = await startCheckpointProbeServer();
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, 'notes.ts'), 'export const notes = "original notes";\n', 'utf8');

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

    const events = [];
    const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/events?token=${authToken}`);
    await new Promise((resolve) => {
      socket.addEventListener('open', resolve, { once: true });
    });
    socket.addEventListener('message', (event) => {
      events.push(JSON.parse(String(event.data)));
    });

    const createResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-replay-test',
        title: 'Replay Test',
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
        prompt: 'Update notes.ts for this replay test.',
        projectRoot,
        permissionMode: 'bypass',
        runtimeConfig: {
          provider: 'openai-compatible',
          apiKey: 'replay-key',
          baseURL: probe.baseUrl,
          model: 'replay-model',
          contextWindowTokens: 32000,
        },
      }),
    });
    assert.equal(turnResponse.status, 202);

    await waitForSessionStatus(baseUrl, authToken, session.session.id, 'idle');
    const checkpoints = await waitForCheckpoints(baseUrl, authToken, session.session.id);
    assert.equal(checkpoints.length > 0, true);

    const replayEventsResponse = await fetch(`${baseUrl}/sessions/${session.session.id}/replay-events`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(replayEventsResponse.status, 200);
    const replayEventsPayload = await replayEventsResponse.json();
    assert.equal(replayEventsPayload.events.length > 0, true);

    const rewindResponse = await fetch(`${baseUrl}/checkpoints/rewind`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: session.session.id,
        checkpointId: checkpoints[0].id,
      }),
    });
    assert.equal(rewindResponse.status, 200);
    const rewind = await rewindResponse.json();
    assert.equal(rewind.restoredPaths.includes('notes.ts'), true);

    const restored = await readFile(path.join(projectRoot, 'notes.ts'), 'utf8');
    assert.equal(restored, 'export const notes = "original notes";\n');
    assert.ok(events.some((event) => event.type === 'checkpoint.saved'));

    socket.close();
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(probe.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
