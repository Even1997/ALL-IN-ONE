import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAIChatMessageParts } from '../../src/components/workspace/aiChatMessageParts.ts';

test('parseAIChatMessageParts keeps completed think content as a collapsed thinking block', () => {
  const parts = parseAIChatMessageParts('<think>Analyze the references first</think>Final answer: keep the entry clean.');

  assert.deepEqual(parts, [
    { type: 'thinking', content: 'Analyze the references first', collapsed: true },
    { type: 'text', content: 'Final answer: keep the entry clean.' },
  ]);
});

test('parseAIChatMessageParts shows unfinished think streams expanded with content', () => {
  assert.deepEqual(parseAIChatMessageParts('<think>Analyze the current page'), [
    { type: 'thinking', content: 'Analyze the current page', collapsed: false },
  ]);
});

test('parseAIChatMessageParts extracts tool calls as operation cards', () => {
  const parts = parseAIChatMessageParts(`Preparing to inspect the directory
<tool_use>
<tool name="bash">
<tool_params>{"command":"npm run build","timeout":60000}</tool_params>
</tool>
</tool_use>
Continuing summary`);

  assert.deepEqual(parts, [
    { type: 'text', content: 'Preparing to inspect the directory' },
    {
      type: 'tool',
      name: 'bash',
      title: '运行终端命令',
      command: 'npm run build',
      status: 'running',
    },
    { type: 'text', content: 'Continuing summary' },
  ]);
});

test('parseAIChatMessageParts extracts terminal results separately', () => {
  const parts = parseAIChatMessageParts(`<tool_result name="text" success>
> tauri-app@0.1.0 build
vite build
</tool_result>
Build complete.`);

  assert.deepEqual(parts, [
    {
      type: 'tool',
      name: 'terminal',
      title: '终端输出',
      output: '> tauri-app@0.1.0 build\nvite build',
      status: 'success',
    },
    { type: 'text', content: 'Build complete.' },
  ]);
});

test('parseAIChatMessageParts turns loading placeholders into thinking state', () => {
  assert.deepEqual(parseAIChatMessageParts('正在思考...'), [{ type: 'thinking', content: '', collapsed: false }]);
});
