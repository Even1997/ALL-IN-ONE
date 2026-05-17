import assert from 'node:assert/strict';
import test from 'node:test';

const loadOutputModel = async () =>
  import(`../../src/components/workspace/assistantMessageOutputModel.ts?test=${Date.now()}`);

test('assistant message output model stays visible when a message only contains runtime cards', async () => {
  const { buildAssistantMessageOutputModel } = await loadOutputModel();

  const model = buildAssistantMessageOutputModel({
    message: {
      id: 'assistant_runtime_only',
      role: 'assistant',
      timeline: [],
      createdAt: 1,
    },
    renderMessagePart: (_message, _messageId, part) => part.content,
    timelineItems: [
      {
        key: 'approval-card',
        node: 'approval-card',
        createdAt: 2,
        timelineOrder: 0,
      },
    ],
  });

  assert.equal(model.hasVisibleContent, true);
  assert.equal(model.timelineRenderModel.orderedItems.length, 1);
  assert.equal(model.timelineRenderModel.orderedItems[0]?.key, 'approval-card');
});
