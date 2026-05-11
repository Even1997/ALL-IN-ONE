import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const panePath = path.resolve(__dirname, '../../src/components/workspace/AIChatConversationMessagesPane.tsx');
const cardsPath = path.resolve(__dirname, '../../src/components/workspace/AIChatRuntimeInteractionCards.tsx');

test('runtime interaction cards stay extracted into a shared module without reviving the legacy approval-list renderer', async () => {
  const [chatSource, paneSource, cardsSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(panePath, 'utf8'),
    readFile(cardsPath, 'utf8'),
  ]);

  assert.match(chatSource, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(paneSource, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(paneSource, /getRuntimeApprovalRenderEntries/);
  assert.doesNotMatch(paneSource, /AIChatRuntimeApprovalList/);
  assert.doesNotMatch(chatSource, /LazyAIChatRuntimeApprovalList/);
  assert.doesNotMatch(chatSource, /LazyAIChatRuntimeTimelineInteractionEvent/);

  assert.match(cardsSource, /export const AIChatRuntimeTimelineInteractionEvent/);
  assert.match(cardsSource, /chat-runtime-question-item/);
  assert.match(cardsSource, /chat-runtime-question-card/);
  assert.match(cardsSource, /chat-runtime-approval-actions/);
  assert.doesNotMatch(cardsSource, /export const AIChatRuntimeApprovalList/);
});
