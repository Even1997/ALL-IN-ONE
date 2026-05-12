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
const messageListPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx',
);
const messageItemPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentMessageItem.tsx');
const loadRenderModel = async () =>
  import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

const buildAssistantMessage = (id, timeline = []) => ({
  id,
  role: 'assistant',
  timeline,
  createdAt: 1,
});

test('direct streaming display keeps fast text scoped to the active streaming message only', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const olderMessage = buildAssistantMessage('assistant-older', [
    { id: 'text-older', kind: 'text', content: 'older persisted answer', createdAt: 2 },
  ]);
  const activeMessage = buildAssistantMessage('assistant-active', [
    { id: 'text-active', kind: 'text', content: 'active persisted answer', createdAt: 3 },
  ]);

  const olderModel = buildAssistantRenderModel(
    olderMessage,
    undefined,
    0,
  );
  const activeModel = buildAssistantRenderModel(
    activeMessage,
    {
      timeline: [{ id: 'text-draft', kind: 'text', content: 'slower active draft', createdAt: 4 }],
      streamingText: 'fast active text',
      isStreaming: true,
    },
    0,
  );

  assert.equal(olderModel.content, 'older persisted answer');
  assert.equal(activeModel.content, 'fast active text');
});

test('direct streaming display can clear visible text back to empty when the fast projection is empty', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel(
    buildAssistantMessage('assistant-empty'),
    {
      timeline: [{ id: 'text-draft', kind: 'text', content: 'stale rebuilt text', createdAt: 2 }],
      streamingText: '',
      isStreaming: true,
    },
    0,
  );

  assert.equal(model.content, '');
  assert.equal(model.copyText, '');
  assert.deepEqual(
    model.items.filter((item) => item.part.type === 'text').map((item) => item.part.content),
    [''],
  );
});

test('sidecar chat keeps the direct-display path on the normal message surfaces', async () => {
  const [chatSource, paneSource, messageListSource, messageItemSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(conversationPanePath, 'utf8'),
    readFile(messageListPath, 'utf8'),
    readFile(messageItemPath, 'utf8'),
  ]);

  assert.match(chatSource, /timelineProjectionByMessageId/);
  assert.match(chatSource, /AIChatConversationMessagesPane/);
  assert.match(paneSource, /GNAgentMessageList/);
  assert.match(messageListSource, /GNAgentMessageItem/);
  assert.match(messageItemSource, /buildAssistantRenderModel\(/);
});

test('AIChat recomputes direct streaming drafts from live state updates and passes them into projection', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');

  assert.match(chatSource, /liveState\?\.streamingText/);
  assert.match(chatSource, /liveState\?\.streamingLatencyTrace\?\.sidecarReceivedAt/);
  assert.match(chatSource, /liveStreaming:\s*liveState\s*\?/);
  assert.match(chatSource, /messageId:\s*projection\?\.activeMessage\?\.messageId\s*\|\|\s*null/);
});
