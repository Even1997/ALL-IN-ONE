import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../../src/components/workspace/assistantRenderModel.ts');

const loadRenderModel = async () => import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

test('assistant render model keeps assistant thinking in the process lane and projects one final answer lane', async () => {
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
      ['answer_lane', 'text', 'Checked the first file.\n\nFinal answer'],
    ]
  );
  assert.equal(model.copyText, 'Checked the first file.\n\nFinal answer');
});

test('assistant render model collapses interleaved narrative text into one answer lane even when tool cards exist', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_2',
    role: 'assistant',
    timeline: [
      { id: 'reasoning_1', kind: 'reasoning', content: 'Inspect the first file.', collapsed: true, createdAt: 1 },
      { id: 'text_1', kind: 'text', content: 'The first check is done.', createdAt: 2 },
      { id: 'reasoning_2', kind: 'reasoning', content: 'Inspect the second file.', collapsed: true, createdAt: 3 },
      { id: 'text_2', kind: 'text', content: 'Now fix the second issue.', createdAt: 6 },
    ],
    createdAt: 1,
  }, undefined, 2);

  assert.deepEqual(
    model.items.map((item) => [item.kind, item.part.type, item.part.content]),
    [
      ['thinking_lane', 'thinking', 'Inspect the first file.'],
      ['thinking_lane', 'thinking', 'Inspect the second file.'],
      ['answer_lane', 'text', 'The first check is done.\n\nNow fix the second issue.'],
    ],
  );
});

test('assistant render model no longer hides short assistant text just because runtime cards exist', async () => {
  const source = await readFile(modulePath, 'utf8');

  assert.doesNotMatch(source, /return normalized\.length <= 120;/);
  assert.match(source, /return normalized\.length === 0;/);
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
  }, undefined, 0, {
    streamingText: 'First sentence.\n\nSecond sentence.',
    isStreaming: false,
  });

  assert.deepEqual(
    model.items.filter((item) => item.kind === 'answer_lane').map((item) => item.part.content),
    ['First sentence.\n\nSecond sentence.'],
  );
});
