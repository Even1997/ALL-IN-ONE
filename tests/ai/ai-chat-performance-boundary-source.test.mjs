import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat uses fine-grained runtime hooks instead of a single conversation projection', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useActiveConversationSelection/);
  assert.match(source, /useActiveConversationRunStateSignals/);
  assert.match(source, /AIChatConversationMessagesPane/);
  assert.match(source, /AIChatRuntimeStatusPanel/);
  assert.match(source, /AIChatRuntimeTasksPanel/);
  assert.match(source, /activeSession\?\.messages,/);
  assert.match(source, /activePendingQuestionSummary/);
  assert.match(source, /activeStatusVerb/);
  assert.doesNotMatch(source, /const conversation = useRuntimeConversationGateway/);
  assert.doesNotMatch(source, /const messages = conversation\.messages/);
  assert.doesNotMatch(source, /const pendingApprovals = conversation\.pendingApprovals/);
});
