import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat renders structured knowledge-truth cards inside the normal chat flow', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(messageListSource, /renderStructuredCards/);
  assert.match(chatSource, /chat-structured-card/);
  assert.match(chatSource, /temporary-content/);
  assert.match(chatSource, /setActiveArtifact/);
  assert.match(chatSource, /chat-next-step-action/);
  assert.match(css, /\.chat-structured-card/);
  assert.match(css, /\.chat-structured-card\.conflict/);
  assert.match(css, /\.chat-next-step-action/);
});
