import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gatewayHookPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts',
);

test('runtime conversation gateway avoids unstable zustand selector fallbacks', async () => {
  const source = await readFile(gatewayHookPath, 'utf8');

  assert.match(source, /const EMPTY_MEMORY_ENTRIES:/);
  assert.match(source, /const EMPTY_BACKGROUND_TASKS:/);
  assert.match(source, /const EMPTY_ACTIVE_SKILLS:/);
  assert.match(source, /const EMPTY_TOOL_CALLS:/);
  assert.match(source, /const EMPTY_MEMORY_CANDIDATES:/);
  assert.match(source, /const EMPTY_REPLAY_EVENTS:/);
  assert.match(source, /const EMPTY_TEAM_RUNS:/);
  assert.match(source, /const EMPTY_MCP_TOOL_CALLS:/);
  assert.match(source, /const EMPTY_APPROVALS:/);

  assert.doesNotMatch(source, /state\.memoryByProject\[projectId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.backgroundTasksByThread\[threadIds\.liveThreadId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.activeSkillsByThread\[selection\.activeSessionId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.toolCallsByThread\[selection\.activeSessionId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.memoryCandidatesByThread\[selection\.activeSessionId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(
    source,
    /state\.replayEventsByThread\[selection\.activeSession\.runtimeThreadId\]\s*\|\|\s*\[\]/,
  );
  assert.doesNotMatch(source, /state\.teamRunsByThread\[selection\.activeSessionId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.toolCallsByThread\[selection\.activeSessionId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /state\.approvalsByThread\[threadIds\.approvalThreadId\]\s*\|\|\s*\[\]/);
  assert.doesNotMatch(source, /useApprovalStore\(\(state\)\s*=>[\s\S]*?\.filter\(/);
});
