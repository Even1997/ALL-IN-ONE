import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const messageListPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const messageItemPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentMessageItem.tsx');

test('GN Agent message flow carries bubble card timestamps instead of forcing one shared runtime time', async () => {
  const messageListSource = await readFile(messageListPath, 'utf8');
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.match(messageListSource, /type MessageBubbleCard =/);
  assert.match(messageListSource, /const earliestRuntimeEventTime = getEarliestRuntimeEventTime\(message\);/);
  assert.match(messageListSource, /\.\.\.toolExecutionCards\.map\(\(card\) => \(\{/);
  assert.match(messageListSource, /createdAt: card\.createdAt \?\? earliestRuntimeEventTime \?\? message\.createdAt,/);
  assert.match(messageItemSource, /createdAt: bubbleCard\.createdAt,/);
  assert.match(messageItemSource, /const timelineItems = \[\.\.\.partRenderItems, \.\.\.bubbleRenderItems\]/);
  assert.match(messageItemSource, /leftTime - rightTime \|\| left\.timelineIndex - right\.timelineIndex/);
  assert.doesNotMatch(messageListSource, /areMessageListPropsEqual/);
  assert.doesNotMatch(messageItemSource, /areMessageItemPropsEqual/);
  assert.doesNotMatch(messageItemSource, /buildGNAgentMessageFlow/);
});

test('GN Agent message item keeps streaming thinking collapsed but expandable', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.doesNotMatch(messageItemSource, /isStreaming\s*\?\s*true\s*:/);
  assert.match(messageItemSource, /expandedThinkingKeys\[thinkingKey\]\s*\?\?\s*false/);
  assert.doesNotMatch(messageItemSource, /item\.part\.type === 'thinking' && !isStreaming/);
});
