import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const gnAgentPiecesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');

test('AIChat keeps icon-first shell controls and GN Agent embedded entry support', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const pieces = await readFile(gnAgentPiecesPath, 'utf8');

  assert.match(source, /chat-shell-icon-btn/);
  assert.match(source, /GNAgentSkillsEntryButton/);
  assert.match(source, /GNAgentSkillsPage/);
  assert.match(source, /@skill/);
  assert.match(pieces, /chat-composer-gn-agent-entry/);
  assert.match(pieces, /chat-composer-embedded-toolbar/);
});

test('AIChat no longer renders the old reference menu surface in the embedded GN Agent pieces', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const pieces = await readFile(gnAgentPiecesPath, 'utf8');

  assert.doesNotMatch(source, /chat-reference-scope-actions/);
  assert.doesNotMatch(source, /GNAgentReferenceMenu/);
  assert.doesNotMatch(pieces, /chat-reference-menu-action/);
});

test('GN Agent embedded pieces only keep the active chat primitives', async () => {
  const pieces = await readFile(gnAgentPiecesPath, 'utf8');

  assert.doesNotMatch(pieces, /GNAgentEmbeddedTopbar/);
  assert.doesNotMatch(pieces, /GNAgentSkillsPanel/);
});

test('AIChat stylesheet defines selected-file chip and menu styling', async () => {
  const source = await readFile(aiChatCssPath, 'utf8');

  assert.match(source, /\.chat-reference-menu/);
  assert.match(source, /\.chat-selected-reference-chips/);
  assert.match(source, /\.chat-reference-chip/);
});

