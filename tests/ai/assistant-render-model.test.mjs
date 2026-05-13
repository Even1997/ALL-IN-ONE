import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../../src/components/workspace/assistantRenderModel.ts');

const loadRenderModel = async () => import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

test('assistant render model keeps completed assistant thinking in the visible process lane', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_1',
    role: 'assistant',
    timeline: [
      { id: 'reasoning_1', kind: 'reasoning', content: 'Check project first', collapsed: true, createdAt: 1 },
      { id: 'text_1', kind: 'text', content: 'Checked the first file.', createdAt: 2 },
      { id: 'text_2', kind: 'text', content: 'Final answer', createdAt: 4 },
    ],
    createdAt: 1,
  });

  assert.deepEqual(
    model.items.map((item) => [item.kind, item.part.type, item.part.content]),
    [
      ['thinking_lane', 'thinking', 'Check project first'],
      ['feedback_lane', 'text', 'Checked the first file.'],
      ['answer_lane', 'text', 'Final answer'],
    ]
  );
  assert.equal(model.hasFinalAnswer, true);
  assert.deepEqual(
    model.processItems.map((item) => [item.kind, item.part.type, item.part.content]),
    [
      ['thinking_lane', 'thinking', 'Check project first'],
      ['feedback_lane', 'text', 'Checked the first file.'],
    ],
  );
  assert.equal(model.finalAnswerItem?.kind, 'answer_lane');
  assert.equal(model.finalAnswerItem?.part.content, 'Final answer');
  assert.equal(model.copyText, 'Final answer');
});

test('assistant render model keeps completed and active thinking in timeline order', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_2',
    role: 'assistant',
    timeline: [
      {
        id: 'reasoning_1',
        kind: 'reasoning',
        content: 'Inspect the first file.',
        collapsed: true,
        status: 'completed',
        createdAt: 1,
      },
      { id: 'text_1', kind: 'text', content: 'The first check is done.', createdAt: 2 },
      {
        id: 'reasoning_2',
        kind: 'reasoning',
        content: 'Inspect the second file.',
        collapsed: true,
        status: 'streaming',
        createdAt: 3,
      },
      { id: 'text_2', kind: 'text', content: 'Now fix the second issue.', createdAt: 6 },
    ],
    createdAt: 1,
  });

  assert.deepEqual(
    model.processItems.map((item) => [item.kind, item.part.type, item.part.content]),
    [
      ['thinking_lane', 'thinking', 'Inspect the first file.'],
      ['feedback_lane', 'text', 'The first check is done.'],
      ['thinking_lane', 'thinking', 'Inspect the second file.'],
    ],
  );
  assert.equal(model.finalAnswerItem?.part.content, 'Now fix the second issue.');
  assert.equal(model.copyText, 'Now fix the second issue.');
});

test('assistant render model keeps interleaved assistant feedback in process chronology and only uses the trailing text block as the final answer', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_interleaved_feedback',
    role: 'assistant',
    timeline: [
      { id: 'reasoning_1', kind: 'reasoning', content: 'Inspect file A', collapsed: true, status: 'completed', createdAt: 10 },
      { id: 'text_1', kind: 'text', content: 'Checked file A.', createdAt: 20 },
      { id: 'tool_use_1', kind: 'tool_use', toolCallId: 'call-1', parentToolCallId: null, toolName: 'view', input: { file_path: 'src/App.tsx' }, status: 'completed', createdAt: 30 },
      { id: 'reasoning_2', kind: 'reasoning', content: 'Inspect file B', collapsed: true, status: 'completed', createdAt: 40 },
      { id: 'text_2', kind: 'text', content: 'Final answer.', createdAt: 50 },
    ],
    createdAt: 1,
  });

  assert.deepEqual(
    model.processItems.map((item) => [item.kind, item.part.type, item.part.content]),
    [
      ['thinking_lane', 'thinking', 'Inspect file A'],
      ['feedback_lane', 'text', 'Checked file A.'],
      ['thinking_lane', 'thinking', 'Inspect file B'],
    ],
  );
  assert.equal(model.finalAnswerItem?.part.content, 'Final answer.');
  assert.equal(model.content, 'Final answer.');
  assert.equal(model.copyText, 'Final answer.');
});

test('assistant render model no longer hides short assistant text just because runtime cards exist', async () => {
  const source = await readFile(modulePath, 'utf8');

  assert.doesNotMatch(source, /shouldSuppressAssistantTextPart/);
  assert.match(source, /const shouldRenderAnswer = normalizedContent\.length > 0;/);
});

test('assistant render model keeps streaming thinking collapsed by default', async () => {
  const source = await readFile(modulePath, 'utf8');

  assert.doesNotMatch(source, /thinkingCollapsed:\s*isStreaming\s*\?\s*false\s*:\s*undefined/);
  assert.match(source, /type:\s*'thinking'/);
});

