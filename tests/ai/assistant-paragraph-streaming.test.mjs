import assert from 'node:assert/strict';
import test from 'node:test';

const loadModule = async () =>
  import(`../../src/components/workspace/assistantParagraphStreaming.ts?test=${Date.now()}`);

test('flushes completed sentences without waiting for final completion', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'First sentence. Half', 1000);

  assert.equal(state.visibleText, 'First sentence.');
  assert.equal(state.pendingText, ' Half');
  assert.equal(state.isComplete, false);
});

test('flushes pending content after timeout when no sentence boundary arrives', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'This is a long fragment', 1000);
  state = advanceParagraphStreamingState(state, 'This is a long fragment', 1240, { forceTimeoutFlush: true });

  assert.equal(state.visibleText, 'This is a long fragment');
  assert.equal(state.pendingText, '');
});

test('treats blank-line boundaries as paragraph flushes', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'Intro line.\n\nNext paragraph starts', 1000);

  assert.equal(state.visibleText, 'Intro line.\n\n');
  assert.equal(state.pendingText, 'Next paragraph starts');
});

test('does not flush partial fenced code blocks mid-line', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, '```ts\nconst value = 1', 1000);

  assert.equal(state.visibleText, '');
  assert.equal(state.pendingText, '```ts\nconst value = 1');
});

test('flushes all remaining content once on completion without duplicating text', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
    finalizeParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'First sentence. Half', 1000);
  state = finalizeParagraphStreamingState(state, 'First sentence. Half finished');

  assert.equal(state.visibleText, 'First sentence. Half finished');
  assert.equal(state.pendingText, '');
  assert.equal(state.isComplete, true);
});
