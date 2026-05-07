import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime chat turn store bridge centralizes chat and runtime mutations', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts'),
    'utf8',
  );

  assert.match(source, /RuntimeChatMessageBridge/);
  assert.match(source, /RuntimeChatStateBridge/);
  assert.match(source, /patchLiveState/);
  assert.match(source, /setToolCalls/);
});
