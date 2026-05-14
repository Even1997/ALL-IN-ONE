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

test('runtime chat turn coordinator does not overwrite final assistant narrative blocks with the lossy canonical message projection', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts'),
    'utf8',
  );

  assert.match(source, /buildAssistantTimelineUpdate\(\s*finalAnswerContent,/);
  assert.doesNotMatch(
    source,
    /projectCurrentCanonicalTimeline\(\)\.length > 0[\s\S]*?\?\s*projectCurrentCanonicalTimeline\(\)/,
  );
});

test('runtime chat turn coordinator keeps streaming draft narrative boundaries from the assembler during model deltas', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts'),
    'utf8',
  );

  assert.match(source, /const draftState = streamingAssembler\.append\(event\);/);
  assert.match(source, /buildAssistantStreamingTimeline\(\s*draftState\.content,/);
  assert.match(source, /preferredAssistantParts:\s*draftState\.assistantParts/);
});
