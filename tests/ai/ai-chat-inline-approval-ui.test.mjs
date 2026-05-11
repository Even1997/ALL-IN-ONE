import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('chat conversation pane keeps inline approval interaction cards wired even when timeline events exist', async () => {
  const source = await readFile('src/components/workspace/AIChatConversationMessagesPane.tsx', 'utf8');

  assert.match(source, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(source, /getRuntimeApprovalRenderEntries/);
  assert.doesNotMatch(source, /AIChatRuntimeApprovalList/);
  assert.doesNotMatch(source, /Number\.MAX_SAFE_INTEGER/);
});
