import assert from 'node:assert/strict';
import test from 'node:test';

test('streaming text reveal advances toward target in small readable steps', async () => {
  const { advanceStreamingText } = await import(
    `../../src/components/workspace/streamingTextReveal.ts?test=${Date.now()}`
  );

  assert.equal(advanceStreamingText('', 'Hello world', 5), 'Hello');
  assert.equal(advanceStreamingText('Hello', 'Hello world', 5), 'Hello ');
  assert.equal(advanceStreamingText('Hello ', 'Hello world', 5), 'Hello world');
});

test('streaming text reveal controller preserves append-only flow and resyncs rewrites', async () => {
  const { createStreamingTextRevealController } = await import(
    `../../src/components/workspace/streamingTextReveal.ts?test=${Date.now()}`
  );

  const controller = createStreamingTextRevealController({
    minAdvance: 4,
    maxAdvance: 18,
    baseCharsPerSecond: 120,
    backlogBoostFactor: 0.2,
  });
  controller.setTarget('Streaming answer');

  assert.equal(controller.tick(0), true);
  assert.equal(controller.getVisible(), 'Stre');

  controller.setTarget('Streaming answer now');
  assert.equal(controller.tick(100), true);
  assert.ok(controller.getVisible().length >= 'Streamin'.length);

  controller.setTarget('Final answer');
  assert.equal(controller.getVisible(), '');
  assert.equal(controller.tick(200), true);
  assert.equal(controller.getVisible(), 'Fina');
});

test('streaming text reveal controller catches up faster after delayed frames', async () => {
  const { createStreamingTextRevealController } = await import(
    `../../src/components/workspace/streamingTextReveal.ts?test=${Date.now()}`
  );

  const controller = createStreamingTextRevealController({
    minAdvance: 3,
    maxAdvance: 24,
    baseCharsPerSecond: 180,
    backlogBoostFactor: 0.2,
  });

  controller.setTarget('This is a much longer streamed answer');

  assert.equal(controller.tick(0), true);
  const firstVisibleLength = controller.getVisible().length;

  assert.equal(controller.tick(100), true);
  const secondVisibleLength = controller.getVisible().length;

  assert.ok(firstVisibleLength >= 3);
  assert.ok(secondVisibleLength - firstVisibleLength >= 12);
});
