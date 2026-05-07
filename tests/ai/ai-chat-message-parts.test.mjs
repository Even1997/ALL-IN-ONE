import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssistantMessageParts,
  buildAssistantStructuredContentState,
  parseAIChatMessageParts,
} from '../../src/components/workspace/aiChatMessageParts.ts';

test('parseAIChatMessageParts keeps completed think content as a collapsed thinking block', () => {
  const parts = parseAIChatMessageParts('<think>Analyze the references first</think>Final answer: keep the entry clean.');

  assert.deepEqual(parts, [
    { type: 'thinking', content: 'Analyze the references first', collapsed: true },
    { type: 'text', content: 'Final answer: keep the entry clean.' },
  ]);
});

test('parseAIChatMessageParts extracts complete tool calls as operation cards', () => {
  const parts = parseAIChatMessageParts(`Preparing to inspect the directory
<tool_use>
<tool name="bash">
<tool_params>{"command":"npm run build","timeout":60000}</tool_params>
</tool>
</tool_use>
Continuing summary`);

  assert.equal(parts[0].type, 'text');
  assert.equal(parts[0].content, 'Preparing to inspect the directory');
  assert.equal(parts[1].type, 'tool');
  assert.equal(parts[1].name, 'bash');
  assert.equal(parts[1].command, 'npm run build');
  assert.equal(parts[1].input, '{"command":"npm run build","timeout":60000}');
  assert.equal(parts[1].status, 'running');
  assert.equal(parts[2].type, 'text');
  assert.equal(parts[2].content, 'Continuing summary');
});

test('parseAIChatMessageParts extracts terminal results separately', () => {
  const parts = parseAIChatMessageParts(`<tool_result name="terminal" success>
> tauri-app@0.1.0 build
vite build
</tool_result>
Build complete.`);

  assert.equal(parts[0].type, 'tool');
  assert.equal(parts[0].name, 'terminal');
  assert.equal(parts[0].output, '> tauri-app@0.1.0 build\nvite build');
  assert.equal(parts[0].status, 'success');
  assert.deepEqual(parts[1], { type: 'text', content: 'Build complete.' });
});

test('buildAssistantMessageParts treats answerContent as already normalized text', () => {
  const parts = buildAssistantMessageParts({
    answerContent: ['Final answer before', '<tool_', 'use>', 'Final answer after'].join('\n\n'),
  });

  assert.deepEqual(parts, [
    { type: 'text', content: 'Final answer before\n\n<tool_\n\nuse>\n\nFinal answer after' },
  ]);
});

test('buildAssistantStructuredContentState preserves preferred assistant part ordering and timestamps', () => {
  const state = buildAssistantStructuredContentState({
    content: '<think>Inspect first</think>\n\nThen answer.',
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
});

test('buildAssistantStructuredContentState trusts preferred narrative parts over legacy execution text', () => {
  const state = buildAssistantStructuredContentState({
    content: `Preparing to inspect
<tool_use>
<tool name="view">
<tool_params>{"file_path":"src/App.tsx"}</tool_params>
</tool>
</tool_use>
Summarizing the result`,
    preferredAssistantParts: [
      { type: 'text', content: 'Preparing to inspect', createdAt: 10 },
      { type: 'text', content: 'Summarizing the result', createdAt: 20 },
    ],
    thinkingCollapsed: true,
  });

  assert.deepEqual(state.assistantParts, [
    { type: 'text', content: 'Preparing to inspect', createdAt: 10 },
    { type: 'text', content: 'Summarizing the result', createdAt: 20 },
  ]);
  assert.equal(state.thinkingContent, '');
  assert.equal(state.answerContent, 'Preparing to inspect\n\nSummarizing the result');
});
