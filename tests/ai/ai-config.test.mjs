import assert from 'node:assert/strict';

import {
  buildAIConfigurationError,
  hasUsableAIConfiguration,
  listModelsSupportMode,
} from '../../dist-test/modules/ai/core/configStatus.js';
import { chooseNextWorkflowPackage } from '../../dist-test/modules/ai/workflow/chatWorkflowRouting.js';
import { buildAIStatusCards } from '../../dist-test/modules/ai/workflow/statusSummary.js';

assert.equal(
  hasUsableAIConfiguration({
    provider: 'openai-compatible',
    apiKey: '',
    model: 'openai/gpt-4o-mini',
  }),
  false
);

assert.equal(
  hasUsableAIConfiguration({
    provider: 'openai-compatible',
    apiKey: 'sk-test',
    model: 'openai/gpt-4o-mini',
  }),
  true
);

assert.equal(
  hasUsableAIConfiguration({
    provider: 'anthropic',
    apiKey: 'sk-ant-test',
    model: '',
  }),
  false
);

assert.match(buildAIConfigurationError().message, /configure|配置/i);

assert.equal(listModelsSupportMode('openai-compatible'), 'remote-list');
assert.equal(listModelsSupportMode('anthropic'), 'preset-only');

assert.equal(
  chooseNextWorkflowPackage({
    hasRequirementsSpec: false,
    hasFeatureTree: false,
    hasPageStructure: false,
    hasWireframes: false,
  }),
  'requirements'
);

assert.equal(
  chooseNextWorkflowPackage({
    hasRequirementsSpec: true,
    hasFeatureTree: true,
    hasPageStructure: false,
    hasWireframes: false,
  }),
  'prototype'
);

assert.equal(
  chooseNextWorkflowPackage({
    hasRequirementsSpec: true,
    hasFeatureTree: true,
    hasPageStructure: true,
    hasWireframes: true,
  }),
  'page'
);

const cards = buildAIStatusCards('做一个需求管理后台', {
  status: 'awaiting_confirmation',
  error: undefined,
  stageSummaries: {
    requirements_spec: '已经整理出需求说明书',
  },
});

assert.equal(cards[0].title, '最新输入');
assert.equal(cards[1].tone, 'warning');
assert.match(cards[2].content, /requirements_spec/);

console.log('ai-config tests passed');
