import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime chat turn coordinator is the runtime execution dependency boundary', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts'),
    'utf8',
  );

  assert.match(source, /submitRuntimeChatTurn/);
  assert.match(source, /executeRuntimeBuiltInAgentTurn/);
  assert.match(source, /executeRuntimeMcpTurn/);
  assert.match(source, /createRuntimeReplayExecutionController/);
  assert.match(source, /ports\.resolveProjectRootById/);
  assert.match(source, /ports\.persistRuntimeThread/);
  assert.match(source, /ports\.executeRuntimePrompt/);
  assert.match(source, /interactionPort\.waitForQuestionAnswer/);
  assert.match(source, /interactionPort\.waitForApproval/);
  assert.doesNotMatch(source, /const \{[\s\S]*?runRuntimeChatBuiltInAgentTurn,/);
  assert.doesNotMatch(source, /const \{[\s\S]*?runRuntimeChatMcpTurn,/);
  assert.doesNotMatch(source, /void \[request, ports\]/);
  assert.doesNotMatch(source, /\[dependency: string\]: any/);
  assert.doesNotMatch(source, /requestRuntimeApproval/);
});
