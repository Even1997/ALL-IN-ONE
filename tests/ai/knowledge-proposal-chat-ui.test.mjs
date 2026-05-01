import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat no longer renders knowledge proposal controls', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.doesNotMatch(chatSource, /knowledgeProposal/);
  assert.doesNotMatch(chatSource, /executeKnowledgeProposal/);
  assert.doesNotMatch(chatSource, /useKnowledgeProposalStore/);
  assert.doesNotMatch(chatSource, /renderKnowledgeProposal/);
  assert.doesNotMatch(chatSource, /chat-knowledge-proposal-card/);

  assert.doesNotMatch(css, /\.chat-knowledge-proposal-card/);
  assert.doesNotMatch(css, /\.chat-knowledge-proposal-actions/);
  assert.doesNotMatch(css, /\.chat-knowledge-proposal-operation/);
});
