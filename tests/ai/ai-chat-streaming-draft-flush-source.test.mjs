import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat flushes streaming drafts immediately when assistant timeline updates arrive', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /setStreamingDraftContents\(\{ \.\.\.streamingDraftBufferRef\.current \}\);/);
  assert.doesNotMatch(source, /STREAMING_DRAFT_FLUSH_MS/);
  assert.doesNotMatch(source, /streamingFlushTimerRef/);
  assert.doesNotMatch(
    source,
    /window\.setTimeout\(\(\)\s*=>\s*\{[\s\S]*setStreamingDraftContents\(\{ \.\.\.streamingDraftBufferRef\.current \}\);[\s\S]*\}/,
  );
});
