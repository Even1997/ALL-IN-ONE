import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat subscribes to runtime projection instead of owning runtime execution', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useRuntimeConversationGateway/);
  assert.match(source, /interactionPort:/);
  assert.match(source, /waitForApproval:\s*waitForRuntimeApproval/);
  assert.doesNotMatch(source, /executeRuntimeBuiltInAgentTurn/);
  assert.doesNotMatch(source, /executeRuntimeMcpTurn/);
  assert.doesNotMatch(source, /createRuntimeReplayExecutionController/);
  assert.doesNotMatch(source, /createRuntimeChatReplayExecutionController/);
  assert.doesNotMatch(source, /createRuntimeChatStreamingMessageAssembler/);
  assert.doesNotMatch(source, /new ToolExecutor\(/);
  assert.doesNotMatch(source, /waitForApproval:\s*async\s*\(\)\s*=>\s*false/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn\(\{[\s\S]*?pendingQuestionActionsRef,/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn\(\{[\s\S]*?BUILT_IN_EXECUTION_TOOLS,/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn\(\{[\s\S]*?READ_ONLY_CHAT_TOOLS,/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn\(\{[\s\S]*?RISKY_BUILT_IN_TOOLS,/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn\(\{[\s\S]*?requestRuntimeApproval,/);
  assert.doesNotMatch(source, /legacy:\s*\{[\s\S]*?createRuntimeChatReplayExecutionController,/);
  assert.doesNotMatch(source, /legacy:\s*\{[\s\S]*?createRuntimeChatStreamingMessageAssembler,/);
});
