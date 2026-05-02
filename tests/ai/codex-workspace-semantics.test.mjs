import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRegistryPath = path.resolve(__dirname, '../../src/modules/ai/chat/runtimeRegistry.ts');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeSummaryPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx',
);

test('codex desktop agent wording no longer markets the runtime as CLI-only', async () => {
  const [runtimeRegistrySource, aiChatSource, runtimeSummarySource] = await Promise.all([
    readFile(runtimeRegistryPath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
    readFile(runtimeSummaryPath, 'utf8'),
  ]);

  assert.match(runtimeRegistrySource, /label: 'Codex'/);
  assert.match(runtimeRegistrySource, /title: 'Codex Agent'/);
  assert.doesNotMatch(runtimeRegistrySource, /Codex CLI/);
  assert.match(aiChatSource, /Codex Agent 已就绪/);
  assert.doesNotMatch(aiChatSource, /Codex CLI 已就绪/);
  assert.match(runtimeSummarySource, /Codex Agent Runtime/);
});
