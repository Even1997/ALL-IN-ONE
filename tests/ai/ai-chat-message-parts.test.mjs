import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssistantMessageParts,
  buildAssistantStructuredContentState,
  parseAIChatMessageParts,
} from '../../src/components/workspace/aiChatMessageParts.ts';

test('buildAssistantStructuredContentState strips legacy bash blocks and keeps planning as thinking', () => {
  const state = buildAssistantStructuredContentState({
    content: [
      '好的，我先查看一下项目现有的 sketch 目录和相关文件，然后按移动优先的规范输出首页草图。',
      '<bash>',
      '<cmd>Get-ChildItem sketch</cmd>',
      '</bash>',
      '## 首页草图',
      '- 顶部搜索',
      '- 今日推荐',
    ].join('\n\n'),
    thinkingCollapsed: true,
  });

  assert.equal(
    state.thinkingContent,
    '好的，我先查看一下项目现有的 sketch 目录和相关文件，然后按移动优先的规范输出首页草图。'
  );
  assert.equal(state.answerContent, '## 首页草图\n\n- 顶部搜索\n\n- 今日推荐');
  assert.doesNotMatch(state.content, /<bash>|<cmd>|Get-ChildItem sketch/);
});

test('parseAIChatMessageParts keeps completed think content as a collapsed thinking block', () => {
  const parts = parseAIChatMessageParts('<think>Analyze the references first</think>Final answer: keep the entry clean.');

  assert.deepEqual(parts, [
    { type: 'thinking', content: 'Analyze the references first', collapsed: true },
    { type: 'text', content: 'Final answer: keep the entry clean.' },
  ]);
});

test('buildAssistantStructuredContentState strips fragmented tool protocol tags', () => {
  const state = buildAssistantStructuredContentState({
    content: [
      '思考过程 The user wants a stable answer.',
      '<tool_',
      'use>',
      '<tool',
      '_use>',
      '好的，我已经查看了项目状态。',
      '最终答案：这里是干净的正文。',
    ].join('\n\n'),
    thinkingCollapsed: true,
  });

  assert.doesNotMatch(state.content, /<tool_|use>|<tool|_use>/);
  assert.doesNotMatch(state.answerContent, /<tool_|use>|<tool|_use>/);
  assert.match(state.answerContent, /最终答案：这里是干净的正文。/);
});

test('buildAssistantMessageParts cleans answerContent before rendering text parts', () => {
  const parts = buildAssistantMessageParts({
    answerContent: ['最终答案之前', '<tool_', 'use>', '最终答案之后'].join('\n\n'),
  });

  assert.deepEqual(parts, [{ type: 'text', content: '最终答案之前\n\n最终答案之后' }]);
});

test('buildAssistantStructuredContentState preserves preferred assistant part ordering and timestamps', () => {
  const state = buildAssistantStructuredContentState({
    content: '<think>先看目录</think>\n\n我先检查一下项目结构。\n\n再给你草稿。',
    preferredAssistantParts: [
      { type: 'thinking', content: '先看目录', collapsed: false, createdAt: 10 },
      { type: 'text', content: '我先检查一下项目结构。', createdAt: 20 },
      { type: 'text', content: '再给你草稿。', createdAt: 30 },
    ],
    thinkingCollapsed: true,
  });

  assert.deepEqual(state.assistantParts, [
    { type: 'thinking', content: '先看目录', collapsed: true, createdAt: 10 },
    { type: 'text', content: '我先检查一下项目结构。', createdAt: 20 },
    { type: 'text', content: '再给你草稿。', createdAt: 30 },
  ]);
});

test('buildAssistantStructuredContentState keeps streamed narrative segments when final content only contains the latest answer text', () => {
  const state = buildAssistantStructuredContentState({
    content: 'Now fix the second issue.',
    preferredAssistantParts: [
      { type: 'thinking', content: 'Check the first issue.', collapsed: true, createdAt: 10 },
      { type: 'text', content: 'The first check is done.', createdAt: 20 },
      { type: 'text', content: 'Now fix the second issue.', createdAt: 30 },
    ],
    thinkingCollapsed: true,
  });

  assert.deepEqual(state.assistantParts, [
    { type: 'thinking', content: 'Check the first issue.', collapsed: true, createdAt: 10 },
    { type: 'text', content: 'The first check is done.', createdAt: 20 },
    { type: 'text', content: 'Now fix the second issue.', createdAt: 30 },
  ]);
});

test('buildAssistantStructuredContentState strips legacy transcript tool echoes', () => {
  const state = buildAssistantStructuredContentState({
    content: [
      '好的，我先看一下项目文件夹结构。',
      '<tool_use>',
      '</tool_use>',
      'user:',
      'Tool ls result:',
      '<tool_result name="ls" status="success">',
      'src',
      '</tool_result>',
      '结论：项目可以继续整理。',
    ].join('\n'),
    thinkingCollapsed: true,
  });

  assert.equal(state.thinkingContent, '');
  assert.equal(state.answerContent, '好的，我先看一下项目文件夹结构。\n\n结论：项目可以继续整理。');
  assert.doesNotMatch(state.content, /tool_use|tool_result|Tool ls result|^user:/m);
});

test('parseAIChatMessageParts keeps unfinished think streams collapsed with content', () => {
  assert.deepEqual(parseAIChatMessageParts('<think>Analyze the current page'), [
    { type: 'thinking', content: 'Analyze the current page', collapsed: true },
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
      input: '{"command":"npm run build","timeout":60000}',
      status: 'running',
    },
    { type: 'text', content: 'Continuing summary' },
  ]);
});

test('parseAIChatMessageParts extracts terminal results separately', () => {
  const parts = parseAIChatMessageParts(`<tool_result name="terminal" success>
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

test('parseAIChatMessageParts extracts legacy bash command blocks as operation cards', () => {
  const parts = parseAIChatMessageParts(`Checking workspace
<bash>
<cmd>Get-ChildItem sketch</cmd>
</bash>
Summary continues`);

  assert.deepEqual(parts, [
    { type: 'text', content: 'Checking workspace' },
    {
      type: 'tool',
      name: 'bash',
      title: '运行终端命令',
      command: 'Get-ChildItem sketch',
      input: 'Get-ChildItem sketch',
      status: 'running',
    },
    { type: 'text', content: 'Summary continues' },
  ]);
});

test('parseAIChatMessageParts turns loading placeholders into thinking state', () => {
  assert.deepEqual(parseAIChatMessageParts('正在思考...'), [{ type: 'thinking', content: '', collapsed: true }]);
});

test('buildAssistantStructuredContentState treats Chinese planning text as thinking', () => {
  const state = buildAssistantStructuredContentState({
    content: '好的，我先看一下项目的文档结构。',
    thinkingCollapsed: true,
  });

  assert.equal(state.thinkingContent, '好的，我先看一下项目的文档结构。');
  assert.equal(state.answerContent, '');
  assert.deepEqual(state.assistantParts, [
    { type: 'thinking', content: '好的，我先看一下项目的文档结构。', collapsed: true },
  ]);
});

test('buildAssistantStructuredContentState strips DSML protocol text from the final answer', () => {
  const state = buildAssistantStructuredContentState({
    content: `思考过程

<|DSML| invoke name="ls">
<|DSML| parameter name="path" string="true">/</|DSML| parameter>
</|DSML| invoke>

总结如下：项目包含 src、tests 和 docs。`,
    thinkingCollapsed: true,
  });

  assert.equal(state.answerContent, '思考过程\n\n总结如下：项目包含 src、tests 和 docs。');
  assert.doesNotMatch(state.content, /DSML|invoke name=|parameter name=/);
});
