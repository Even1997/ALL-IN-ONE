import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates changed-path activity extraction to the runtime outcome helper', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /buildRuntimeChangedPathActivityEntry/);
  assert.match(source, /activityEntry: buildRuntimeChangedPathActivityEntry\(/);
  assert.match(source, /const activityEntry = buildRuntimeChangedPathActivityEntry\(/);
  assert.doesNotMatch(source, /const activityEntry = buildRunSummaryEntry\(/);
});
