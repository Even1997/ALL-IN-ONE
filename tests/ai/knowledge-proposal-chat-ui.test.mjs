import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat exposes knowledge proposal controls in assistant messages', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /knowledgeProposal/);
  assert.match(chatSource, /executeKnowledgeProposal/);
  assert.match(chatSource, /toggleProposalOperation/);
  assert.match(chatSource, /dismissKnowledgeProposal/);
  assert.match(chatSource, /buildKnowledgeNoteRootMirrorPath/);
  assert.match(chatSource, /serializeKnowledgeNoteMarkdown/);
  assert.match(chatSource, /resolveKnowledgeNoteMirrorPath/);
  assert.match(chatSource, /structuredCards/);
  assert.match(chatSource, /renderStructuredCards/);
  assert.doesNotMatch(chatSource, /suggestKnowledgeProposalFromAnswer/);
  assert.doesNotMatch(chatSource, /鎴戞暣鐞嗕簡涓€浠藉彲鎵ц鐨勭煡璇嗗簱鎻愭/);
  assert.match(chatSource, /chat-knowledge-proposal-card/);
  assert.match(chatSource, /\u5168\u90e8\u6279\u51c6|\u6267\u884c\u9009\u4e2d\u9879/);
  assert.match(chatSource, /\u5ffd\u7565/);
  assert.doesNotMatch(chatSource, /filePath:\s*''/);

  assert.match(messageListSource, /renderKnowledgeProposal/);

  assert.match(css, /\.chat-knowledge-proposal-card/);
  assert.match(css, /\.chat-knowledge-proposal-actions/);
  assert.match(css, /\.chat-knowledge-proposal-operation/);
});

