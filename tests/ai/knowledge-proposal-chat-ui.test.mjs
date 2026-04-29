import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/claudian/ClaudianEmbeddedPieces.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat exposes knowledge proposal controls in assistant messages', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /knowledgeProposal/);
  assert.match(chatSource, /executeKnowledgeProposal/);
  assert.match(chatSource, /toggleProposalOperation/);
  assert.match(chatSource, /dismissKnowledgeProposal/);
  assert.match(chatSource, /chat-knowledge-proposal-card/);
  assert.match(chatSource, /全部批准|执行选中项/);
  assert.match(chatSource, /忽略/);

  assert.match(messageListSource, /renderKnowledgeProposal/);

  assert.match(css, /\.chat-knowledge-proposal-card/);
  assert.match(css, /\.chat-knowledge-proposal-actions/);
  assert.match(css, /\.chat-knowledge-proposal-operation/);
});
