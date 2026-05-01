import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('ai chat renders a single icon skills button near history that opens the centered modal', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  assert.match(source, /GNAgentSkillsEntryButton/);
  assert.match(source, /SkillsIcon/);
  assert.match(source, /GNAgentSkillsPage/);
  assert.match(source, /<HistoryIcon \/>[\s\S]*<GNAgentSkillsEntryButton/);
  assert.match(source, /isSkillsModalOpen/);
  assert.match(source, /chat-skills-modal-backdrop/);
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.match(source, /className="chat-shell-icon-btn chat-skills-entry-btn"/);
  assert.doesNotMatch(source, /entrySwitch=\{[\s\S]*GNAgentSkillsEntryButton/);
  assert.doesNotMatch(source, /<GNAgentModeSwitch compact \/>/);
});

