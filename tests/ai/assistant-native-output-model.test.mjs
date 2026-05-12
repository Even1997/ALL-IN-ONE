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

test('native output model keeps assistant reasoning and text in the original narrative order', async () => {
  const { buildAssistantNativeMessageOutputModel } = await loadNativeOutputModel();
  const rendered = [];
  const model = buildAssistantNativeMessageOutputModel({
    message: buildAssistantMessage('assistant-1', [
      { id: 'reasoning-1', kind: 'reasoning', content: '先分析', collapsed: false, status: 'completed', createdAt: 10 },
      { id: 'text-1', kind: 'text', content: '第一段正文', createdAt: 20 },
      { id: 'reasoning-2', kind: 'reasoning', content: '补充思考', collapsed: false, status: 'completed', createdAt: 30 },
      { id: 'text-2', kind: 'text', content: '第二段正文', createdAt: 40 },
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

  assert.deepEqual(
    rendered,
    [
      { type: 'thinking', content: '先分析', isStreaming: false },
      { type: 'text', content: '第一段正文', isStreaming: false },
      { type: 'thinking', content: '补充思考', isStreaming: false },
      { type: 'text', content: '第二段正文', isStreaming: false },
    ],
  );
  assert.equal(model.copyText, '第一段正文\n\n第二段正文');
  assert.equal(model.hasVisibleContent, true);
});

test('native output model keeps streaming state only on the active text event from the shared draft timeline', async () => {
  const { buildAssistantNativeMessageOutputModel } = await loadNativeOutputModel();
  const rendered = [];
  const model = buildAssistantNativeMessageOutputModel({
    message: buildAssistantMessage('assistant-2', [
      { id: 'text-persisted', kind: 'text', content: '旧内容', createdAt: 5 },
    ]),
    draftState: {
      timeline: [
        { id: 'reasoning-draft', kind: 'reasoning', content: '流式思考', collapsed: false, status: 'streaming', createdAt: 10 },
        { id: 'text-draft-1', kind: 'text', content: '正在输出第一段', createdAt: 20 },
        { id: 'text-draft-2', kind: 'text', content: '正在输出第二段', createdAt: 30 },
      ],
      isStreaming: true,
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

  assert.deepEqual(
    rendered,
    [
      { type: 'thinking', content: '流式思考', isStreaming: false },
      { type: 'text', content: '正在输出第一段', isStreaming: false },
      { type: 'text', content: '正在输出第二段', isStreaming: true },
    ],
  );
  assert.equal(model.isStreaming, true);
  assert.equal(model.copyText, '正在输出第一段\n\n正在输出第二段');
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
});
