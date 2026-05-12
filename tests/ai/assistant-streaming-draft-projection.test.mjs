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
  assert.equal(first.draft?.timeline?.[0]?.content, 'First paragraph.\n\nSecond paragraph unfinished tail');
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
      isStreaming: true,
    },
    now: 200,
  });

  assert.equal(first.draft, null);
});

test('assistant streaming draft projection clears completed drafts when earlier feedback text remains in the stored timeline', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const message = {
    id: 'assistant_feedback_handoff',
    role: 'assistant',
    createdAt: 1,
    timeline: [
      { id: 'text_feedback', kind: 'text', content: 'Checked file A.', createdAt: 2 },
      {
        id: 'tool_use_1',
        kind: 'tool_use',
        toolCallId: 'call-1',
        parentToolCallId: null,
        toolName: 'view',
        input: { file_path: 'src/App.tsx' },
        status: 'completed',
        createdAt: 3,
      },
      { id: 'text_final', kind: 'text', content: 'Final answer.', createdAt: 4 },
    ],
  };
  const projection = {
    runId: 'run_feedback_handoff',
    status: 'completed',
    cards: [],
    events: [],
    activeMessage: null,
    finalMessage: {
      messageId: 'assistant_feedback_handoff',
      text: 'Final answer.',
      completedAt: 5,
    },
  };

  const result = projectAssistantStreamingDraft({
    message,
    projection,
    previousDraft: {
      timeline: message.timeline,
      isStreaming: true,
    },
  });

  assert.equal(result.draft, null);
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
  assert.equal(result.draft?.timeline?.[0]?.content, 'Fast sidecar draft.');
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

test('assistant streaming draft projection follows projection text for the active message', async () => {
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
        text: 'Projection live text.',
        startedAt: 20,
        updatedAt: 30,
        isStreaming: true,
      },
    },
    previousDraft: undefined,
  });

  assert.equal(result.draft?.isStreaming, true);
  assert.equal(result.draft?.timeline?.[0]?.content, 'Projection live text.');
  assert.equal(result.draft?.streamingStartedAt, 20);
  assert.equal(result.draft?.streamingUpdatedAt, 30);
});

test('assistant streaming draft projection preserves earlier feedback text while replacing only the active response block', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const result = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_preserve_feedback',
      role: 'assistant',
      createdAt: 1,
      timeline: [
        { id: 'text_feedback', kind: 'text', content: 'Checked file A.', createdAt: 2 },
        {
          id: 'tool_use_1',
          kind: 'tool_use',
          toolCallId: 'call-1',
          parentToolCallId: null,
          toolName: 'view',
          input: { file_path: 'src/App.tsx' },
          status: 'completed',
          createdAt: 3,
        },
        { id: 'text_final', kind: 'text', content: 'Old final answer.', createdAt: 4 },
      ],
    },
    projection: {
      runId: 'run_preserve_feedback',
      status: 'running',
      cards: [],
      events: [],
      finalMessage: null,
      activeMessage: {
        messageId: 'assistant_preserve_feedback',
        text: 'New final answer.',
        startedAt: 20,
        updatedAt: 30,
        isStreaming: true,
      },
    },
    previousDraft: undefined,
  });

  assert.deepEqual(
    result.draft?.timeline.map((event) =>
      event.kind === 'text'
        ? [event.kind, event.id, event.content]
        : [event.kind, event.id],
    ),
    [
      ['text', 'text_feedback', 'Checked file A.'],
      ['tool_use', 'tool_use_1'],
      ['text', 'text_final', 'New final answer.'],
    ],
  );
});

test('assistant streaming draft projection no longer accepts a direct live text bypass', async () => {
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
  assert.doesNotMatch(source, /liveStreaming\?:/);
  assert.doesNotMatch(source, /draft\.streamingText/);
});
