import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const assistantPartsPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAssistantParts.tsx');

test('AIChat records frontend streaming flush and visibility timing markers', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /recordFrontendFlush/);
  assert.match(source, /recordFirstVisibleChar/);
  assert.match(source, /recordFinalVisibleDone/);
  assert.match(source, /streamingLatencyTrace/);
});

test('assistant streaming text reports first visible and final visible milestones', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.match(source, /onFirstVisibleChar/);
  assert.match(source, /onFinalVisibleDone/);
});
