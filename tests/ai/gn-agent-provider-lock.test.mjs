import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/gnAgentShellStore.ts');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);

test('gnAgent shell store only keeps the active provider mode after shell binding cleanup', async () => {
  const source = await readFile(storePath, 'utf8');
  assert.match(source, /providerMode/);
  assert.match(source, /setProviderMode/);
  assert.doesNotMatch(source, /claudeConfigId/);
  assert.doesNotMatch(source, /codexConfigId/);
  assert.doesNotMatch(source, /setProviderConfigId/);
});

test('agent chat stage only passes config override into AIChat for provider tabs', async () => {
  const [chatPageSource, stageSource] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(stagePath, 'utf8'),
  ]);

  assert.match(chatPageSource, /AgentChatStage/);
  assert.match(stageSource, /variant="embedded"/);
  assert.doesNotMatch(stageSource, /claudeConfigId/);
  assert.doesNotMatch(stageSource, /codexConfigId/);
  assert.doesNotMatch(stageSource, /providerExecutionMode/);
});

test('ai chat routes all built-in model requests through the unified runtime client', async () => {
  const [source, coordinatorSource, runtimeClient] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(coordinatorPath, 'utf8'),
    readFile(runtimeClientPath, 'utf8'),
  ]);

  assert.match(source, /variant\?: 'default' \| 'embedded'/);
  assert.match(source, /const isEmbedded = variant === 'embedded';/);
  assert.doesNotMatch(source, /runtimeConfigIdOverride/);
  assert.doesNotMatch(source, /isRuntimeConfigLocked/);
  assert.match(source, /allowConfigSelection:\s*true/);
  assert.match(source, /const runtimeProviderId = 'built-in' as AgentProviderId;/);
  assert.doesNotMatch(source, /providerExecutionMode/);
  assert.match(coordinatorSource, /runAgentTurn/);
  assert.match(coordinatorSource, /ports\.executeRuntimePrompt\(\{/);
  assert.match(coordinatorSource, /providerId:\s*runtimeProviderId/);
  assert.match(runtimeClient, /return Array\.isArray\(prompt\)/);
  assert.match(runtimeClient, /await aiService\.completeMessages/);
  assert.match(runtimeClient, /await aiService\.completeText/);
  assert.doesNotMatch(runtimeClient, /claudeRuntime\.executePrompt/);
  assert.doesNotMatch(runtimeClient, /codexRuntime\.executePrompt/);
});
