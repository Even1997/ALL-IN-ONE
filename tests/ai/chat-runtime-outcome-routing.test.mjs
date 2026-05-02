import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates runtime execution outcome shaping to orchestration helpers', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /buildRuntimeChangedPathActivityEntry/);
  assert.match(source, /buildRuntimeProjectFileAutoExecuteSuccess/);
  assert.match(source, /buildRuntimeProjectFileAutoExecuteFailure/);
  assert.match(source, /buildRuntimeLocalAgentSuccessOutcome/);
  assert.match(source, /buildRuntimeLocalAgentFailureOutcome/);
  assert.match(source, /const successOutcome = buildRuntimeProjectFileAutoExecuteSuccess\(/);
  assert.match(source, /const failureOutcome = buildRuntimeProjectFileAutoExecuteFailure\(/);
  assert.match(source, /const successOutcome = buildRuntimeLocalAgentSuccessOutcome\(/);
  assert.match(source, /const failureOutcome = buildRuntimeLocalAgentFailureOutcome\(/);
  assert.doesNotMatch(source, /const activityEntry = buildRunSummaryEntry\(/);
});
