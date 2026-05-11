import assert from 'node:assert/strict';
import test from 'node:test';

const loadOrdering = async () =>
  import(`../../src/components/ai/gn-agent/messageTimelineOrdering.ts?test=${Date.now()}`);

test('message timeline ordering groups contiguous thinking and bubble lanes without breaking chronology', async () => {
  const { groupMessageRenderItemsByLane } = await loadOrdering();

  const groups = groupMessageRenderItemsByLane([
    { key: 'thinking-1', node: null, createdAt: 1, laneKind: 'thinking_lane' },
    { key: 'bubble-1', node: null, createdAt: 2, laneKind: 'bubble' },
    { key: 'thinking-2', node: null, createdAt: 3, laneKind: 'thinking_lane' },
    { key: 'bubble-2', node: null, createdAt: 4, laneKind: 'bubble' },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.kind, group.items.map((item) => item.key)]),
    [
      ['thinking_lane', ['thinking-1']],
      ['bubble', ['bubble-1']],
      ['thinking_lane', ['thinking-2']],
      ['bubble', ['bubble-2']],
    ],
  );
});

test('message timeline grouping treats answer items as bubble items without changing order', async () => {
  const { groupMessageRenderItemsByLane } = await loadOrdering();

  const groups = groupMessageRenderItemsByLane([
    { key: 'thinking-1', node: null, createdAt: 1, laneKind: 'thinking_lane' },
    { key: 'answer-1', node: null, createdAt: 2, laneKind: 'answer_lane' },
    { key: 'tool-1', node: null, createdAt: 3, laneKind: 'bubble' },
    { key: 'thinking-2', node: null, createdAt: 4, laneKind: 'thinking_lane' },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.kind, group.items.map((item) => item.key)]),
    [
      ['thinking_lane', ['thinking-1']],
      ['bubble', ['answer-1', 'tool-1']],
      ['thinking_lane', ['thinking-2']],
    ],
  );
});
