import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('ai chat settings own the skills and mcp management entry points', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /isSettingsOpen/);
  assert.match(source, /activeSettingsTab/);
  assert.match(source, /label:\s*'技能'/);
  assert.match(source, /label:\s*'MCP'/);
  assert.match(source, /GNAgentSkillsPage/);
  assert.match(source, /RuntimeMcpSettingsPage/);
  assert.doesNotMatch(source, /GNAgentSkillsEntryButton/);
  assert.doesNotMatch(source, /SkillsIcon/);
  assert.doesNotMatch(source, /isSkillsModalOpen/);
  assert.doesNotMatch(source, /chat-skills-modal-backdrop/);
});
