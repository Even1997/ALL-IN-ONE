import assert from 'node:assert/strict';
import test from 'node:test';

const loadThreadMemory = async () =>
  import(`../../src/modules/ai/runtime/memory/threadMemoryRuntime.ts?test=${Date.now()}`);

test('thread memory runtime builds thread-scoped memory entries', async () => {
  const { buildThreadMemoryEntry } = await loadThreadMemory();
  const entry = buildThreadMemoryEntry({
    id: 'thread-memory-1',
    threadId: 'thread-1',
    title: 'User preference',
    summary: 'Prefers concise replies',
    content: 'Use shorter answers by default.',
    kind: 'userPreference',
    updatedAt: 10,
  });

  assert.equal(entry.threadId, 'thread-1');
  assert.equal(entry.kind, 'userPreference');
  assert.equal(entry.label, 'userPreference');
});
