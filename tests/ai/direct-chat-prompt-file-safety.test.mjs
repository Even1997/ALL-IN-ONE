import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.resolve(testDir, '../../src/modules/ai/chat/directChatPrompt.ts');

test('direct chat prompt tells the AI not to claim file saves without real verified file operations', async () => {
  const source = await readFile(promptPath, 'utf8');

  assert.match(source, /FILE_OPERATION_TRUTHFULNESS_POLICY/);
  assert.match(source, /\u5df2\u4fdd\u5b58/);
  assert.match(source, /\u5df2\u521b\u5efa\u6587\u4ef6/);
  assert.match(source, /\u5df2\u5199\u5165/);
  assert.match(source, /\u5df2\u5220\u9664/);
});
