import assert from 'node:assert/strict';
import test from 'node:test';

const loadAssistantTimeline = async () =>
  import(`../../src/modules/ai/store/assistantTimeline.ts?test=${Date.now()}`);

test('assistant timeline update preserves runtime events while replacing text and reasoning parts', async () => {
  const {
    buildAssistantTimelineUpdate,
    getAssistantRuntimeTimelineEvents,
  } = await loadAssistantTimeline();

  const timeline = buildAssistantTimelineUpdate('<think>Check files</think>\n\nInitial answer', [
    {
      id: 'approval-1',
      kind: 'approval',
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      actionType: 'bash',
      summary: 'Run command',
      riskLevel: 'high',
      status: 'pending',
      createdAt: 20,
    },
  ]);

  assert.equal(timeline.some((event) => event.kind === 'reasoning'), true);
  assert.equal(timeline.some((event) => event.kind === 'text'), true);
  assert.equal(timeline.some((event) => event.kind === 'approval'), true);
  assert.equal(getAssistantRuntimeTimelineEvents(timeline).length, 1);
});

test('assistant timeline helpers upsert tool events without dropping existing text', async () => {
  const {
    buildAssistantTimelineFromContent,
    upsertAssistantRuntimeToolUseEvent,
    upsertAssistantRuntimeToolResultEvent,
  } = await loadAssistantTimeline();

  const initial = buildAssistantTimelineFromContent('Ready.');
  const withToolUse = upsertAssistantRuntimeToolUseEvent(initial, {
    toolCallId: 'call-1',
    toolName: 'view',
    toolInput: { file_path: 'src/App.tsx' },
    status: 'running',
  });
  const withToolResult = upsertAssistantRuntimeToolResultEvent(withToolUse, {
    toolCallId: 'call-1',
    toolName: 'view',
    status: 'completed',
    output: 'file content',
  });

  assert.deepEqual(
    withToolResult.map((event) => event.kind),
    ['text', 'tool_use', 'tool_result'],
  );
  assert.equal(withToolResult[0].content, 'Ready.');
});

test('assistant timeline helpers update approval and question state in place', async () => {
  const {
    answerAssistantRuntimeQuestionEvent,
    upsertAssistantRuntimeApprovalEvent,
    upsertAssistantRuntimeQuestionEvent,
  } = await loadAssistantTimeline();

  const withApproval = upsertAssistantRuntimeApprovalEvent([], {
    id: 'approval-event',
    kind: 'approval',
    approvalId: 'approval-1',
    toolCallId: 'call-1',
    actionType: 'edit',
    summary: 'Edit file',
    riskLevel: 'medium',
    status: 'pending',
    createdAt: 10,
  });
  const withQuestion = upsertAssistantRuntimeQuestionEvent(withApproval, {
    id: 'question-event',
    kind: 'question',
    questionId: 'question-1',
    payload: {
      id: 'question-1',
      toolCallId: 'call-2',
      status: 'pending',
      questions: [{ question: 'Which file?' }],
      createdAt: 11,
    },
    createdAt: 11,
  });
  const answered = answerAssistantRuntimeQuestionEvent(withQuestion, 'question-1', {
    'Which file?': 'src/App.tsx',
  });

  assert.equal(answered[0].kind, 'approval');
  assert.equal(answered[1].kind, 'question');
  assert.equal(answered[1].payload.status, 'answered');
  assert.equal(answered[1].payload.answers['Which file?'], 'src/App.tsx');
});

test('assistant streaming timeline keeps runtime events from the base timeline', async () => {
  const {
    buildAssistantStreamingTimeline,
    getAssistantRuntimeTimelineEvents,
  } = await loadAssistantTimeline();

  const baseTimeline = [
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'bash',
      input: { command: 'npm run build' },
      status: 'running',
      createdAt: 40,
    },
  ];

  const draftTimeline = buildAssistantStreamingTimeline('<think>Thinking</think>\n\nDraft answer', baseTimeline);

  assert.equal(draftTimeline.some((event) => event.kind === 'reasoning'), true);
  assert.equal(draftTimeline.some((event) => event.kind === 'text'), true);
  assert.equal(draftTimeline.some((event) => event.kind === 'tool_use'), true);
  assert.equal(getAssistantRuntimeTimelineEvents(draftTimeline).length, 1);
  assert.equal(getAssistantRuntimeTimelineEvents(draftTimeline)[0].toolName, 'bash');
});

test('assistant timeline update preserves narrative timestamps across streaming rebuilds', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const currentTimeline = [
    {
      id: 'reasoning-1',
      kind: 'reasoning',
      content: 'Check the first file.',
      collapsed: true,
      createdAt: 10,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 20,
    },
    {
      id: 'text-1',
      kind: 'text',
      content: 'The first check is done.',
      createdAt: 30,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'next' },
      status: 'running',
      createdAt: 40,
    },
  ];

  const updatedTimeline = buildAssistantTimelineUpdate(
    '<think>Check the first file again</think>\n\nThe first check is still done.',
    currentTimeline,
  );

  const reasoningEvent = updatedTimeline.find((event) => event.kind === 'reasoning');
  const textEvent = updatedTimeline.find((event) => event.kind === 'text');

  assert.equal(reasoningEvent?.createdAt, 10);
  assert.equal(textEvent?.createdAt, 30);
});

