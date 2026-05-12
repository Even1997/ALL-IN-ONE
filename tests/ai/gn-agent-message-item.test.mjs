import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadTimelineRenderModel = async () =>
  import(`../../src/components/workspace/timeline/chatMessageTimelineRenderModel.ts?test=${Date.now()}`);

test('message timeline render model places active response on the same process chronology', async () => {
  const { buildChatMessageTimelineRenderModel } = await loadTimelineRenderModel();

  const model = buildChatMessageTimelineRenderModel({
    thinkingItems: [
      {
        key: 'thinking-1',
        node: null,
        createdAt: 10,
        timelineOrder: 0,
        laneKind: 'thinking_lane',
      },
    ],
    timelineCardItems: [
      {
        key: 'tool-1',
        node: null,
        createdAt: 20,
        timelineOrder: 1,
        laneKind: 'bubble',
      },
      {
        key: 'tool-2',
        node: null,
        createdAt: 40,
        timelineOrder: 3,
        laneKind: 'bubble',
      },
    ],
    activeResponseItem: {
      key: 'text-1',
      node: null,
      createdAt: 30,
      timelineOrder: 2,
      laneKind: 'answer_lane',
    },
    finalAnswerItem: null,
  });

  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['thinking-1', 'tool-1', 'text-1', 'tool-2']
  );
});

test('message timeline render model keeps active response in the shared ordered process source', async () => {
  const { buildChatMessageTimelineRenderModel } = await loadTimelineRenderModel();

  const model = buildChatMessageTimelineRenderModel({
    thinkingItems: [],
    timelineCardItems: [
      {
        key: 'tool-1',
        node: null,
        createdAt: 10,
        timelineOrder: 0,
        laneKind: 'bubble',
      },
      {
        key: 'tool-2',
        node: null,
        createdAt: 20,
        timelineOrder: 1,
        laneKind: 'bubble',
      },
    ],
    activeResponseItem: {
      key: 'text-1',
      node: null,
      createdAt: 30,
      timelineOrder: 2,
      laneKind: 'answer_lane',
    },
    finalAnswerItem: null,
  });

  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['tool-1', 'tool-2', 'text-1']
  );
});

test('message timeline render model uses active answer ordering for same-timestamp chronology', async () => {
  const { buildChatMessageTimelineRenderModel } = await loadTimelineRenderModel();

  const model = buildChatMessageTimelineRenderModel({
    thinkingItems: [],
    timelineCardItems: [
      {
        key: 'tool-1',
        node: null,
        createdAt: 20,
        timelineOrder: 1,
        laneKind: 'bubble',
      },
    ],
    activeResponseItem: {
      key: 'text-1',
      node: null,
      createdAt: 20,
      timelineOrder: 2,
      laneKind: 'answer_lane',
    },
    finalAnswerItem: null,
  });

  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['tool-1', 'text-1']
  );
});

test('message timeline render model keeps the final answer separate from process chronology', async () => {
  const { buildChatMessageTimelineRenderModel } = await loadTimelineRenderModel();

  const model = buildChatMessageTimelineRenderModel({
    thinkingItems: [{ key: 'thinking-1', node: null, createdAt: 10, laneKind: 'thinking_lane' }],
    timelineCardItems: [{ key: 'tool-1', node: null, createdAt: 20, laneKind: 'bubble' }],
    activeResponseItem: null,
    finalAnswerItem: { key: 'answer-1', node: null, createdAt: 30, laneKind: 'answer_lane' },
  });

  assert.deepEqual(
    model.processItems.map((item) => item.key),
    ['thinking-1', 'tool-1'],
  );
  assert.equal(model.finalAnswerItem?.key, 'answer-1');
});

test('embedded message list timestamps run summary cards from the latest runtime event', async () => {
  const source = await readFile('src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx', 'utf8');

  assert.match(source, /const getLatestRuntimeEventTime =/);
  assert.match(source, /createdAt:\s*latestRuntimeEventTime\s*\?\?\s*message\.createdAt/);
  assert.doesNotMatch(source, /runSummaryNode\s*\?\s*\{\s*node:\s*runSummaryNode,\s*createdAt:\s*message\.createdAt\s*\}/);
});

test('GN Agent message item separates process rendering from the final answer body', async () => {
  const messageItemSource = await readFile('src/components/ai/gn-agent/GNAgentMessageItem.tsx', 'utf8');
  const outputModelSource = await readFile('src/components/workspace/assistantMessageOutputModel.ts', 'utf8');

  assert.match(messageItemSource, /buildAssistantMessageOutputModel/);
  assert.match(messageItemSource, /const processGroups = assistantMessageOutputModel\?\.timelineRenderModel\.processGroups \|\| \[\];/);
  assert.match(messageItemSource, /const answerBodyRenderItem = assistantMessageOutputModel\?\.finalAnswerItem \?\? null;/);
  assert.match(messageItemSource, /const hasProcessArtifacts =/);
  assert.match(messageItemSource, /const shouldShowCompletedProcessFold =/);
  assert.match(messageItemSource, /className="chat-message-process-fold"/);
  assert.match(messageItemSource, /className="chat-message-process-inline"/);
  assert.match(messageItemSource, /className="chat-message-process-elapsed"/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-kicker/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-status/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-detail-toggle/);
  assert.doesNotMatch(messageItemSource, /TimelineDetailDrawer/);
  assert.match(messageItemSource, /chat-message-final-answer/);
  assert.doesNotMatch(messageItemSource, /sortMessageRenderItems\(\[\.\.\.thinkingRenderItems,\s*\.\.\.bubbleRenderItems\]\)/);
  assert.match(outputModelSource, /buildChatMessageTimelineRenderModel/);
  assert.match(outputModelSource, /activeResponseItem:\s*isStreaming \? answerRenderItem : null/);
  assert.match(outputModelSource, /finalAnswerItem:\s*isStreaming \? null : answerRenderItem/);
});
