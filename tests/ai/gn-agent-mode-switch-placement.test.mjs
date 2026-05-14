import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('ai chat still exposes settings entry points while App owns the global settings page', async () => {
  const [chatSource, appSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(appPath, 'utf8'),
  ]);

  assert.match(chatSource, /new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(chatSource, /detail:\s*\{\s*tab:\s*'ai'\s*\}/);
  assert.doesNotMatch(chatSource, /isSettingsOpen/);
  assert.doesNotMatch(chatSource, /activeSettingsTab/);
  assert.doesNotMatch(chatSource, /GNAgentSkillsPage/);
  assert.doesNotMatch(chatSource, /RuntimeMcpSettingsPage/);
  assert.doesNotMatch(chatSource, /isSkillsModalOpen/);
  assert.doesNotMatch(chatSource, /chat-skills-modal-backdrop/);
  assert.match(appSource, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(appSource, /setActiveGlobalSettingsTab\(resolveSettingsTabId\(detail\.tab\)\)/);
  assert.match(appSource, /setIsGlobalSettingsOpen\(true\)/);
  assert.match(appSource, /<LazyGlobalSettingsPage/);
});
