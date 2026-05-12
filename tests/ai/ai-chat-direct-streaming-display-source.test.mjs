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
const loadDraftProjection = async () =>
  import(`../../src/components/workspace/assistantStreamingDraftProjection.ts?test=${Date.now()}`);
const loadRenderModel = async () =>
  import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

const buildAssistantMessage = (id, timeline = []) => ({
  id,
  role: 'assistant',
  timeline,
  createdAt: 1,
});

test('direct streaming display keeps draft timeline text scoped to the active streaming message only', async () => {
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
  );
  const activeModel = buildAssistantRenderModel(
    activeMessage,
    {
      timeline: [{ id: 'text-draft', kind: 'text', content: 'slower active draft', createdAt: 4 }],
      isStreaming: true,
    },
  );

  assert.equal(olderModel.content, 'older persisted answer');
  assert.equal(activeModel.content, 'slower active draft');
});

test('direct streaming display follows the shared timeline source instead of clearing from fast projection text alone', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel(
    buildAssistantMessage('assistant-empty'),
    {
      timeline: [{ id: 'text-draft', kind: 'text', content: 'stale rebuilt text', createdAt: 2 }],
      isStreaming: true,
    },
  );

  assert.equal(model.content, 'stale rebuilt text');
  assert.equal(model.copyText, 'stale rebuilt text');
  assert.deepEqual(
    model.items.filter((item) => item.part.type === 'text').map((item) => item.part.content),
    ['stale rebuilt text'],
  );
});

test('streaming draft projection rebuilds answer and reasoning directly from the shared timeline projection', async () => {
  const { projectAssistantStreamingDraft } = await loadDraftProjection();

  const draft = projectAssistantStreamingDraft({
    message: buildAssistantMessage('assistant-projection'),
    projection: {
      runId: 'assistant-projection',
      status: 'running',
      cards: [],
      activeMessage: {
        messageId: 'assistant-projection',
        text: 'projection answer',
        startedAt: 5,
        updatedAt: 6,
        isStreaming: true,
      },
      finalMessage: null,
      events: [
        {
          eventId: 'evt-1',
          runId: 'assistant-projection',
          turnId: 'assistant-projection',
          sessionId: 'session-1',
          messageId: 'assistant-projection',
          type: 'reasoning.started',
          payload: {},
          ts: 2,
          seq: 1,
          source: { kind: 'model', provider: 'codex', name: 'assistant' },
        },
        {
          eventId: 'evt-2',
          runId: 'assistant-projection',
          turnId: 'assistant-projection',
          sessionId: 'session-1',
          messageId: 'assistant-projection',
          type: 'reasoning.delta',
          payload: { textChunk: 'projection reasoning' },
          ts: 3,
          seq: 2,
          source: { kind: 'model', provider: 'codex', name: 'assistant' },
        },
      ],
    },
  });

  assert.equal(draft.draft?.isStreaming, true);
  assert.equal(draft.draft?.timeline.find((event) => event.kind === 'text')?.content, 'projection answer');
  assert.equal(
    draft.draft?.timeline.find((event) => event.kind === 'reasoning')?.content,
    'projection reasoning',
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
  assert.match(messageItemSource, /buildAssistantMessageOutputModel\(/);
});

test('AIChat recomputes streaming drafts from shared projection state instead of a live text bypass', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');

  assert.match(chatSource, /projectAssistantStreamingDraft\(/);
  assert.match(chatSource, /const projection =/);
  assert.doesNotMatch(chatSource, /liveState\?\.streamingText/);
  assert.doesNotMatch(chatSource, /liveStreaming:/);
});
