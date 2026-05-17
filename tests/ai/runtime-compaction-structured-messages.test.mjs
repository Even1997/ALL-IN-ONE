import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compactOldToolResults,
  removeOldestTurn,
} from '../../src/modules/ai/runtime/compaction/compactToolResults.ts';

test('compactOldToolResults summarizes old structured tool_result messages without changing their kind', () => {
  const messages = [
    { kind: 'user', role: 'user', content: 'Inspect file A.' },
    {
      kind: 'assistant_tool_call',
      role: 'assistant',
      content: '',
      toolCallId: 'call_1',
      toolName: 'view',
      input: { file_path: 'src/a.ts' },
    },
    {
      kind: 'tool_result',
      role: 'tool',
      content: 'x'.repeat(5000),
      toolCallId: 'call_1',
      toolName: 'view',
    },
    { kind: 'assistant_text', role: 'assistant', content: 'A is done.' },
    { kind: 'user', role: 'user', content: 'Inspect file B.' },
    {
      kind: 'assistant_tool_call',
      role: 'assistant',
      content: '',
      toolCallId: 'call_2',
      toolName: 'view',
      input: { file_path: 'src/b.ts' },
    },
    {
      kind: 'tool_result',
      role: 'tool',
      content: 'keep me recent',
      toolCallId: 'call_2',
      toolName: 'view',
    },
  ];

  const result = compactOldToolResults(messages, {
    keepRecentRounds: 1,
    maxResultChars: 2000,
    previewChars: 120,
  });

  assert.equal(result.compacted, true);
  assert.equal(messages[2]?.kind, 'tool_result');
  assert.equal(messages[2]?.role, 'tool');
  assert.equal(messages[2]?.toolCallId, 'call_1');
  assert.match(messages[2]?.content, /Tool "view" completed\. Output/);
  assert.equal(messages[6]?.content, 'keep me recent');
});

test('removeOldestTurn removes one whole structured round instead of splitting tool messages away', () => {
  const messages = [
    { kind: 'user', role: 'user', content: 'Inspect file A.' },
    {
      kind: 'assistant_tool_call',
      role: 'assistant',
      content: '',
      toolCallId: 'call_1',
      toolName: 'view',
      input: { file_path: 'src/a.ts' },
    },
    {
      kind: 'tool_result',
      role: 'tool',
      content: '1: a',
      toolCallId: 'call_1',
      toolName: 'view',
    },
    { kind: 'assistant_text', role: 'assistant', content: 'A is done.' },
    { kind: 'user', role: 'user', content: 'Inspect file B.' },
    { kind: 'assistant_text', role: 'assistant', content: 'B is done.' },
  ];

  const result = removeOldestTurn(messages);

  assert.equal(result.compacted, true);
  assert.deepEqual(
    messages.map((message) => message.content),
    ['Inspect file B.', 'B is done.'],
  );
});
