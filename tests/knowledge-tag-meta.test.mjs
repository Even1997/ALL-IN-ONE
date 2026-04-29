import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  formatKnowledgeTagLabel,
  formatKnowledgeTagLabels,
  mergeKnowledgeSystemTags,
} from '../src/features/knowledge/model/knowledgeTagMeta.ts';

test('knowledge tag meta maps system tags to readable labels', () => {
  assert.equal(formatKnowledgeTagLabel('kind/wiki'), '系统索引');
  assert.equal(formatKnowledgeTagLabel('topic/onboarding'), 'topic/onboarding');
});

test('knowledge tag meta keeps unique readable labels in order', () => {
  assert.deepEqual(
    formatKnowledgeTagLabels(['kind/wiki', 'status/stale', 'kind/wiki', '']),
    ['系统索引', formatKnowledgeTagLabel('status/stale')]
  );
});

test('knowledge tag meta backfills wiki tags from inferred doc type', () => {
  assert.deepEqual(mergeKnowledgeSystemTags([], 'wiki-index'), ['kind/wiki']);
  assert.deepEqual(mergeKnowledgeSystemTags(['kind/wiki'], 'wiki-index'), ['kind/wiki']);
  assert.deepEqual(mergeKnowledgeSystemTags([], 'ai-summary'), []);
});

test('knowledge note workspace formats selected note tags through tag meta helper', async () => {
  const source = await readFile(
    new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /formatKnowledgeTagLabels/);
  assert.match(source, /selectedNoteTagLabels/);
  assert.match(source, /selectedNoteTagLabels\.join\(' \/ '\)/);
});
