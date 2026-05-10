import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
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

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

test('runtime sidecar lists, upserts, and invokes MCP tools without tauri runtime commands', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-mcp-'));
  const port = 50831 + Math.floor(Math.random() * 1000);
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

    const createSessionResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-mcp-test',
        title: 'MCP Test',
        providerId: 'built-in',
      }),
    });
    assert.equal(createSessionResponse.status, 201);
    const session = await createSessionResponse.json();

    const initialServersResponse = await fetch(`${baseUrl}/mcp/servers`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(initialServersResponse.status, 200);
    const initialServers = await initialServersResponse.json();
    assert.equal(initialServers.servers.some((server) => server.id === 'goodnight-skills'), true);

    const upsertResponse = await fetch(`${baseUrl}/mcp/servers/upsert`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'custom-server',
        name: 'Custom Server',
        status: 'disconnected',
        transport: 'stdio',
        description: 'Custom MCP server',
        enabled: true,
        toolNames: ['echo'],
        tools: [
          {
            name: 'echo',
            description: 'Echo input',
            requiresApproval: false,
          },
        ],
        command: 'echo',
        args: [],
        env: {},
        url: null,
        headers: {},
        headersHelper: null,
        oauth: null,
      }),
    });
    assert.equal(upsertResponse.status, 200);
    const upserted = await upsertResponse.json();
    assert.equal(upserted.id, 'custom-server');

    const listedServersResponse = await fetch(`${baseUrl}/mcp/servers`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(listedServersResponse.status, 200);
    const listedServers = await listedServersResponse.json();
    assert.equal(listedServers.servers.some((server) => server.id === 'custom-server'), true);

    const invokeResponse = await fetch(`${baseUrl}/mcp/tools/invoke`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: session.session.id,
        serverId: 'goodnight-skills',
        toolName: 'list-skills',
        argumentsText: '',
      }),
    });
    assert.equal(invokeResponse.status, 200);
    const toolCall = await invokeResponse.json();
    assert.equal(toolCall.status, 'completed');
    assert.match(toolCall.resultPreview, /- /);

    const toolCallsResponse = await fetch(
      `${baseUrl}/sessions/${session.session.id}/mcp-tool-calls`,
      {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      },
    );
    assert.equal(toolCallsResponse.status, 200);
    const toolCallsPayload = await toolCallsResponse.json();
    assert.equal(toolCallsPayload.toolCalls.length, 1);
    assert.equal(toolCallsPayload.toolCalls[0].serverId, 'goodnight-skills');
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar executes stdio MCP tools from sidecar-owned transport', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-mcp-stdio-'));
  const port = 51831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdioToolPath = path.join(tempDir, 'echo-mcp-tool.mjs');

  await writeFile(
    stdioToolPath,
    [
      "const chunks = [];",
      "for await (const chunk of process.stdin) {",
      "  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));",
      "}",
      "const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');",
      "const args = JSON.parse(input.argumentsText || '{}');",
      "process.stdout.write(JSON.stringify({",
      "  summary: `Echoed ${args.value || ''}`.trim(),",
      "  resultPreview: `echo:${args.value || ''}`.trim(),",
      "}));",
    ].join('\n'),
    'utf8',
  );

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

    const createSessionResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-mcp-stdio-test',
        title: 'MCP STDIO Test',
        providerId: 'built-in',
      }),
    });
    assert.equal(createSessionResponse.status, 201);
    const session = await createSessionResponse.json();

    const upsertResponse = await fetch(`${baseUrl}/mcp/servers/upsert`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'stdio-server',
        name: 'STDIO Server',
        status: 'disconnected',
        transport: 'stdio',
        description: 'STDIO MCP server',
        enabled: true,
        toolNames: ['echo'],
        tools: [
          {
            name: 'echo',
            description: 'Echo input',
            requiresApproval: false,
          },
        ],
        command: process.execPath,
        args: [stdioToolPath],
        env: {},
        url: null,
        headers: {},
        headersHelper: null,
        oauth: null,
      }),
    });
    assert.equal(upsertResponse.status, 200);

    const invokeResponse = await fetch(`${baseUrl}/mcp/tools/invoke`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: session.session.id,
        serverId: 'stdio-server',
        toolName: 'echo',
        argumentsText: '{"value":"hello sidecar"}',
      }),
    });
    assert.equal(invokeResponse.status, 200);
    const toolCall = await invokeResponse.json();
    assert.equal(toolCall.status, 'completed');
    assert.equal(toolCall.summary, 'Echoed hello sidecar');
    assert.equal(toolCall.resultPreview, 'echo:hello sidecar');

    const listedServersResponse = await fetch(`${baseUrl}/mcp/servers`, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(listedServersResponse.status, 200);
    const listedServers = await listedServersResponse.json();
    const stdioServer = listedServers.servers.find((server) => server.id === 'stdio-server');
    assert.equal(stdioServer?.status, 'connected');
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar executes remote HTTP MCP tools from sidecar-owned transport', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-mcp-http-'));
  const port = 52831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  let capturedHeaders = null;
  let capturedBody = null;

  const remoteServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    capturedHeaders = request.headers;
    capturedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        summary: 'Remote inspect complete',
        resultPreview: `remote:${capturedBody.argumentsText}`,
      }),
    );
  });

  await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', resolve));
  const remoteAddress = remoteServer.address();
  assert.ok(remoteAddress && typeof remoteAddress === 'object');

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

    const createSessionResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-mcp-http-test',
        title: 'MCP HTTP Test',
        providerId: 'built-in',
      }),
    });
    assert.equal(createSessionResponse.status, 201);
    const session = await createSessionResponse.json();

    const upsertResponse = await fetch(`${baseUrl}/mcp/servers/upsert`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'remote-server',
        name: 'Remote Server',
        status: 'disconnected',
        transport: 'http',
        description: 'HTTP MCP server',
        enabled: true,
        toolNames: ['inspect'],
        tools: [
          {
            name: 'inspect',
            description: 'Inspect remotely',
            requiresApproval: false,
          },
        ],
        command: null,
        args: [],
        env: {},
        url: `http://127.0.0.1:${remoteAddress.port}/invoke`,
        headers: {
          authorization: 'Bearer remote-secret',
          'x-sidecar-mcp': 'enabled',
        },
        headersHelper: null,
        oauth: null,
      }),
    });
    assert.equal(upsertResponse.status, 200);

    const invokeResponse = await fetch(`${baseUrl}/mcp/tools/invoke`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: session.session.id,
        serverId: 'remote-server',
        toolName: 'inspect',
        argumentsText: '{"path":"src/index.ts"}',
      }),
    });
    assert.equal(invokeResponse.status, 200);
    const toolCall = await invokeResponse.json();
    assert.equal(toolCall.status, 'completed');
    assert.equal(toolCall.summary, 'Remote inspect complete');
    assert.equal(toolCall.resultPreview, 'remote:{"path":"src/index.ts"}');
    assert.equal(capturedHeaders?.authorization, 'Bearer remote-secret');
    assert.equal(capturedHeaders?.['x-sidecar-mcp'], 'enabled');
    assert.deepEqual(capturedBody, {
      serverId: 'remote-server',
      toolName: 'inspect',
      argumentsText: '{"path":"src/index.ts"}',
    });
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(remoteServer);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime sidecar parses SSE MCP tool responses from sidecar-owned transport', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'goodnight-runtime-sidecar-mcp-sse-'));
  const port = 53831 + Math.floor(Math.random() * 1000);
  const authToken = `test-token-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;

  const remoteServer = createServer(async (_request, response) => {
    response.statusCode = 200;
    response.setHeader('content-type', 'text/event-stream; charset=utf-8');
    response.write('data: {"summary":"Streaming inspect","resultPreview":"sse:chunk-1"}\n\n');
    response.write('data: {"summary":"Streaming inspect","resultPreview":"sse:final"}\n\n');
    response.end('data: [DONE]\n\n');
  });

  await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', resolve));
  const remoteAddress = remoteServer.address();
  assert.ok(remoteAddress && typeof remoteAddress === 'object');

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

    const createSessionResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-sidecar-mcp-sse-test',
        title: 'MCP SSE Test',
        providerId: 'built-in',
      }),
    });
    assert.equal(createSessionResponse.status, 201);
    const session = await createSessionResponse.json();

    const upsertResponse = await fetch(`${baseUrl}/mcp/servers/upsert`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'sse-server',
        name: 'SSE Server',
        status: 'disconnected',
        transport: 'sse',
        description: 'SSE MCP server',
        enabled: true,
        toolNames: ['inspect'],
        tools: [
          {
            name: 'inspect',
            description: 'Inspect via SSE',
            requiresApproval: false,
          },
        ],
        command: null,
        args: [],
        env: {},
        url: `http://127.0.0.1:${remoteAddress.port}/stream`,
        headers: {},
        headersHelper: null,
        oauth: null,
      }),
    });
    assert.equal(upsertResponse.status, 200);

    const invokeResponse = await fetch(`${baseUrl}/mcp/tools/invoke`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: session.session.id,
        serverId: 'sse-server',
        toolName: 'inspect',
        argumentsText: '{"path":"src/index.ts"}',
      }),
    });
    assert.equal(invokeResponse.status, 200);
    const toolCall = await invokeResponse.json();
    assert.equal(toolCall.status, 'completed');
    assert.equal(toolCall.summary, 'Streaming inspect');
    assert.equal(toolCall.resultPreview, 'sse:final');
  } finally {
    sidecar.kill('SIGTERM');
    await delay(50);
    await closeServer(remoteServer);
    await rm(tempDir, { recursive: true, force: true });
  }
});
