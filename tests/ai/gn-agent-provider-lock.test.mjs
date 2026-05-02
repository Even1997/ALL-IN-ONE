import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/gnAgentShellStore.ts');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');

test('gnAgent shell store tracks dedicated config ids for claude and codex', async () => {
  const source = await readFile(storePath, 'utf8');
  assert.match(source, /claudeConfigId/);
  assert.match(source, /codexConfigId/);
  assert.match(source, /setProviderConfigId/);
});

test('gnAgent chat page passes provider-specific execution mode and config overrides into AIChat', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  assert.match(source, /runtimeConfigIdOverride/);
  assert.match(source, /providerExecutionMode/);
});

test('ai chat routes claude and codex pages through provider runtimes', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const runtimeClient = await readFile(runtimeClientPath, 'utf8');

  assert.match(source, /runtimeConfigIdOverride\?: string \| null/);
  assert.match(source, /providerExecutionMode\?: 'claude' \| 'codex' \| null/);
  assert.match(source, /variant\?: 'default' \| 'provider-embedded' \| 'gn-agent-embedded'/);
  assert.match(source, /const isProviderEmbedded = variant === 'provider-embedded';/);
  assert.match(source, /const isGNAgentEmbedded = variant === 'gn-agent-embedded';/);
  assert.match(source, /const isEmbedded = isProviderEmbedded \|\| isGNAgentEmbedded;/);
  assert.match(source, /const lockExpandedForEmbedded = isProviderEmbedded;/);
  assert.match(source, /const runtimeProviderId = \(providerExecutionMode \|\| 'built-in'\) as AgentProviderId;/);
  assert.match(source, /runAgentTurn/);
  assert.match(source, /executeModel:\s*\(prompt\)\s*=>/);
  assert.match(source, /executeRuntimePrompt\(\{/);
  assert.match(source, /providerId: runtimeProviderId/);
  assert.match(runtimeClient, /if \(providerId === 'claude' && config\)/);
  assert.match(runtimeClient, /claudeRuntime\.executePrompt/);
  assert.match(runtimeClient, /if \(providerId === 'codex' && config\)/);
  assert.match(runtimeClient, /codexRuntime\.executePrompt/);
});

