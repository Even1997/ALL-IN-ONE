import assert from 'node:assert/strict';
import test from 'node:test';

const loadMessageItem = async () =>
  import(`../../src/components/ai/gn-agent/messageTimelineOrdering.ts?test=${Date.now()}`);

test('message item keeps runtime cards interleaved with assistant narrative by timeline order', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems(
    [
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
    ],
    [
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
    ]
  );

  assert.deepEqual(
    items.map((item) => item.key),
    ['text-1', 'tool-1', 'text-2', 'tool-2']
  );
});

test('message item keeps chronological order once streaming pin is disabled', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems(
    [
      {
        key: 'text-1',
        node: null,
        createdAt: 30,
      },
    ],
    [
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
    ]
  );

  assert.deepEqual(
    items.map((item) => item.key),
    ['tool-1', 'tool-2', 'text-1']
  );
});
