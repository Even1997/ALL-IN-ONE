import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');

test('unified runtime client no longer depends on ClaudeRuntime or CodexRuntime shells', async () => {
  const source = await readFile(runtimeClientPath, 'utf8');
  assert.doesNotMatch(source, /ClaudeRuntime/);
  assert.doesNotMatch(source, /CodexRuntime/);
  assert.match(source, /toRuntimeAIConfig/);
  assert.match(source, /await aiService\.completeText/);
});

test('embedded agent pages now share one AIChat variant without runtime shell swapping', async () => {
  const source = await readFile(stagePath, 'utf8');
  assert.match(source, /variant=\"embedded\"/);
  assert.doesNotMatch(source, /runtimeConfigIdOverride/);
  assert.doesNotMatch(source, /claudeConfigId/);
  assert.doesNotMatch(source, /codexConfigId/);
  assert.doesNotMatch(source, /providerExecutionMode/);
});
