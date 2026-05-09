import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSettingsState.ts');

test('AIChat lazy-loads AI service for settings-only provider checks', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /const loadAIServiceModule = \(\) =>/);
  assert.match(chatSource, /import\('\.\.\/\.\.\/modules\/ai\/core\/AIService'\)/);
  assert.doesNotMatch(chatSource, /import\s+\{\s*aiService\b.*\}\s+from ['"]\.\.\/\.\.\/modules\/ai\/core\/AIService['"]/);
  assert.match(hookSource, /const \{ aiService \} = await loadAIServiceModule\(\)/);
});
