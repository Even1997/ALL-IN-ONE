import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSettingsState.ts');

test('AIChat uses a shared AI service import for settings checks while keeping the settings tab lazy', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /import\s+\{\s*aiService,\s*type AIProviderType\s*\}\s+from ['"]\.\.\/\.\.\/modules\/ai\/core\/AIService['"]/);
  assert.doesNotMatch(chatSource, /const loadAIServiceModule = \(\) =>/);
  assert.doesNotMatch(chatSource, /import\('\.\.\/\.\.\/modules\/ai\/core\/AIService'\)/);
  assert.match(hookSource, /aiServiceClient:\s*typeof sharedAIService/);
  assert.match(hookSource, /const result = await aiServiceClient\.testConnection\(settingsDraft\)/);
  assert.match(hookSource, /const list = await aiServiceClient\.listModels\(settingsDraft\)/);
});
