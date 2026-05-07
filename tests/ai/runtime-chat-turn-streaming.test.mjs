import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime chat turn streaming owns assembler and live streaming patches', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts'),
    'utf8',
  );

  assert.match(source, /createRuntimeChatStreamingController/);
  assert.match(source, /createRuntimeStreamingMessageAssembler/);
  assert.match(source, /onModelEvent/);
  assert.match(source, /markToolBoundary/);
  assert.match(source, /finalize/);
});
