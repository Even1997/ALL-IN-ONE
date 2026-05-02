import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx');

test('runtime ui wiring references active skills and mcp state', async () => {
  const aiChat = await readFile(aiChatPath, 'utf8');
  const summary = await readFile(runtimeSummaryPath, 'utf8');

  assert.match(aiChat, /activeSkills|runtimeMcp/i);
  assert.match(aiChat, /createRuntimeSkillRegistry/);
  assert.match(aiChat, /invokeRuntimeMcpTool/);
  assert.match(aiChat, /parseRuntimeMcpCommand/);
  assert.match(aiChat, /executeRuntimeMcpCommand/);
  assert.match(summary, /skill|mcp/i);
  assert.match(summary, /toolCallsByThread|mcpCalls/i);
});
