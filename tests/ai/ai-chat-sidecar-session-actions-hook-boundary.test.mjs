import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSidecarSessionActions.ts');

test('AIChat delegates sidecar session creation and turn submission into a dedicated hook', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /useAIChatSidecarSessionActions/);
  assert.doesNotMatch(chatSource, /const handleCreateSession = useCallback/);
  assert.doesNotMatch(chatSource, /const submitPrompt = useCallback/);

  assert.match(hookSource, /export const useAIChatSidecarSessionActions/);
  assert.match(hookSource, /const handleCreateSession = useCallback/);
  assert.match(hookSource, /const submitPrompt = useCallback/);
  assert.match(hookSource, /createRuntimeSidecarSession/);
  assert.match(hookSource, /submitRuntimeSidecarTurn/);
});
