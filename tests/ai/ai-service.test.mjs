import assert from 'node:assert/strict';
import test from 'node:test';

import { aiService } from '../../src/modules/ai/core/AIService.ts';

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
