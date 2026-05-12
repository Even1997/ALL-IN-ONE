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
  const answerState = {
    rawText: '',
    visibleText: '',
    pendingText: '',
    lastFlushAt: null,
    lastInputAt: null,
    isComplete: false,
  };
  const reasoningStateByEventId = {
    reasoning_1: {
      rawText: '',
      visibleText: '',
      pendingText: '',
      lastFlushAt: null,
      lastInputAt: null,
      isComplete: false,
    },
  };

  const first = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: undefined,
    answerState,
    reasoningStateByEventId,
    now: 100,
  });
  const second = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: undefined,
    answerState,
    reasoningStateByEventId,
    now: 100,
  });

  assert.deepEqual(second, first);
  assert.deepEqual(answerState, {
    rawText: '',
    visibleText: '',
    pendingText: '',
    lastFlushAt: null,
    lastInputAt: null,
    isComplete: false,
  });
  assert.deepEqual(reasoningStateByEventId.reasoning_1, {
    rawText: '',
    visibleText: '',
    pendingText: '',
    lastFlushAt: null,
    lastInputAt: null,
    isComplete: false,
  });
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
    answerState,
    reasoningStateByEventId: {},
    now: 200,
  });
  const second = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: first.draft,
    answerState: first.answerState,
    reasoningStateByEventId: first.reasoningStateByEventId,
    now: 201,
  });

  assert.equal(first.draft?.isStreaming, false);
  assert.equal(first.draft?.streamingText, 'Visible final answer.');
  assert.equal(second.draft?.streamingText, 'Visible final answer.');
  assert.equal(second.answerState?.isComplete, true);
});

test('assistant streaming draft projection removes unused forced flush parameters from the helper surface', async () => {
  const source = await readFile('src/components/workspace/assistantStreamingDraftProjection.ts', 'utf8');

  assert.doesNotMatch(source, /forceAnswerFlush\?: boolean;/);
  assert.doesNotMatch(source, /forceReasoningFlushEventIds\?: string\[];/);
  assert.doesNotMatch(source, /forceAnswerFlush = false/);
  assert.doesNotMatch(source, /forceReasoningFlushEventIds = \[\]/);
});
