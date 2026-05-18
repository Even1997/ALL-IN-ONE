import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { aiService } from '../../src/modules/ai/core/AIService.ts';

const encoder = new TextEncoder();

const createStreamResponse = (chunks) =>
  new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    }
  );

test('chat rejects requests when no api key is configured', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: '',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  });

  await assert.rejects(() => aiService.chat('hello'), /not configured|配置/i);
});

test('anthropic model list falls back to the configured model', async () => {
  aiService.setConfig({
    provider: 'anthropic',
    apiKey: 'sk-ant-test',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
  });

  const models = await aiService.listModels();
  assert.deepEqual(models, ['claude-sonnet-4-5']);
});

test('testConnection reports configuration errors when the model is missing', async () => {
  const result = await aiService.testConnection({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://openrouter.ai/api/v1',
    model: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /configure|配置/i);
});

test('testConnection falls back to a lightweight chat probe when model listing is unavailable', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'http://localhost:8080',
    model: 'gpt-5.4',
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return new Response('not found', { status: 404 });
    }

    if (url.endsWith('/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'OK',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await aiService.testConnection();
    assert.equal(result.ok, true);
    assert.match(result.message, /gpt-5\.4/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listModels falls back to /v1 when the root endpoint returns the site shell', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'http://localhost:8080',
    model: 'gpt-5.4',
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://localhost:8080/models') {
      return new Response('<!doctype html><html><body>site shell</body></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    if (url === 'http://localhost:8080/v1/models') {
      return new Response(
        JSON.stringify({
          data: [{ id: 'gpt-5.4' }],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const models = await aiService.listModels();
    assert.deepEqual(models, ['gpt-5.4']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chat falls back to /v1 chat completions when the root endpoint returns the site shell', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'http://localhost:8080',
    model: 'gpt-5.4',
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://localhost:8080/chat/completions') {
      return new Response('<!doctype html><html><body>site shell</body></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    if (url === 'http://localhost:8080/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'OK from /v1',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await aiService.chat('hello');
    assert.equal(result, 'OK from /v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText streams openai-compatible thinking and answer deltas separately', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
  });

  const originalFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createStreamResponse([
      'data: {"choices":[{"delta":{"reasoning":"Inspect files first. "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Final "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
      onEvent: (event) => events.push(event),
    });

    assert.equal(result, 'Final answer');
    assert.deepEqual(
      events.map((event) => [event.kind, event.delta]),
      [
        ['thinking', 'Inspect files first. '],
        ['text', 'Final '],
        ['text', 'answer'],
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText sends OpenAI-compatible tool declarations with auto tool choice', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
  });

  const originalFetch = globalThis.fetch;
  let lastBody = null;
  let lastHeaders = null;

  globalThis.fetch = async (_input, init) => {
    lastBody = JSON.parse(String(init?.body));
    lastHeaders = init?.headers || {};
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
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  };

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
    });

    assert.equal(result, 'Ready');
    assert.equal(Array.isArray(lastBody?.tools), true);
    assert.equal(lastBody.tools.some((tool) => tool?.function?.name === 'view'), true);
    assert.equal(lastBody.tool_choice, 'auto');
    assert.equal(lastHeaders['Content-Type'], 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('agent chat stage no longer depends on ClaudeRuntime or CodexRuntime shells', async () => {
  const source = await readFile(
    'src/features/agent-shell/components/AgentChatStage.tsx',
    'utf8',
  );

  assert.doesNotMatch(source, /ClaudeRuntime/);
  assert.doesNotMatch(source, /CodexRuntime/);
});

test('completeText returns parseable OpenAI-compatible tool calls for non-streaming responses', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
  });

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'view',
                    arguments: '{"file_path":"src/app.ts"}',
                  },
                },
              ],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
    });

    const parsed = JSON.parse(result);
    const toolCall = parsed.tool_calls[0];
    assert.equal(toolCall.function.name, 'view');
    assert.deepEqual(JSON.parse(toolCall.function.arguments), { file_path: 'src/app.ts' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText streams OpenAI-compatible native tool calls as structured events', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
  });

  const originalFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createStreamResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"view","arguments":"{\\"file_path\\":\\"src/"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"app.ts\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
      onEvent: (event) => events.push(event),
    });

    assert.equal(result, '');
    assert.deepEqual(events, [
      {
        kind: 'tool_call',
        delta: '',
        toolCall: {
          id: 'call_1',
          name: 'view',
          input: { file_path: 'src/app.ts' },
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText streams anthropic thinking and answer deltas separately', async () => {
  aiService.setConfig({
    provider: 'anthropic',
    apiKey: 'sk-ant-test',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-test',
  });

  const originalFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createStreamResponse([
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Check project state. "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Streamed "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"reply"}}\n\n',
    ]);

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
      onEvent: (event) => events.push(event),
    });

    assert.equal(result, 'Streamed reply');
    assert.deepEqual(
      events.map((event) => [event.kind, event.delta]),
      [
        ['thinking', 'Check project state. '],
        ['text', 'Streamed '],
        ['text', 'reply'],
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText streams anthropic tool_use blocks as structured tool_call events', async () => {
  aiService.setConfig({
    provider: 'anthropic',
    apiKey: 'sk-ant-test',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-test',
  });

  const originalFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createStreamResponse([
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"I will inspect."}}\n\n',
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"view","input":{}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"src/app.ts\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
    ]);

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
      onEvent: (event) => events.push(event),
    });

    assert.equal(result, 'I will inspect.');
    assert.deepEqual(events, [
      { kind: 'text', delta: 'I will inspect.' },
      {
        kind: 'tool_call',
        delta: '',
        toolCall: {
          id: 'toolu_1',
          name: 'view',
          input: { file_path: 'src/app.ts' },
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeMessages sends structured runtime messages without flattening them into one prompt string', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
  });

  const originalFetch = globalThis.fetch;
  let lastBody = null;

  globalThis.fetch = async (_input, init) => {
    lastBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Done.',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  };

  try {
    const result = await aiService.completeMessages({
      systemPrompt: 'system',
      messages: [
        { kind: 'user', role: 'user', content: 'Inspect the app file.' },
        {
          kind: 'assistant_tool_call',
          role: 'assistant',
          content: '',
          toolCallId: 'call_1',
          toolName: 'view',
          input: { file_path: 'src/app.ts' },
        },
        {
          kind: 'tool_result',
          role: 'tool',
          content: '1: console.log("app");',
          toolCallId: 'call_1',
          toolName: 'view',
        },
      ],
    });

    assert.equal(result, 'Done.');
    assert.equal(Array.isArray(lastBody?.messages), true);
    assert.equal(lastBody.messages[0]?.role, 'system');
    assert.equal(lastBody.messages[1]?.role, 'user');
    assert.equal(lastBody.messages[2]?.role, 'assistant');
    assert.equal(Array.isArray(lastBody.messages[2]?.tool_calls), true);
    assert.equal(lastBody.messages[3]?.role, 'tool');
    assert.equal(lastBody.messages[3]?.tool_call_id, 'call_1');
    assert.doesNotMatch(JSON.stringify(lastBody.messages), /assistant:\n|user:\n|Tool view result:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeMessages sends anthropic structured tool turns with native tool_result blocks', async () => {
  aiService.setConfig({
    provider: 'anthropic',
    apiKey: 'sk-ant-test',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-test',
  });

  const originalFetch = globalThis.fetch;
  let lastBody = null;

  globalThis.fetch = async (_input, init) => {
    lastBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text: 'Done.' }],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  };

  try {
    const result = await aiService.completeMessages({
      systemPrompt: 'system',
      messages: [
        { kind: 'user', role: 'user', content: 'Inspect the app file.' },
        {
          kind: 'assistant_tool_call',
          role: 'assistant',
          content: '',
          toolCallId: 'toolu_1',
          toolName: 'view',
          input: { file_path: 'src/app.ts' },
        },
        {
          kind: 'tool_result',
          role: 'tool',
          content: '1: console.log("app");',
          toolCallId: 'toolu_1',
          toolName: 'view',
        },
      ],
    });

    assert.equal(result, 'Done.');
    assert.equal(Array.isArray(lastBody?.messages), true);
    assert.deepEqual(lastBody.messages, [
      {
        role: 'user',
        content: 'Inspect the app file.',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'view',
            input: { file_path: 'src/app.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '1: console.log("app");',
          },
        ],
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeText uses explicit OpenAI Responses API protocol when configured', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    protocol: 'openai-responses',
    apiKey: 'sk-test',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5',
  });

  const originalFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return createStreamResponse([
      'data: {"type":"response.reasoning_summary_text.delta","delta":"Inspect files first. "}\n\n',
      'data: {"type":"response.output_text.delta","delta":"Done reviewing."}\n\n',
      'data: {"type":"response.completed"}\n\n',
    ]);
  };

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
      onEvent: (event) => events.push(event),
    });

    assert.equal(result, 'Done reviewing.');
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
    globalThis.fetch = originalFetch;
  }
});

test('completeText falls back from OpenAI Responses API to chat completions only when responses is unavailable', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    protocol: 'openai-responses',
    apiKey: 'sk-test',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5',
  });

  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);

    if (url === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    if (url === 'https://api.openai.com/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Fallback answer',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await aiService.completeText({
      systemPrompt: 'system',
      prompt: 'prompt',
    });

    assert.equal(result, 'Fallback answer');
    assert.deepEqual(requests, [
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/chat/completions',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
