import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  buildContextUsageSummary,
  estimateTextTokens,
  formatTokenCount,
} from '../../src/modules/ai/chat/contextBudget.ts';

test('estimateTextTokens returns zero for empty content and scales with text length', () => {
  assert.equal(estimateTextTokens(''), 0);
  assert.equal(estimateTextTokens('abcd'), 1);
  assert.equal(estimateTextTokens('abcdefgh'), 2);
});

test('formatTokenCount renders large values in compact k notation', () => {
  assert.equal(formatTokenCount(950), '950');
  assert.equal(formatTokenCount(12_400), '12.4k');
  assert.equal(formatTokenCount(200_000), '200k');
});

test('buildContextUsageSummary formats used and limit labels around the configured window', () => {
  const summary = buildContextUsageSummary(
    ['system prompt', 'user prompt', 'knowledge context'],
    DEFAULT_CONTEXT_WINDOW_TOKENS
  );

  assert.equal(summary.limitTokens, 200000);
  assert.equal(summary.limitLabel, '200k');
  assert.match(summary.usedLabel, /^\d+(\.\d+)?k$|^\d+$/);
  assert.equal(typeof summary.ratio, 'number');
});