test('assistant timeline update preserves preferred narrative timestamps around tool boundaries', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const currentTimeline = [
    {
      id: 'text-1',
      kind: 'text',
      content: 'Started the first step.',
      createdAt: 30,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'write',
      input: { file_path: 'PRD.md' },
      status: 'completed',
      createdAt: 40,
    },
  ];

  const updatedTimeline = buildAssistantTimelineUpdate(
    'Finished the second step.',
    currentTimeline,
    {
      preferredAssistantParts: [
        { type: 'text', content: 'Started the first step.', createdAt: 30 },
        { type: 'text', content: 'Finished the second step.', createdAt: 50 },
      ],
    },
  );

  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.createdAt]),
    [
      ['text', 30],
      ['tool_use', 40],
      ['text', 50],
    ],
  );
});

test('assistant timeline update keeps preferred text segments around tool boundaries when final text merges them', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const currentTimeline = [
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'package.json' },
      status: 'completed',
      createdAt: 20,
    },
  ];

  const updatedTimeline = buildAssistantTimelineUpdate(
    'Let me inspect the project structure.',
    currentTimeline,
    {
      preferredAssistantParts: [
        { type: 'text', content: 'Let me inspect', createdAt: 10 },
        { type: 'text', content: 'the project structure.', createdAt: 30 },
      ],
    },
  );

  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.content, event.createdAt]),
    [
      ['text', 'Let me inspect', 10],
      ['tool_use', undefined, 20],
      ['text', 'the project structure.', 30],
    ],
  );
});

test('assistant timeline update preserves preferred streaming parts while the think tag is still open', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const updatedTimeline = buildAssistantTimelineUpdate(
    '<think>Check the first file.\n\nDraft answer',
    [],
    {
      preferredAssistantParts: [
        { type: 'thinking', content: 'Check the first file.', collapsed: true, createdAt: 10 },
        { type: 'text', content: 'Draft answer', createdAt: 20 },
      ],
    },
  );

  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.content, event.createdAt]),
    [
      ['reasoning', 'Check the first file.', 10],
      ['text', 'Draft answer', 20],
    ],
  );
});

test('assistant timeline update prefers explicit preferred timestamps over stale narrative buckets', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const currentTimeline = [
    {
      id: 'reasoning-1',
      kind: 'reasoning',
      content: 'Check the first file.',
      collapsed: true,
      createdAt: 10,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 20,
    },
    {
      id: 'text-1',
      kind: 'text',
      content: 'The first check is done.',
      createdAt: 30,
    },
  ];

  const updatedTimeline = buildAssistantTimelineUpdate(
    '<think>Check the first file again</think>\n\nThe first check is still done.',
    currentTimeline,
    {
      preferredAssistantParts: [
        { type: 'thinking', content: 'Check the first file again', collapsed: true, createdAt: 100 },
        { type: 'text', content: 'The first check is still done.', createdAt: 110 },
      ],
    },
  );

  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.createdAt]),
    [
      ['tool_use', 20],
      ['reasoning', 100],
      ['text', 110],
    ],
  );
});

test('assistant timeline update prefers structured narrative parts over legacy execution parsing', async () => {
  const { buildAssistantTimelineUpdate, getAssistantTimelineReasoning } = await loadAssistantTimeline();

  const updatedTimeline = buildAssistantTimelineUpdate(
    `Preparing to inspect
<tool_use>
<tool name="view">
<tool_params>{"file_path":"src/App.tsx"}</tool_params>
</tool>
</tool_use>
Summarizing the result`,
    [],
    {
      preferredAssistantParts: [
        { type: 'text', content: 'Preparing to inspect', createdAt: 10 },
        { type: 'text', content: 'Summarizing the result', createdAt: 20 },
      ],
    },
  );

  assert.equal(getAssistantTimelineReasoning(updatedTimeline), '');
  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.content, event.createdAt]),
    [
      ['text', 'Preparing to inspect', 10],
      ['text', 'Summarizing the result', 20],
    ],
  );
});

test('assistant timeline update honors newer preferred text timestamps when they move past later tool events', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();

  const currentTimeline = [
    {
      id: 'text-1',
      kind: 'text',
      content: 'Started the first step.',
      createdAt: 10,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'docs/plan.md' },
      status: 'completed',
      createdAt: 20,
    },
    {
      id: 'text-2',
      kind: 'text',
      content: 'Finished the second step.',
      createdAt: 30,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'docs/plan.md', new_string: 'done' },
      status: 'completed',
      createdAt: 40,
    },
  ];

  const updatedTimeline = buildAssistantTimelineUpdate(
    'Started the first step.\n\nFinished the second step.',
    currentTimeline,
    {
      preferredAssistantParts: [
        { type: 'text', content: 'Started the first step.', createdAt: 10 },
        { type: 'text', content: 'Finished the second step.', createdAt: 50 },
      ],
    },
  );

  assert.deepEqual(
    updatedTimeline.map((event) => [event.kind, event.content, event.createdAt]),
    [
      ['text', 'Started the first step.', 10],
      ['tool_use', undefined, 20],
      ['tool_use', undefined, 40],
      ['text', 'Finished the second step.', 50],
    ],
  );
});
