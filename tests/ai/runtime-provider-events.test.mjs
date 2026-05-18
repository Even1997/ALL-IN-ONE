import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { streamRuntimeProviderTurn } from '../../apps/runtime/src/nodeRuntimeProviderClient.ts';
import { pathToFileURL } from 'node:url';
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

const loadSettingsPreviewHelper = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-settings-preview-'));
  const tempFile = path.join(tempDir, 'globalSettingsPageShared.testable.mjs');
  const source = await readFile('src/components/workspace/globalSettingsPageShared.ts', 'utf8');
  const rewritten = source
    .replace("../../modules/ai/core/AIService'", "../../modules/ai/core/AIService.js'")
    .replace("../../modules/ai/providerPresets'", "../../modules/ai/providerPresets.js'")
    .replace("../../modules/ai/store/aiConfigState'", "../../modules/ai/store/aiConfigState.js'");
  const transpiled = ts.transpileModule(rewritten, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  await writeFile(tempFile, transpiled, 'utf8');
  await writeFile(
    path.join(tempDir, 'AIService.js'),
    "export {};\n",
    'utf8',
  );
  await writeFile(
    path.join(tempDir, 'providerPresets.js'),
    [
      "export const PROVIDER_PRESETS = [];",
      "export const CUSTOM_PROVIDER_PRESET = null;",
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(tempDir, 'aiConfigState.js'),
    [
      "export const normalizeAIProtocol = (provider, protocol) => {",
      "  if (provider === 'anthropic') return 'anthropic-messages';",
      "  if (protocol === 'openai-responses' || protocol === 'openai-chat-completions') return protocol;",
      "  return 'openai-chat-completions';",
      "};",
    ].join('\n'),
    'utf8',
  );
  const relinked = (await readFile(tempFile, 'utf8'))
    .replace("../../modules/ai/core/AIService.js", "./AIService.js")
    .replace("../../modules/ai/providerPresets.js", "./providerPresets.js")
    .replace("../../modules/ai/store/aiConfigState.js", "./aiConfigState.js");
  await writeFile(tempFile, relinked, 'utf8');

  try {
    const moduleUrl = `${pathToFileURL(tempFile).href}?test=${Date.now()}`;
    return await import(moduleUrl);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

test('node runtime provider client imports shared runtime provider event types', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');

  assert.match(
    source,
    /from '\.\.\/\.\.\/\.\.\/src\/modules\/ai\/runtime\/provider\/runtimeProviderEvents\.ts'/,
  );
  assert.doesNotMatch(source, /type RuntimeProviderStreamEvent =/);
});

test('shared settings expose explicit AI protocol options and endpoint previews', async () => {
  const shared = await loadSettingsPreviewHelper();

  assert.deepEqual(
    shared.AI_PROTOCOL_OPTIONS.map((option) => option.value),
    ['anthropic-messages', 'openai-chat-completions', 'openai-responses'],
  );

  assert.equal(
    shared.buildProviderEndpointPreview('anthropic', 'https://api.anthropic.com/v1', 'anthropic-messages'),
    'https://api.anthropic.com/v1/messages',
  );
  assert.equal(
    shared.buildProviderEndpointPreview('openai-compatible', 'https://api.openai.com/v1', 'openai-responses'),
    'https://api.openai.com/v1/responses',
  );
  assert.equal(
    shared.buildProviderEndpointPreview('openai-compatible', 'https://api.openai.com/v1', 'openai-chat-completions'),
    'https://api.openai.com/v1/chat/completions',
  );
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

test('openai official responses streaming maps reasoning summary and answer text into runtime events', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return createSseResponse([
      toSseFrame({ type: 'response.reasoning_summary_text.delta', delta: 'Inspect files first. ' }),
      toSseFrame({ type: 'response.output_text.delta', delta: 'Done reviewing.' }),
      toSseFrame({ type: 'response.completed' }),
    ]);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect the repo.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, 'Done reviewing.');
    assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
    assert.deepEqual(
      events
        .filter((event) => event.kind === 'thinking' || event.kind === 'text')
        .map((event) => [event.kind, event.delta]),
      [
        ['thinking', 'Inspect files first. '],
        ['text', 'Done reviewing.'],
      ],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official responses streaming maps function-call items into runtime tool events', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return createSseResponse([
      toSseFrame({
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_resp_1',
          name: 'view',
          arguments: '{"path":"README.md"}',
        },
      }),
      toSseFrame({ type: 'response.completed' }),
    ]);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect README.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_resp_1', name: 'view', input: { path: 'README.md' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official responses streaming does not emit duplicate tool calls when added and done repeat the same call', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return createSseResponse([
      toSseFrame({
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_resp_dedupe',
          name: 'view',
          arguments: '{"path":"README.md"}',
        },
      }),
      toSseFrame({
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'call_resp_dedupe',
          name: 'view',
          arguments: '{"path":"README.md"}',
        },
      }),
      toSseFrame({ type: 'response.completed' }),
    ]);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect README once.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_resp_dedupe', name: 'view', input: { path: 'README.md' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official responses streaming assembles streamed function-call arguments before emitting one tool event', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return createSseResponse([
      toSseFrame({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: 'fc_item_1',
          type: 'function_call',
          call_id: 'call_resp_streamed',
          name: 'view',
          arguments: '',
        },
      }),
      toSseFrame({
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_item_1',
        output_index: 0,
        delta: '{"path":"src/',
      }),
      toSseFrame({
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_item_1',
        output_index: 0,
        delta: 'index.ts"}',
      }),
      toSseFrame({
        type: 'response.function_call_arguments.done',
        item_id: 'fc_item_1',
        output_index: 0,
        arguments: '{"path":"src/index.ts"}',
      }),
      toSseFrame({ type: 'response.completed' }),
    ]);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect src/index.ts.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_resp_streamed', name: 'view', input: { path: 'src/index.ts' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official responses JSON fallback returns assistant text for non-SSE success responses', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'JSON fallback answer',
              },
            ],
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
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Return the non-streaming answer.',
      systemPrompt: 'system',
    });

    assert.equal(finalText, 'JSON fallback answer');
    assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official route does not fall back to chat completions for generic 400 responses errors', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'https://api.openai.com/v1/responses') {
      return new Response(
        JSON.stringify({
          error: {
            message: 'invalid_request_error: bad tool schema',
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    throw new Error(`Unexpected fallback fetch URL: ${url}`);
  };

  try {
    await assert.rejects(
      () =>
        streamRuntimeProviderTurn({
          runtimeConfig: {
            provider: 'openai-compatible',
            protocol: 'openai-responses',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'test-key',
            model: 'gpt-5',
          },
          prompt: 'Do not mask request errors.',
          systemPrompt: 'system',
        }),
      /OpenAI Responses API error \(400\)/,
    );
    assert.deepEqual(requestedUrls, ['https://api.openai.com/v1/responses']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai official route falls back from responses to chat completions when responses is unavailable', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url === 'https://api.openai.com/v1/chat/completions') {
      return createSseResponse([
        toSseFrame({ choices: [{ delta: { content: 'Fallback answer' } }] }),
        toSseFrame('[DONE]'),
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        protocol: 'openai-responses',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Fallback if needed.',
      systemPrompt: 'system',
    });

    assert.equal(finalText, 'Fallback answer');
    assert.deepEqual(requestedUrls, [
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/chat/completions',
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

test('settings endpoint preview follows the explicitly selected protocol', async () => {
  const { buildProviderEndpointPreview } = await loadSettingsPreviewHelper();

  assert.equal(
    buildProviderEndpointPreview('openai-compatible', 'https://api.openai.com/v1', 'openai-responses'),
    'https://api.openai.com/v1/responses',
  );
});
