import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadNativeOutputModel = async () =>
  import(`../../src/components/workspace/assistantNativeMessageOutputModel.ts?test=${Date.now()}`);

const buildAssistantMessage = (id, timeline = []) => ({
  id,
  role: 'assistant',
  timeline,
  createdAt: 1,
});

test('native output model keeps reasoning in process and moves completed prose into the final answer lane', async () => {
  const { buildAssistantNativeMessageOutputModel } = await loadNativeOutputModel();
  const rendered = [];
  const model = buildAssistantNativeMessageOutputModel({
    message: buildAssistantMessage('assistant-1', [
      { id: 'reasoning-1', kind: 'reasoning', content: 'Inspect file A', collapsed: false, status: 'completed', createdAt: 10 },
      { id: 'text-1', kind: 'text', content: 'First paragraph', createdAt: 20 },
      { id: 'reasoning-2', kind: 'reasoning', content: 'Inspect file B', collapsed: false, status: 'completed', createdAt: 30 },
      { id: 'text-2', kind: 'text', content: 'Second paragraph', createdAt: 40 },
    ]),
    renderMessagePart: (_message, _messageId, part, _index, options) => {
      const payload = {
        type: part.type,
        content: part.content,
        isStreaming: options?.isStreaming ?? false,
      };
      rendered.push(payload);
      return payload;
    },
  });

  assert.deepEqual(rendered, [
    { type: 'thinking', content: 'Inspect file A', isStreaming: false },
    { type: 'thinking', content: 'Inspect file B', isStreaming: false },
    { type: 'text', content: 'First paragraph\n\nSecond paragraph', isStreaming: false },
  ]);
  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['assistant-1-reasoning-1', 'assistant-1-reasoning-2'],
  );
  assert.equal(model.finalAnswerItem?.key, 'assistant-1-answer-text');
  assert.equal(model.copyText, 'First paragraph\n\nSecond paragraph');
  assert.equal(model.hasVisibleContent, true);
});

test('native output model keeps the active answer in the shared process chronology while streaming', async () => {
  const { buildAssistantNativeMessageOutputModel } = await loadNativeOutputModel();
  const rendered = [];
  const model = buildAssistantNativeMessageOutputModel({
    message: buildAssistantMessage('assistant-2', [
      { id: 'text-persisted', kind: 'text', content: 'Stored answer', createdAt: 5 },
    ]),
    draftState: {
      timeline: [
        { id: 'reasoning-draft', kind: 'reasoning', content: 'Working through it', collapsed: false, status: 'streaming', createdAt: 10 },
        { id: 'text-draft-1', kind: 'text', content: 'Streaming paragraph one', createdAt: 20 },
        { id: 'text-draft-2', kind: 'text', content: 'Streaming paragraph two', createdAt: 30 },
      ],
      isStreaming: true,
      streamingStartedAt: 20,
    },
    renderMessagePart: (_message, _messageId, part, _index, options) => {
      const payload = {
        type: part.type,
        content: part.content,
        isStreaming: options?.isStreaming ?? false,
      };
      rendered.push(payload);
      return payload;
    },
  });

  assert.deepEqual(rendered, [
    { type: 'thinking', content: 'Working through it', isStreaming: true },
    { type: 'text', content: 'Streaming paragraph one\n\nStreaming paragraph two', isStreaming: true },
  ]);
  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['assistant-2-reasoning-draft', 'assistant-2-answer-text'],
  );
  assert.equal(model.finalAnswerItem, null);
  assert.equal(model.isStreaming, true);
  assert.equal(model.copyText, 'Streaming paragraph one\n\nStreaming paragraph two');
});

test('native output model merges runtime timeline items into the same ordered process stream without affecting copy text', async () => {
  const { buildAssistantNativeMessageOutputModel } = await loadNativeOutputModel();
  const rendered = [];
  const model = buildAssistantNativeMessageOutputModel({
    message: buildAssistantMessage('assistant-3', [
      { id: 'reasoning-1', kind: 'reasoning', content: 'Inspect progress', collapsed: false, status: 'completed', createdAt: 10 },
      { id: 'text-1', kind: 'text', content: 'Final answer', createdAt: 40 },
    ]),
    timelineItems: [
      {
        key: 'tool-1',
        node: { type: 'tool', label: 'tool-1' },
        createdAt: 20,
        timelineOrder: 1,
      },
      {
        key: 'approval-1',
        node: { type: 'approval', label: 'approval-1' },
        createdAt: 30,
        timelineOrder: 2,
      },
    ],
    renderMessagePart: (_message, _messageId, part, _index, options) => {
      const payload = {
        type: part.type,
        content: part.content,
        isStreaming: options?.isStreaming ?? false,
      };
      rendered.push(payload);
      return payload;
    },
  });

  assert.deepEqual(rendered, [
    { type: 'thinking', content: 'Inspect progress', isStreaming: false },
    { type: 'text', content: 'Final answer', isStreaming: false },
  ]);
  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['assistant-3-reasoning-1', 'tool-1', 'approval-1'],
  );
  assert.equal(model.finalAnswerItem?.key, 'assistant-3-answer-text');
  assert.equal(model.copyText, 'Final answer');
  assert.equal(model.hasVisibleContent, true);
});

test('AI chat defaults assistant messages to native output observation mode', async () => {
  const [chatSource, paneSource, listSource, itemSource] = await Promise.all([
    readFile('src/components/workspace/AIChat.tsx', 'utf8'),
    readFile('src/components/workspace/AIChatConversationMessagesPane.tsx', 'utf8'),
    readFile('src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx', 'utf8'),
    readFile('src/components/ai/gn-agent/GNAgentMessageItem.tsx', 'utf8'),
  ]);

  assert.match(chatSource, /const ASSISTANT_OUTPUT_DISPLAY_MODE: 'composed' \| 'native' = 'native';/);
  assert.match(chatSource, /assistantDisplayMode=\{ASSISTANT_OUTPUT_DISPLAY_MODE\}/);
  assert.match(paneSource, /assistantDisplayMode\?: 'composed' \| 'native';/);
  assert.match(listSource, /assistantDisplayMode\?: 'composed' \| 'native';/);
  assert.match(itemSource, /assistantDisplayMode = 'composed'/);
  assert.match(itemSource, /buildAssistantNativeMessageOutputModel/);
  assert.match(listSource, /nativeTimelineItemsByMessage/);
  assert.match(itemSource, /nativeTimelineItems/);
  assert.match(itemSource, /const activeAssistantOutputModel =/);
});
