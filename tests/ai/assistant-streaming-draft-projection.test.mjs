import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadProjectionModule = async () =>
  import(`../../src/components/workspace/assistantStreamingDraftProjection.ts?test=${Date.now()}`);

test('assistant streaming draft projection is stable across identical recomputation inputs', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const message = {
    id: 'assistant_1',
    role: 'assistant',
    createdAt: 1,
    timeline: [
      { id: 'reasoning_1', kind: 'reasoning', content: 'First thought. Hidden tail', status: 'streaming', collapsed: true, createdAt: 1 },
      { id: 'text_1', kind: 'text', content: 'First paragraph.\n\nSecond paragraph unfinished tail', createdAt: 2 },
    ],
  };
  const projection = {
    runId: 'run_1',
    status: 'running',
    cards: [],
    events: [],
    finalMessage: null,
    activeMessage: {
      messageId: 'assistant_1',
      text: 'First paragraph.\n\nSecond paragraph unfinished tail',
      startedAt: 2,
      updatedAt: 3,
      isStreaming: true,
    },
  };
  const first = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: undefined,
    now: 100,
  });
  const second = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: undefined,
    now: 100,
  });

  assert.deepEqual(second, first);
  assert.equal(first.draft?.streamingText, 'First paragraph.\n\nSecond paragraph unfinished tail');
  assert.equal(
    first.draft?.streamingReasoningTextByEventId?.reasoning_1,
    'First thought. Hidden tail',
  );
});

test('assistant streaming draft projection keeps the completed answer stable after handoff', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const message = {
    id: 'assistant_final',
    role: 'assistant',
    createdAt: 1,
    timeline: [{ id: 'text_1', kind: 'text', content: 'Stored final answer.', createdAt: 2 }],
  };
  const projection = {
    runId: 'run_final',
    status: 'completed',
    cards: [],
    events: [],
    activeMessage: null,
    finalMessage: {
      messageId: 'assistant_final',
      text: 'Visible final answer.',
      completedAt: 5,
    },
  };
  const answerState = {
    rawText: 'Visible final answer.',
    visibleText: 'Visible final answer.',
    pendingText: '',
    lastFlushAt: 4,
    lastInputAt: 4,
    isComplete: false,
  };

  const first = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: {
      timeline: message.timeline,
      streamingText: 'Visible final answer.',
      isStreaming: true,
    },
    now: 200,
  });
  const second = projectAssistantStreamingDraft({
    message: {
      ...message,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Visible final answer.', createdAt: 6 }],
    },
    projection,
    previousDraft: first.draft,
    now: 201,
  });

  assert.equal(first.draft?.isStreaming, false);
  assert.equal(first.draft?.streamingText, 'Visible final answer.');
  assert.equal(second.draft, null);
});

test('assistant streaming draft projection carries active message timing while streaming', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const result = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_streaming',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Stored answer.', createdAt: 2 }],
    },
    projection: {
      runId: 'run_streaming',
      status: 'running',
      cards: [],
      events: [],
      finalMessage: null,
      activeMessage: {
        messageId: 'assistant_streaming',
        text: 'Visible answer.',
        startedAt: 20,
        updatedAt: 30,
        isStreaming: true,
      },
    },
    previousDraft: undefined,
    now: 100,
  });

  assert.equal(result.draft?.streamingStartedAt, 20);
  assert.equal(result.draft?.streamingUpdatedAt, 30);
});

test('assistant streaming draft projection removes paragraph state from the helper surface', async () => {
  const source = await readFile('src/components/workspace/assistantStreamingDraftProjection.ts', 'utf8');

  assert.doesNotMatch(source, /answerState\?:/);
  assert.doesNotMatch(source, /reasoningStateByEventId\?:/);
  assert.doesNotMatch(source, /pendingAnswerFlush/);
  assert.doesNotMatch(source, /pendingReasoningFlushEventIds/);
});
