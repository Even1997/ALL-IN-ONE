import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSettingsState.ts');

test('AIChat delegates settings state and provider management into a dedicated hook', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /useAIChatSettingsState/);
  assert.doesNotMatch(chatSource, /const handleTestConnection = useCallback/);
  assert.doesNotMatch(chatSource, /const handleLoadModels = useCallback/);
  assert.doesNotMatch(chatSource, /const handleApplySettings = useCallback/);
  assert.doesNotMatch(chatSource, /const handleImportConfigs = useCallback/);

  assert.match(hookSource, /export const useAIChatSettingsState/);
  assert.match(hookSource, /const handleTestConnection = useCallback/);
  assert.match(hookSource, /const handleLoadModels = useCallback/);
  assert.match(hookSource, /const handleApplySettings = useCallback/);
  assert.match(hookSource, /const handleImportConfigs = useCallback/);
  assert.match(hookSource, /const handleAddSavedModel = useCallback/);
  assert.match(hookSource, /const handleRemoveSavedModel = useCallback/);
  assert.match(hookSource, /const handleSelectActiveModel = useCallback/);
});
