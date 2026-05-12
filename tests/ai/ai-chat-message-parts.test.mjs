import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssistantMessageParts,
  buildAssistantStructuredContentState,
  parseAIChatMessageParts,
} from '../../src/components/workspace/aiChatMessageParts.ts';

test('parseAIChatMessageParts treats legacy markup as plain answer text', () => {
  const content = '<think>Analyze the references first</think>Final answer: keep the entry clean.';
  const parts = parseAIChatMessageParts(content);

  assert.deepEqual(parts, [{ type: 'text', content }]);
});

test('parseAIChatMessageParts does not restore tool protocol as operation cards', () => {
  const content = `Preparing
<tool_use>
<tool name="bash">
<tool_params>{"command":"npm run build"}</tool_params>
</tool>
</tool_use>
Continuing`;
  const parts = parseAIChatMessageParts(content);

  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'text');
  assert.match(parts[0].content, /<tool_use>/);
});

test('buildAssistantMessageParts uses explicit runtime thinking and answer fields', () => {
  const parts = buildAssistantMessageParts({
    thinkingContent: 'Inspect first',
    answerContent: 'Then answer.',
    thinkingCollapsed: true,
  });

  assert.deepEqual(parts, [
    { type: 'thinking', content: 'Inspect first', collapsed: true },
    { type: 'text', content: 'Then answer.' },
  ]);
});

test('buildAssistantStructuredContentState preserves preferred assistant part ordering and timestamps', () => {
  const state = buildAssistantStructuredContentState({
    content: 'Ignored stale content',
    preferredAssistantParts: [
      { type: 'thinking', content: 'Inspect first', collapsed: false, createdAt: 10 },
      { type: 'text', content: 'Then answer.', createdAt: 20 },
    ],
    thinkingCollapsed: true,
  });

  assert.deepEqual(state.assistantParts, [
    { type: 'thinking', content: 'Inspect first', collapsed: true, createdAt: 10 },
    { type: 'text', content: 'Then answer.', createdAt: 20 },
  ]);
  assert.equal(state.content, 'Then answer.');
});
