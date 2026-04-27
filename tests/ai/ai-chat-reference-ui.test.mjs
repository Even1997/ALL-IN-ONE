import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const claudianPiecesPath = path.resolve(__dirname, '../../src/components/ai/claudian/ClaudianEmbeddedPieces.tsx');

test('AIChat uses icon-first composer controls and a unified reference menu trigger', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const pieces = await readFile(claudianPiecesPath, 'utf8');

  assert.match(source, /chat-composer-plus-btn/);
  assert.match(source, /chat-shell-icon-btn/);
  assert.match(source, /ClaudianReferenceMenu/);
  assert.match(pieces, /chat-reference-menu/);
  assert.match(source, /selectedReferenceFileIds/);
  assert.match(source, /handleApplyReferenceScope/);
});

test('AIChat keeps reference scope actions out of the main composer surface', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const pieces = await readFile(claudianPiecesPath, 'utf8');

  assert.doesNotMatch(source, /chat-reference-scope-actions/);
  assert.match(pieces, /chat-reference-menu-action/);
});

test('AIChat stylesheet defines selected-file chip and menu styling', async () => {
  const source = await readFile(aiChatCssPath, 'utf8');

  assert.match(source, /\.chat-reference-menu/);
  assert.match(source, /\.chat-selected-reference-chips/);
  assert.match(source, /\.chat-reference-chip/);
});
