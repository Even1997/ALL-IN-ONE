import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { streamRuntimeProviderTurn } from '../../apps/runtime/src/nodeRuntimeProviderClient.ts';
import { parseToolCalls } from '../../src/modules/ai/runtime/tools/toolExecutor.ts';

const runtimeConfig = {
  provider: 'openai-compatible',
  baseURL: 'https://example.com/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

const createSseResponse = (frames) => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
      },
    },
  );
};

const toSseFrame = (payload) => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;

test('node runtime provider client imports shared runtime provider event types', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');

  assert.match(
    source,
    /from '\.\.\/\.\.\/\.\.\/src\/modules\/ai\/runtime\/provider\/runtimeProviderEvents\.ts'/,
  );
  assert.doesNotMatch(source, /type RuntimeProviderStreamEvent =/);
});

test('openai-compatible streaming path parses native tool call deltas before XML fallback', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');

  assert.match(source, /tool_calls/);
  assert.match(source, /parseOpenAICompatibleToolCall/);
});

test('openai-compatible SSE accumulates fragmented tool_call arguments before emitting tool events', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createSseResponse([
      toSseFrame({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: {
                    name: 'view',
                    arguments: '{"path":"src/',
                  },
                },
              ],
            },
          },
        ],
      }),
      toSseFrame({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'index.ts"}',
                  },
                },
              ],
            },
          },
        ],
      }),
      toSseFrame('[DONE]'),
    ]);

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig,
      prompt: 'Inspect the source file.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_1', name: 'view', input: { path: 'src/index.ts' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible JSON fallback emits tool calls when message content is empty', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_2',
                  function: {
                    name: 'view',
                    arguments: '{"path":"README.md"}',
                  },
                },
              ],
            },
          },
        ],
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig,
      prompt: 'Inspect the readme.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_2', name: 'view', input: { path: 'README.md' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible requests include tool declarations and auto tool choice', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  let lastBody = null;

  globalThis.fetch = async (_input, init) => {
    lastBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Ready',
            },
          },
        ],
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig,
      prompt: 'Inspect the project.',
      systemPrompt: 'You can use tools.',
    });

    assert.equal(finalText, 'Ready');
    assert.equal(Array.isArray(lastBody?.tools), true);
    assert.equal(lastBody.tools.some((tool) => tool?.function?.name === 'view'), true);
    assert.equal(lastBody.tool_choice, 'auto');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible retries /v1 chat completions when root endpoint returns HTML', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'http://localhost:8080/chat/completions') {
      return new Response('<!doctype html><html><body>site shell</body></html>', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
    }

    if (url === 'http://localhost:8080/v1/chat/completions') {
      return createSseResponse([
        toSseFrame({
          choices: [
            {
              delta: {
                content: 'Fallback works',
              },
            },
          ],
        }),
        toSseFrame('[DONE]'),
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        ...runtimeConfig,
        baseURL: 'http://localhost:8080',
      },
      prompt: 'Use fallback.',
      systemPrompt: 'system',
    });

    assert.equal(finalText, 'Fallback works');
    assert.deepEqual(requestedUrls, [
      'http://localhost:8080/chat/completions',
      'http://localhost:8080/v1/chat/completions',
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible SSE still returns parseable tool protocol when no event handler is attached', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    createSseResponse([
      toSseFrame({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_3',
                  function: {
                    name: 'view',
                    arguments: '{"path":"docs/',
                  },
                },
              ],
            },
          },
        ],
      }),
      toSseFrame({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'plan.md"}',
                  },
                },
              ],
            },
          },
        ],
      }),
      toSseFrame('[DONE]'),
    ]);

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig,
      prompt: 'Inspect the plan.',
      systemPrompt: 'You can use tools.',
    });

    assert.deepEqual(
      parseToolCalls(finalText).map((call) => ({ name: call.name, input: call.input })),
      [{ name: 'view', input: { path: 'docs/plan.md' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('built-in runtime adapter maps provider text, thinking, and tool activity into canonical events', async () => {
  const { createBuiltinRuntimeAdapter } = await import(
    `../../src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts?test=${Date.now()}`
  );

  const events = [];
  const adapter = createBuiltinRuntimeAdapter({
    sessionId: 'session_1',
    runId: 'run_1',
    turnId: 'turn_1',
  });

  adapter.onProviderEvent({ kind: 'thinking', delta: 'check files' }, (event) => events.push(event));
  adapter.onProviderEvent({ kind: 'text', delta: 'Scanning files...' }, (event) => events.push(event));
  adapter.onProviderEvent(
    { kind: 'tool_call', toolCall: { id: 'call_1', name: 'view', input: { path: 'README.md' } } },
    (event) => events.push(event),
  );
  adapter.onProviderEvent({ kind: 'done', finalText: 'Done.' }, (event) => events.push(event));

  const reasoningDeltaEvent = events.find((event) => event.type === 'reasoning.delta');
  const messageDeltaEvent = events.find((event) => event.type === 'message.delta');
  const messageCompletedEvent = events.find((event) => event.type === 'message.completed');

  assert.equal(reasoningDeltaEvent?.payload.textChunk, 'check files');
  assert.equal(events.some((event) => event.type === 'progress.updated'), false);
  assert.equal(messageDeltaEvent?.payload.phase, 'final_answer');
  assert.equal(events.some((event) => event.type === 'tool.started'), true);
  assert.equal(messageCompletedEvent?.payload.phase, 'final_answer');
});
