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
const messageOrderingPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/messageTimelineOrdering.ts');

test('GN Agent message flow carries bubble card timestamps instead of forcing one shared runtime time', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');
  const messageItemSource = await readFile(messageItemPath, 'utf8');
  const messageOrderingSource = await readFile(messageOrderingPath, 'utf8');

  assert.match(messageListSource, /type MessageBubbleCard =/);
  assert.match(messageListSource, /const earliestRuntimeEventTime = getEarliestRuntimeEventTime\(message\);/);
  assert.match(messageListSource, /\.\.\.toolExecutionCards\.map\(\(card\) => \(\{/);
  assert.match(messageListSource, /createdAt: card\.createdAt \?\? earliestRuntimeEventTime \?\? message\.createdAt,/);
  assert.match(messageItemSource, /createdAt: bubbleCard\.createdAt,/);
  assert.match(messageItemSource, /sortMessageRenderItems\(\[\.\.\.allRenderItems,\s*\.\.\.bubbleRenderItems\]\)/);
  assert.doesNotMatch(messageItemSource, /pinNarrativeFirst:/);
  assert.match(messageOrderingSource, /return leftTime - rightTime;/);
  assert.match(messageOrderingSource, /return leftTimelineOrder - rightTimelineOrder;/);
  assert.match(messageOrderingSource, /return left\.timelineIndex - right\.timelineIndex;/);
  assert.doesNotMatch(messageListSource, /areMessageListPropsEqual/);
  assert.doesNotMatch(messageItemSource, /areMessageItemPropsEqual/);
  assert.doesNotMatch(messageItemSource, /buildGNAgentMessageFlow/);
});

test('GN Agent message flow derives runtime cards from the live draft timeline while streaming', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');

  assert.match(messageListSource, /draftContents\?\.\[message\.id\]/);
  assert.match(messageListSource, /draftState=\{draftContents\?\.\[message\.id\]\}/);
  assert.match(messageListSource, /const earliestRuntimeEventTime = getEarliestRuntimeEventTime\(message\);/);
  assert.match(messageListSource, /const toolExecutionCards = renderToolExecutionCard\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /const runtimeApprovalCards = renderRuntimeApproval\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /const runtimeQuestionCards = renderRuntimeQuestion\?\.\(message\) \|\| \[\];/);
  assert.match(messageListSource, /renderTimelineCards,\s*[\r\n\s]*renderStructuredCards,/);
});

test('GN Agent message flow has no orphaned production helper module', async () => {
  await assert.rejects(access(messageFlowPath));
});

test('GN Agent message item keeps streaming thinking collapsed but expandable', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');
  const messageOrderingSource = await readFile(messageOrderingPath, 'utf8');

  assert.doesNotMatch(messageItemSource, /isStreaming\s*\?\s*true\s*:/);
  assert.match(messageItemSource, /expandedThinkingKeys\[thinkingKey\]\s*\?\?\s*!hasCompletedAnswer/);
  assert.doesNotMatch(messageItemSource, /item\.part\.type === 'thinking' && !isStreaming/);
  assert.match(messageItemSource, /groupMessageRenderItemsByLane\(timelineRenderItems\)/);
  assert.match(messageItemSource, /className=\"chat-message-thinking-lane\"/);
  assert.match(messageOrderingSource, /export const groupMessageRenderItemsByLane =/);
});

test('GN Agent message item sorts the answer lane with process and runtime cards', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.doesNotMatch(messageItemSource, /const answerRenderItems:\s*MessageRenderItem\[\]\s*=\s*\[\];/);
  assert.doesNotMatch(messageItemSource, /answerRenderItems\.map\(\(item\) =>/);
  assert.match(messageItemSource, /const timelineRenderItems = sortMessageRenderItems\(\[\.\.\.allRenderItems,\s*\.\.\.bubbleRenderItems\]\);/);
  assert.match(messageItemSource, /groupMessageRenderItemsByLane\(timelineRenderItems\)/);
});

test('GN Agent message item auto-collapses thinking after the answer completes', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.match(messageItemSource, /const hasCompletedAnswer =/);
  assert.match(messageItemSource, /expandedThinkingKeys\[thinkingKey\]\s*\?\?\s*!hasCompletedAnswer/);
});
