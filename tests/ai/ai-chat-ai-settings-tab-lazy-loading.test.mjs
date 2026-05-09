import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const aiSettingsTabPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAISettingsTab.tsx');

test('AIChat lazy-loads the heavy AI settings tab instead of inlining it in the main chat module', async () => {
  const [chatSource, tabSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(aiSettingsTabPath, 'utf8'),
  ]);

  assert.match(chatSource, /const LazyAIChatAISettingsTab = lazy\(async \(\) =>/);
  assert.match(chatSource, /import\('\.\/AIChatAISettingsTab'\)/);
  assert.match(chatSource, /<LazyAIChatAISettingsTab/);
  assert.doesNotMatch(chatSource, /className="chat-settings-ai-layout"/);

  assert.match(tabSource, /export const AIChatAISettingsTab/);
  assert.match(tabSource, /chat-settings-ai-layout/);
  assert.match(tabSource, /chat-settings-provider-list/);
  assert.match(tabSource, /chat-settings-detail/);
});
