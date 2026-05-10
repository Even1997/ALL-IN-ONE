import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../../src/components/workspace/assistantRenderModel.ts');

const loadRenderModel = async () => import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

test('assistant render model keeps only assistant text in the primary narrative lane', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_1',
    role: 'assistant',
    timeline: [
      { id: 'reasoning_1', kind: 'reasoning', content: 'Check project first', collapsed: true, createdAt: 1 },
      { id: 'text_1', kind: 'text', content: 'Final answer', createdAt: 2 },
    ],
    createdAt: 1,
  });

  assert.deepEqual(
    model.items.map((item) => [item.kind, item.part.type, item.part.content]),
    [['bubble_part', 'text', 'Final answer']]
  );
  assert.equal(model.copyText, 'Final answer');
});

test('assistant render model no longer hides short assistant text just because runtime cards exist', async () => {
  const source = await readFile(modulePath, 'utf8');

  assert.doesNotMatch(source, /return normalized\.length <= 120;/);
  assert.match(source, /return normalized\.length === 0;/);
});

test('assistant render model keeps streaming thinking collapsed by default', async () => {
  const source = await readFile(modulePath, 'utf8');

  assert.doesNotMatch(source, /thinkingCollapsed:\s*isStreaming\s*\?\s*false\s*:\s*undefined/);
  assert.match(source, /if \(event\.kind === 'reasoning'\) \{\s*return;\s*\}/);
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
