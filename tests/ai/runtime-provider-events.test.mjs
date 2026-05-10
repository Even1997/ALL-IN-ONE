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
