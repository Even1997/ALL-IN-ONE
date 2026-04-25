import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAIConfigEntry,
  getEnabledAIConfigs,
  hasUsableAIConfigEntry,
  resolveSelectedAIConfigId,
} from '../../src/modules/ai/store/aiConfigState.ts';

test('hasUsableAIConfigEntry requires provider, api key, and model', () => {
  assert.equal(
    hasUsableAIConfigEntry(
      createAIConfigEntry({
        provider: 'openai-compatible',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      })
    ),
    true
  );

  assert.equal(
    hasUsableAIConfigEntry(
      createAIConfigEntry({
        provider: 'openai-compatible',
        apiKey: '',
        model: 'gpt-4o-mini',
      })
    ),
    false
  );
});

test('resolveSelectedAIConfigId keeps the previous enabled config', () => {
  const openai = createAIConfigEntry({ id: 'openai', enabled: true, apiKey: 'sk-1', model: 'gpt-4o-mini' });
  const anthropic = createAIConfigEntry({
    id: 'anthropic',
    provider: 'anthropic',
    enabled: true,
    apiKey: 'sk-ant-1',
    model: 'claude-sonnet-4-5',
  });

  assert.equal(resolveSelectedAIConfigId([openai, anthropic], 'anthropic'), 'anthropic');
});

test('resolveSelectedAIConfigId falls back to the first enabled config when previous selection is disabled', () => {
  const openai = createAIConfigEntry({ id: 'openai', enabled: true, apiKey: 'sk-1', model: 'gpt-4o-mini' });
  const anthropic = createAIConfigEntry({
    id: 'anthropic',
    provider: 'anthropic',
    enabled: false,
    apiKey: 'sk-ant-1',
    model: 'claude-sonnet-4-5',
  });

  assert.equal(resolveSelectedAIConfigId([openai, anthropic], 'anthropic'), 'openai');
});

test('getEnabledAIConfigs only returns enabled configs that are fully configured', () => {
  const enabled = createAIConfigEntry({ id: 'enabled', enabled: true, apiKey: 'sk-1', model: 'gpt-4o-mini' });
  const disabled = createAIConfigEntry({ id: 'disabled', enabled: false, apiKey: 'sk-2', model: 'gpt-4.1-mini' });
  const incomplete = createAIConfigEntry({ id: 'incomplete', enabled: true, apiKey: '', model: 'gpt-4.1-mini' });

  assert.deepEqual(
    getEnabledAIConfigs([enabled, disabled, incomplete]).map((item) => item.id),
    ['enabled']
  );
});
