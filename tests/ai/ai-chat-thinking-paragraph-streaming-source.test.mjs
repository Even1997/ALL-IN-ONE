import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('AIChat keeps streaming reasoning in draft blocks without paragraph timeout buffers', async () => {
  const source = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.match(source, /projectAssistantStreamingDraft/);
  assert.match(source, /streamingDraftBufferRef/);
  assert.doesNotMatch(source, /reasoningParagraphStreamingStateByEventIdRef/);
  assert.doesNotMatch(source, /scheduleReasoningParagraphStreamingTimeout/);
  assert.doesNotMatch(source, /advanceParagraphStreamingState/);
});