test('assistant render model tolerates assistant messages without timeline', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_broken',
    role: 'assistant',
    createdAt: 1,
  });

  assert.deepEqual(model.items, []);
  assert.deepEqual(model.processItems, []);
  assert.equal(model.finalAnswerItem, null);
  assert.equal(model.hasFinalAnswer, false);
  assert.equal(model.copyText, '');
});

test('assistant render model shows the buffered answer lane once when streaming finishes', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_stream_done',
    role: 'assistant',
    timeline: [
      { id: 'text_1', kind: 'text', content: 'First sentence.', createdAt: 1 },
      { id: 'text_2', kind: 'text', content: 'Second sentence.', createdAt: 2 },
    ],
    createdAt: 1,
  }, {
    timeline: [
      { id: 'text_1', kind: 'text', content: 'First sentence.', createdAt: 1 },
      { id: 'text_2', kind: 'text', content: 'Second sentence.', createdAt: 2 },
    ],
    isStreaming: false,
  });

  assert.deepEqual(
    model.processItems.map((item) => [item.kind, item.part.content]),
    [['feedback_lane', 'First sentence.']],
  );
  assert.deepEqual(
    model.items.filter((item) => item.kind === 'answer_lane').map((item) => item.part.content),
    ['Second sentence.'],
  );
});

test('assistant render model keeps the answer lane key stable across streaming and completion', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const message = {
    id: 'assistant_stable_key',
    role: 'assistant',
    timeline: [{ id: 'text_1', kind: 'text', content: 'Final answer.', createdAt: 20 }],
    createdAt: 1,
  };

  const streamingModel = buildAssistantRenderModel(message, {
    timeline: [{ id: 'text_stream', kind: 'text', content: 'Final answer.', createdAt: 20 }],
    isStreaming: true,
  });
  const completedModel = buildAssistantRenderModel(message, {
    timeline: [{ id: 'text_stream', kind: 'text', content: 'Final answer.', createdAt: 20 }],
    isStreaming: false,
  });

  assert.equal(
    streamingModel.items.find((item) => item.kind === 'answer_lane')?.key,
    completedModel.items.find((item) => item.kind === 'answer_lane')?.key,
  );
});

test('assistant render model ignores completed answer drafts after handoff', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_final_handoff',
    role: 'assistant',
    timeline: [{ id: 'text_1', kind: 'text', content: 'Stored final answer.', createdAt: 10 }],
    createdAt: 1,
  }, {
    timeline: [{ id: 'text_1', kind: 'text', content: 'Visible final answer.', createdAt: 20 }],
    isStreaming: false,
  });

  assert.equal(model.content, 'Stored final answer.');
  assert.equal(model.finalAnswerItem?.part.content, 'Stored final answer.');
});

test('assistant render model keeps streaming answer timestamp stable from its start', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_streaming_ts',
    role: 'assistant',
    timeline: [{ id: 'text_1', kind: 'text', content: 'Stored answer.', createdAt: 2 }],
    createdAt: 1,
  }, {
    timeline: [{ id: 'text_1', kind: 'text', content: 'Visible answer.', createdAt: 20 }],
    isStreaming: true,
    streamingStartedAt: 20,
    streamingUpdatedAt: 30,
  });

  assert.equal(model.finalAnswerItem?.part.createdAt, 20);
});

test('assistant render model exposes an unfinished streaming answer block without paragraph gating', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_streaming_fragment',
    role: 'assistant',
    timeline: [{ id: 'text_1', kind: 'text', content: 'Stored answer.', createdAt: 2 }],
    createdAt: 1,
  }, {
    timeline: [{ id: 'text_stream', kind: 'text', content: 'Unfinished fragment without punctuation', createdAt: 20 }],
    isStreaming: true,
    streamingStartedAt: 20,
    streamingUpdatedAt: 30,
  });

  assert.equal(model.content, 'Unfinished fragment without punctuation');
  assert.equal(model.finalAnswerItem?.part.content, 'Unfinished fragment without punctuation');
});

test('assistant render model uses reasoning content directly from the shared timeline', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const timeline = [
    {
      id: 'reasoning_1',
      kind: 'reasoning',
      content: 'First thought. Hidden unfinished fragment',
      collapsed: true,
      status: 'streaming',
      createdAt: 10,
    },
  ];

  const model = buildAssistantRenderModel(
    { id: 'assistant_reasoning_buffered', role: 'assistant', timeline, createdAt: 1 },
    {
      timeline,
      isStreaming: true,
    },
  );

  assert.equal(model.items[0]?.part.content, 'First thought. Hidden unfinished fragment');
  assert.equal(timeline[0].content, 'First thought. Hidden unfinished fragment');
});
