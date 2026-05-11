import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const conversationPanePath = path.resolve(
  __dirname,
  '../../src/components/workspace/AIChatConversationMessagesPane.tsx',
);

test('AIChat composes chat surfaces from focused runtime selectors and message-pane boundaries', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useActiveConversationSelection/);
  assert.match(source, /useActiveConversationRunStateSignals/);
  assert.match(source, /useRuntimeConversationGateway/);
  assert.match(source, /AIChatConversationMessagesPane/);
  assert.match(source, /activeSession\?\.messages,/);
  assert.match(source, /activePendingQuestionSummary/);
  assert.match(source, /activeStatusVerb/);
  assert.match(source, /renderTimelineCards/);
  assert.match(source, /renderRuntimeQuestion/);
});

test('conversation pane stays a message-surface boundary instead of owning direct live-state reconstruction', async () => {
  const source = await readFile(conversationPanePath, 'utf8');

  assert.match(source, /useActiveConversationMessages/);
  assert.match(source, /GNAgentMessageList/);
  assert.match(source, /draftContents=\{draftContents\}/);
  assert.match(source, /renderMessagePart=\{renderMessagePart\}/);
  assert.match(source, /renderTimelineCards=\{renderTimelineCards\}/);
});
