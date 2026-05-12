import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const messageListPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const messageItemPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentMessageItem.tsx');
const messageFlowPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentMessageFlow.ts');
const messageTimelineRenderModelPath = path.resolve(
  __dirname,
  '../../src/components/workspace/timeline/chatMessageTimelineRenderModel.ts'
);
const messageOrderingPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/messageTimelineOrdering.ts');

test('GN Agent message flow merges projection cards with message-level timeline items into one process source', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');
  const messageItemSource = await readFile(messageItemPath, 'utf8');
  const outputModelSource = await readFile(
    path.resolve(__dirname, '../../src/components/workspace/assistantMessageOutputModel.ts'),
    'utf8',
  );

  assert.match(messageListSource, /type MessageBubbleCard =/);
  assert.match(messageListSource, /const earliestRuntimeEventTime = getEarliestRuntimeEventTime\(message\);/);
  assert.match(messageListSource, /const timelineCards = renderTimelineCards\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /const messageLevelTimelineItems: Array<MessageBubbleCard \| null> = \[/);
  assert.match(messageListSource, /timelineItemsByMessage: timelineMap,/);
  assert.match(messageListSource, /\.\.\.toolExecutionCards\.map\(\(card\) => \(\{/);
  assert.match(messageListSource, /createdAt: card\.createdAt \?\? earliestRuntimeEventTime \?\? message\.createdAt,/);
  assert.match(outputModelSource, /timelineItems\?: Array/);
  assert.match(messageItemSource, /timelineItems:/);
  assert.doesNotMatch(messageItemSource, /supplementalCards/);
  assert.doesNotMatch(messageItemSource, /sortMessageRenderItems\(\[\.\.\.thinkingRenderItems,\s*\.\.\.bubbleRenderItems\]\)/);
  assert.doesNotMatch(messageListSource, /areMessageListPropsEqual/);
  assert.doesNotMatch(messageItemSource, /areMessageItemPropsEqual/);
  assert.doesNotMatch(messageItemSource, /buildGNAgentMessageFlow/);
});

test('GN Agent message flow derives runtime cards from the live draft timeline while streaming', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');

  assert.match(messageListSource, /draftContents\?\.\[message\.id\]/);
  assert.match(messageListSource, /draftState=\{draftContents\?\.\[message\.id\]\}/);
  assert.doesNotMatch(messageListSource, /streamingState=\{draftContents\?\.\[message\.id\]\}/);
  assert.match(messageListSource, /const earliestRuntimeEventTime = getEarliestRuntimeEventTime\(message\);/);
  assert.match(messageListSource, /const toolExecutionCards = renderToolExecutionCard\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /const runtimeApprovalCards = renderRuntimeApproval\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /const runtimeQuestionCards = renderRuntimeQuestion\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /timelineItemsByMessage/);
  assert.match(messageListSource, /renderTimelineCards,\s*[\r\n\s]*renderTimelineProcessSummary,\s*[\r\n\s]*renderStructuredCards,/);
});

test('GN Agent message flow carries timeline process summaries separately from visible bubble cards', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.match(messageListSource, /type MessageProcessSummary =/);
  assert.match(messageListSource, /renderTimelineProcessSummary\?: \(message: StoredChatMessage\) => MessageProcessSummary \| null;/);
  assert.match(messageListSource, /const processSummary = renderTimelineProcessSummary\?\.\(message\) \|\| null;/);
  assert.match(messageListSource, /processSummaryByMessageId\[message\.id\] = processSummary;/);
  assert.match(messageListSource, /processSummary=\{processSummaryByMessageId\[message\.id\] \?\? null\}/);
  assert.match(messageItemSource, /processSummary\?:/);
  assert.match(messageItemSource, /elapsedSeconds\?: number;/);
  assert.match(messageItemSource, /processSummary:\s*_processSummary/);
  assert.doesNotMatch(messageItemSource, /processSummary\?\.status/);
  assert.doesNotMatch(messageItemSource, /detailItems/);
});

test('GN Agent message flow has no orphaned production helper module', async () => {
  await assert.rejects(access(messageFlowPath));
});

test('GN Agent message flow moves unified timeline ordering into the shared workspace timeline helper', async () => {
  await access(messageTimelineRenderModelPath);
  await assert.rejects(access(messageOrderingPath));
});

test('GN Agent message item keeps thinking in the shared process lane without local expand state', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.doesNotMatch(messageItemSource, /expandedThinkingKeys/);
  assert.doesNotMatch(messageItemSource, /setExpandedThinkingKeys/);
  assert.doesNotMatch(messageItemSource, /thinkingExpanded/);
  assert.doesNotMatch(messageItemSource, /onToggleThinking/);
  assert.match(messageItemSource, /timelineRenderModel\.processGroups/);
  assert.match(messageItemSource, /className=\"chat-message-thinking-lane\"/);
});

test('GN Agent message item consumes a unified timeline model instead of sorting mixed runtime cards locally', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');
  const outputModelSource = await readFile(
    path.resolve(__dirname, '../../src/components/workspace/assistantMessageOutputModel.ts'),
    'utf8',
  );

  assert.match(messageItemSource, /buildAssistantMessageOutputModel/);
  assert.match(outputModelSource, /buildChatMessageTimelineRenderModel/);
  assert.match(messageItemSource, /timelineRenderModel\.processGroups/);
  assert.doesNotMatch(messageItemSource, /assistantDisplayMode/);
  assert.doesNotMatch(messageItemSource, /streamingState\?: AssistantStreamingState;/);
  assert.doesNotMatch(messageItemSource, /streamingState,/);
  assert.doesNotMatch(messageItemSource, /sortMessageRenderItems\(\[\.\.\.thinkingRenderItems,\s*\.\.\.bubbleRenderItems\]\)/);
});

test('GN Agent message item keeps the process lane expanded after the answer completes', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.match(messageItemSource, /className="chat-message-process-inline"/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-fold/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-summary/);
  assert.doesNotMatch(messageItemSource, /chat-message-process-elapsed/);
  assert.doesNotMatch(messageItemSource, /useEffect/);
  assert.doesNotMatch(messageItemSource, /processFoldExpanded/);
  assert.doesNotMatch(messageItemSource, /setProcessFoldExpanded/);
});
