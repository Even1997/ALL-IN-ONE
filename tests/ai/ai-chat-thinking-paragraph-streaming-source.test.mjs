import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('AIChat maintains UI-only paragraph buffers for streaming reasoning events', async () => {
  const source = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.match(source, /streamingReasoningTextByEventId/);
  assert.match(source, /reasoningParagraphStreamingStateByEventIdRef/);
  assert.match(source, /event\.kind === 'reasoning'/);
  assert.doesNotMatch(source, /event\.content\s*=\s*advanceParagraphStreamingState/);
});
