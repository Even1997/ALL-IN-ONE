import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const cardsPath = path.resolve(__dirname, '../../src/components/workspace/AIChatRuntimeInteractionCards.tsx');

test('AIChat lazy-loads runtime interaction cards instead of inlining approval and question renderers', async () => {
  const [chatSource, cardsSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(cardsPath, 'utf8'),
  ]);

  assert.match(chatSource, /const LazyAIChatRuntimeApprovalList = lazy\(async \(\) =>/);
  assert.match(chatSource, /const LazyAIChatRuntimeTimelineInteractionEvent = lazy\(async \(\) =>/);
  assert.match(chatSource, /import\('\.\/AIChatRuntimeInteractionCards'\)/);
  assert.match(chatSource, /<LazyAIChatRuntimeApprovalList/);
  assert.match(chatSource, /<LazyAIChatRuntimeTimelineInteractionEvent/);
  assert.doesNotMatch(chatSource, /const RuntimeQuestionBlock: React\.FC/);
  assert.doesNotMatch(chatSource, /const renderApprovalEvent = \(event/);
  assert.doesNotMatch(chatSource, /const renderQuestionEvent = \(event/);

  assert.match(cardsSource, /export const AIChatRuntimeApprovalList/);
  assert.match(cardsSource, /export const AIChatRuntimeTimelineInteractionEvent/);
  assert.match(cardsSource, /chat-runtime-approval-list/);
  assert.match(cardsSource, /chat-runtime-question-item/);
  assert.match(cardsSource, /chat-runtime-question-card/);
});
