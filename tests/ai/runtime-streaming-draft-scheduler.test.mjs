import assert from 'node:assert/strict';
import test from 'node:test';

test('runtime streaming assembler can append chunks without building a draft until flush', async () => {
  const { createRuntimeStreamingMessageAssembler } = await import(
    `../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts?test=${Date.now()}`
  );

  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.appendChunk({ kind: 'text', delta: 'Hel' });
  assembler.appendChunk({ kind: 'text', delta: 'lo' });

  const draft = assembler.buildDraft(false);

  assert.equal(draft.answerContent, 'Hello');
  assert.equal(draft.content, 'Hello');
  assert.equal(draft.assistantParts.length, 1);
  assert.equal(draft.assistantParts[0].content, 'Hello');
});

test('runtime streaming draft scheduler flushes only the latest pending draft', async () => {
  const { createRuntimeStreamingDraftScheduler } = await import(
    `../../src/modules/ai/runtime/orchestration/runtimeStreamingDraftScheduler.ts?test=${Date.now()}`
  );

  const applied = [];
  const scheduled = [];
  const scheduler = createRuntimeStreamingDraftScheduler({
    scheduleFlush: (flush) => {
      scheduled.push(flush);
      return () => {};
    },
    applyDraft: async (active) => {
      applied.push(active);
    },
  });

  scheduler.push(false);
  scheduler.push(true);

  assert.deepEqual(applied, []);
  assert.equal(scheduled.length, 1);

  await scheduled[0]();

  assert.deepEqual(applied, [true]);
});
