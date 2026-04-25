import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAIChatMessageParts } from '../../src/components/workspace/aiChatMessageParts.ts';

test('parseAIChatMessageParts removes completed think content and keeps answer text', () => {
  const parts = parseAIChatMessageParts('<think>先分析需求</think>最终建议：保持入口简洁。');

  assert.deepEqual(parts, [
    { type: 'text', content: '最终建议：保持入口简洁。' },
  ]);
});

test('parseAIChatMessageParts shows thinking for unfinished think streams', () => {
  assert.deepEqual(parseAIChatMessageParts('<think>先分析需求'), [{ type: 'thinking' }]);
});

test('parseAIChatMessageParts extracts tool calls as operation cards', () => {
  const parts = parseAIChatMessageParts(`准备查看目录
<tool_use>
<tool name="bash">
<tool_params>{"command":"npm run build","timeout":60000}</tool_params>
</tool>
</tool_use>
继续总结`);

  assert.deepEqual(parts, [
    { type: 'text', content: '准备查看目录' },
    {
      type: 'tool',
      name: 'bash',
      title: '运行终端命令',
      command: 'npm run build',
      status: 'running',
    },
    { type: 'text', content: '继续总结' },
  ]);
});

test('parseAIChatMessageParts extracts terminal results separately', () => {
  const parts = parseAIChatMessageParts(`<tool_result name="text" success>
> tauri-app@0.1.0 build
vite build
</tool_result>
构建完成。`);

  assert.deepEqual(parts, [
    {
      type: 'tool',
      name: 'terminal',
      title: '终端输出',
      output: '> tauri-app@0.1.0 build\nvite build',
      status: 'success',
    },
    { type: 'text', content: '构建完成。' },
  ]);
});

test('parseAIChatMessageParts turns loading placeholders into thinking state', () => {
  assert.deepEqual(parseAIChatMessageParts('正在思考…'), [{ type: 'thinking' }]);
});
