import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeStreamingMessageAssembler } from '../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts';

test('runtime streaming assembler keeps streaming thinking collapsed until answer is confirmed', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const firstDraft = assembler.append({
    kind: 'text',
    delta: '我先看看项目结构。',
  });

  assert.equal(firstDraft.answerContent, '');
  assert.equal(firstDraft.thinkingContent, '我先看看项目结构。');
  assert.deepEqual(firstDraft.assistantParts, [
    {
      type: 'thinking',
      content: '我先看看项目结构。',
      collapsed: true,
      createdAt: firstDraft.assistantParts[0]?.createdAt,
    },
  ]);

  const secondDraft = assembler.markToolBoundary();

  assert.equal(secondDraft.answerContent, '');
  assert.equal(secondDraft.thinkingContent, '我先看看项目结构。');
  assert.equal(secondDraft.assistantParts[0]?.type, 'thinking');
  assert.equal(secondDraft.assistantParts[0]?.collapsed, true);
});

test('runtime streaming assembler keeps native thinking stream collapsed', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const thinkingDraft = assembler.append({
    kind: 'thinking',
    delta: '先确认原因，再补测试。',
  });

  assert.equal(thinkingDraft.answerContent, '');
  assert.equal(thinkingDraft.thinkingContent, '先确认原因，再补测试。');
  assert.deepEqual(thinkingDraft.assistantParts, [
    {
      type: 'thinking',
      content: '先确认原因，再补测试。',
      collapsed: true,
      createdAt: thinkingDraft.assistantParts[0]?.createdAt,
    },
  ]);
});

test('runtime streaming assembler keeps final answer body after tool inspection reasoning', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.append({
    kind: 'text',
    delta: '我先看一下项目里已有的文件情况。',
  });
  assembler.markToolBoundary();

  const finalDraft = assembler.buildFinal('# 动漫 APP 需求文档\n\n## 1. 产品定位\n\n面向动漫用户的内容社区。');

  assert.match(finalDraft.content, /# 动漫 APP 需求文档/);
  assert.equal(finalDraft.answerContent, '# 动漫 APP 需求文档\n\n## 1. 产品定位\n\n面向动漫用户的内容社区。');
  assert.equal(finalDraft.assistantParts.at(-1)?.type, 'text');
});
