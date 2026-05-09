import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coordinatorPath = path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts');
const helperPath = path.resolve(__dirname, '../../src/modules/ai/chat/projectFileOperations.ts');

test('AI chat converts failed write or edit access errors into project file recovery proposals', async () => {
  const [coordinatorSource, helperSource] = await Promise.all([
    readFile(coordinatorPath, 'utf8'),
    readFile(helperPath, 'utf8'),
  ]);

  assert.match(coordinatorSource, /buildRuntimeWriteRecoveryProposal/);
  assert.match(coordinatorSource, /const recoveryProposal = await buildRuntimeWriteRecoveryProposal\(agentTurn\.toolCalls\);/);
  assert.match(coordinatorSource, /projectFileProposal:\s*message\.projectFileProposal \?\? recoveryProposal \?\? undefined/);
  assert.match(helperSource, /isProjectFileWriteAccessFailure/);
  assert.match(helperSource, /buildProjectFileOperationFromToolCall/);
});
