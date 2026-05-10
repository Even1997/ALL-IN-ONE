import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat sidecar path does not invoke local runtime orchestration helpers for mcp replay or team execution', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(source, /appendRuntimeReplayEvent/);
  assert.doesNotMatch(source, /listAgentApprovals/);
  assert.doesNotMatch(source, /listAgentBackgroundTasks/);
  assert.doesNotMatch(source, /listAgentTurnCheckpoints/);
  assert.doesNotMatch(source, /getAgentTurnCheckpointDiff/);
  assert.doesNotMatch(source, /listRuntimeMcpServers/);
  assert.doesNotMatch(source, /listRuntimeMcpToolCalls/);
  assert.doesNotMatch(source, /listRuntimeSidecarReplayHistory/);
  assert.doesNotMatch(source, /invokeRuntimeMcpTool\(/);
  assert.doesNotMatch(source, /rewindAgentTurn\(/);
  assert.doesNotMatch(source, /runAgentTeamTurn/);
});
