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
  assert.match(source, /Unless a real file operation succeeded/);
  assert.match(source, /created, saved, edited, or deleted/);
  assert.match(source, /short affirmative confirmation/);
  assert.match(source, /\u786e\u8ba4/);
});
