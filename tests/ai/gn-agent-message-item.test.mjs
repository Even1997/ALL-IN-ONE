import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadMessageItem = async () =>
  import(`../../src/components/ai/gn-agent/messageTimelineOrdering.ts?test=${Date.now()}`);

test('message item keeps runtime cards interleaved with assistant narrative by timeline order', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems([
    {
      key: 'text-1',
      node: null,
      createdAt: 10,
    },
    {
      key: 'text-2',
      node: null,
      createdAt: 30,
    },
    {
      key: 'tool-1',
      node: null,
      createdAt: 20,
    },
    {
      key: 'tool-2',
      node: null,
      createdAt: 40,
    },
  ]);

  assert.deepEqual(
    items.map((item) => item.key),
    ['text-1', 'tool-1', 'text-2', 'tool-2']
  );
});

test('message item keeps chronological order once streaming pin is disabled', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems([
    {
      key: 'text-1',
      node: null,
      createdAt: 30,
    },
    {
      key: 'tool-1',
      node: null,
      createdAt: 10,
    },
    {
      key: 'tool-2',
      node: null,
      createdAt: 20,
    },
  ]);

  assert.deepEqual(
    items.map((item) => item.key),
    ['tool-1', 'tool-2', 'text-1']
  );
});

test('message item breaks same-timestamp ties with original timeline order', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems([
    {
      key: 'text-1',
      node: null,
      createdAt: 20,
      timelineOrder: 2,
    },
    {
      key: 'tool-1',
      node: null,
      createdAt: 20,
      timelineOrder: 1,
    },
  ]);

  assert.deepEqual(
    items.map((item) => item.key),
    ['tool-1', 'text-1']
  );
});

test('message item sorts answer, thinking, and runtime cards in one chronological pass', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems([
    { key: 'thinking-1', node: null, createdAt: 10, laneKind: 'thinking_lane' },
    { key: 'answer-1', node: null, createdAt: 30, laneKind: 'answer_lane' },
    { key: 'tool-1', node: null, createdAt: 20, laneKind: 'bubble' },
  ]);

  assert.deepEqual(
    items.map((item) => item.key),
    ['thinking-1', 'tool-1', 'answer-1'],
  );
});

test('embedded message list timestamps run summary cards from the latest runtime event', async () => {
  const source = await readFile('src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx', 'utf8');

  assert.match(source, /const getLatestRuntimeEventTime =/);
  assert.match(source, /createdAt:\s*latestRuntimeEventTime\s*\?\?\s*message\.createdAt/);
  assert.doesNotMatch(source, /runSummaryNode\s*\?\s*\{\s*node:\s*runSummaryNode,\s*createdAt:\s*message\.createdAt\s*\}/);
});
