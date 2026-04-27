import assert from 'node:assert/strict';
import test from 'node:test';

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
