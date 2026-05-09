import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);
const outcomeFlowPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeTurnOutcomeFlow.ts',
);

test('chat delegates changed-path activity extraction to the runtime outcome helper', async () => {
  const coordinator = await readFile(coordinatorPath, 'utf8');
  const outcomeFlow = await readFile(outcomeFlowPath, 'utf8');

  assert.match(coordinator, /buildRuntimeChangedPathActivityEntry/);
  assert.match(coordinator, /const activityEntry = buildRuntimeChangedPathActivityEntry\(/);
  assert.match(outcomeFlow, /activityEntry: buildRuntimeChangedPathActivityEntry\(/);
  assert.doesNotMatch(outcomeFlow, /buildRunSummaryEntry/);
});
