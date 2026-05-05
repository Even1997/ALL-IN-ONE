import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatKnowledgeTagLabel,
  formatKnowledgeTagLabels,
  mergeKnowledgeSystemTags,
} from '../src/features/knowledge/model/knowledgeTagMeta.ts';

test('knowledge tag meta leaves removed wiki tags as plain text labels', () => {
  assert.equal(formatKnowledgeTagLabel('kind/wiki'), 'kind/wiki');
  assert.equal(formatKnowledgeTagLabel('kind/note'), '\u7b14\u8bb0');
  assert.equal(formatKnowledgeTagLabel('topic/onboarding'), 'topic/onboarding');
});

test('knowledge tag meta keeps unique readable labels in order', () => {
  assert.deepEqual(
    formatKnowledgeTagLabels(['kind/wiki', 'status/stale', 'kind/wiki', '']),
    ['kind/wiki', formatKnowledgeTagLabel('status/stale')]
  );
});

test('knowledge tag meta no longer backfills embedded wiki tags from doc type', () => {
  assert.deepEqual(mergeKnowledgeSystemTags([], undefined), []);
  assert.deepEqual(mergeKnowledgeSystemTags(['kind/wiki'], undefined), ['kind/wiki']);
  assert.deepEqual(mergeKnowledgeSystemTags([], 'ai-summary'), []);
});
