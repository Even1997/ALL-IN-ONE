import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeStreamingMessageAssembler } from '../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts';

test('runtime streaming assembler hides provisional text before the model confirms answer or native thinking', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const firstDraft = assembler.append({
    kind: 'text',
    delta: 'Let me inspect the workspace first.',
  });

  assert.equal(firstDraft.answerContent, '');
  assert.equal(firstDraft.thinkingContent, '');
  assert.deepEqual(firstDraft.assistantParts, []);
  assert.equal(firstDraft.content, '正在思考...');

  const secondDraft = assembler.markToolBoundary();

  assert.equal(secondDraft.answerContent, '');
  assert.equal(secondDraft.thinkingContent, '');
  assert.deepEqual(secondDraft.assistantParts, []);
  assert.equal(secondDraft.content, '正在思考...');
});

test('runtime streaming assembler keeps native thinking stream collapsed', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const thinkingDraft = assembler.append({
    kind: 'thinking',
    delta: 'Confirm the cause before patching it.',
  });

  assert.equal(thinkingDraft.answerContent, '');
  assert.equal(thinkingDraft.thinkingContent, 'Confirm the cause before patching it.');
  assert.deepEqual(thinkingDraft.assistantParts, [
    {
      type: 'thinking',
      content: 'Confirm the cause before patching it.',
      collapsed: true,
      createdAt: thinkingDraft.assistantParts[0]?.createdAt,
    },
  ]);
});

test('runtime streaming assembler keeps final answer body after tool inspection reasoning', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.append({
    kind: 'text',
    delta: 'I will inspect the project files first.',
  });
  assembler.markToolBoundary();

  const finalDraft = assembler.buildFinal('# Product PRD\n\n## Positioning\n\nA focused workspace app.');

  assert.match(finalDraft.content, /# Product PRD/);
  assert.equal(finalDraft.answerContent, '# Product PRD\n\n## Positioning\n\nA focused workspace app.');
  assert.equal(finalDraft.thinkingContent, '');
  assert.equal(finalDraft.assistantParts.at(-1)?.type, 'text');
});

test('runtime streaming assembler keeps direct final text when no tool boundary occurs', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const draft = assembler.append({
    kind: 'text',
    delta: 'Final answer without any tool use.',
  });

  assert.equal(draft.answerContent, '');
  assert.equal(draft.thinkingContent, '');

  const finalDraft = assembler.buildFinal('Final answer without any tool use.');

  assert.equal(finalDraft.answerContent, 'Final answer without any tool use.');
  assert.equal(finalDraft.thinkingContent, '');
  assert.equal(finalDraft.assistantParts.at(-1)?.type, 'text');
  assert.equal(finalDraft.assistantParts.at(-1)?.content, 'Final answer without any tool use.');
});
