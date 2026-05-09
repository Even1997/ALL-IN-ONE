import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const aiChatPath = path.join(repoRoot, 'src/components/workspace/AIChat.tsx');
const sidecarHookPath = path.join(repoRoot, 'src/components/workspace/useAIChatSidecarSessionActions.ts');

test('AIChat initializes and submits runtime sessions through the sidecar bridge', async () => {
  const [source, sidecarHook] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(sidecarHookPath, 'utf8'),
  ]);

  assert.match(source, /useAIChatSidecarSessionActions/);
  assert.match(source, /initializeRuntimeSidecarProjectSessions/);
  assert.match(sidecarHook, /createRuntimeSidecarSession/);
  assert.match(sidecarHook, /submitRuntimeSidecarTurn/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn/);
  assert.doesNotMatch(source, /listAgentThreads\(projectId\)/);
});
