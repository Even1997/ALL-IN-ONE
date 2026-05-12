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

test('assistant streaming draft projection clears completed answer drafts after handoff', async () => {
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

  assert.equal(first.draft, null);
});

test('assistant streaming draft projection uses canonical timeline text while active projection text is empty', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const result = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_sidecar_active',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Fast sidecar draft.', createdAt: 2 }],
    },
    projection: {
      runId: 'run_sidecar_active',
      status: 'running',
      cards: [],
      events: [],
      finalMessage: null,
      activeMessage: {
        messageId: 'assistant_sidecar_active',
        text: '',
        startedAt: 10,
        updatedAt: 10,
        isStreaming: true,
      },
    },
    previousDraft: undefined,
  });

  assert.equal(result.draft?.isStreaming, true);
  assert.equal(result.draft?.streamingText, 'Fast sidecar draft.');
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

test('assistant streaming draft projection prefers direct live streaming text for the active message', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const result = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_live',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Persisted slower text.', createdAt: 2 }],
    },
    projection: {
      runId: 'run_live',
      status: 'running',
      cards: [],
      events: [],
      finalMessage: null,
      activeMessage: {
        messageId: 'assistant_live',
        text: '',
        startedAt: 20,
        updatedAt: 30,
        isStreaming: true,
      },
    },
    liveStreaming: {
      messageId: 'assistant_live',
      text: 'Direct live text.',
      updatedAt: 40,
    },
    previousDraft: undefined,
  });

  assert.equal(result.draft?.isStreaming, true);
  assert.equal(result.draft?.streamingText, 'Direct live text.');
  assert.equal(result.draft?.streamingStartedAt, 20);
  assert.equal(result.draft?.streamingUpdatedAt, 40);
});

test('assistant streaming draft projection does not leak direct live text into older assistant messages', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const result = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_older',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Older persisted answer.', createdAt: 2 }],
    },
    projection: {
      runId: 'run_older',
      status: 'completed',
      cards: [],
      events: [],
      finalMessage: {
        messageId: 'assistant_older',
        text: 'Older persisted answer.',
        completedAt: 50,
      },
      activeMessage: null,
    },
    liveStreaming: {
      messageId: 'assistant_newer',
      text: 'Newer active text.',
      updatedAt: 60,
    },
    previousDraft: undefined,
  });

  assert.equal(result.draft, null);
});

test('assistant streaming draft projection removes paragraph state from the helper surface', async () => {
  const source = await readFile('src/components/workspace/assistantStreamingDraftProjection.ts', 'utf8');

  assert.doesNotMatch(source, /answerState\?:/);
  assert.doesNotMatch(source, /reasoningStateByEventId\?:/);
  assert.doesNotMatch(source, /pendingAnswerFlush/);
  assert.doesNotMatch(source, /pendingReasoningFlushEventIds/);
});
