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
