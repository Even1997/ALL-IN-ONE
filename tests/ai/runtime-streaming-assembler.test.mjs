import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeStreamingMessageAssembler } from '../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts';

test('runtime streaming assembler keeps pre-tool visible text when a tool boundary starts', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  const firstDraft = assembler.append({
    kind: 'text',
    delta: 'Let me inspect the workspace first.',
  });

  assert.equal(firstDraft.answerContent, 'Let me inspect the workspace first.');
  assert.equal(firstDraft.thinkingContent, '');
  assert.equal(firstDraft.assistantParts.at(-1)?.type, 'text');
  assert.equal(firstDraft.assistantParts.at(-1)?.content, 'Let me inspect the workspace first.');
  assert.match(firstDraft.content, /Let me inspect the workspace first\./);

  const secondDraft = assembler.markToolBoundary();

  assert.equal(secondDraft.answerContent, 'Let me inspect the workspace first.');
  assert.equal(secondDraft.thinkingContent, '');
  assert.equal(secondDraft.assistantParts.at(-1)?.type, 'text');
  assert.equal(secondDraft.assistantParts.at(-1)?.content, 'Let me inspect the workspace first.');
  assert.match(secondDraft.content, /Let me inspect the workspace first\./);
});

test('runtime streaming assembler flushes initial visible text before direct answer streaming continues', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.append({
    kind: 'text',
    delta: 'Checking the current implementation. ',
  });
  const draft = assembler.append({
    kind: 'text',
    delta: 'Here is the answer.',
  });

  assert.equal(draft.answerContent, 'Checking the current implementation. Here is the answer.');
  assert.equal(draft.thinkingContent, '');
  assert.equal(
    draft.assistantParts.at(-1)?.content,
    'Checking the current implementation. Here is the answer.',
  );
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

test('runtime streaming assembler keeps accumulated answer text visible when a later thinking phase starts', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.append({
    kind: 'text',
    delta: 'I found the relevant file.',
  });
  const draft = assembler.append({
    kind: 'thinking',
    delta: 'Now I will verify whether another tool call is needed.',
  });

  assert.equal(draft.answerContent, 'I found the relevant file.');
  assert.equal(draft.thinkingContent, 'Now I will verify whether another tool call is needed.');
  assert.match(draft.content, /I found the relevant file\./);
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

  assert.equal(draft.answerContent, 'Final answer without any tool use.');
  assert.equal(draft.thinkingContent, '');

  const finalDraft = assembler.buildFinal('Final answer without any tool use.');

  assert.equal(finalDraft.answerContent, 'Final answer without any tool use.');
  assert.equal(finalDraft.thinkingContent, '');
  assert.equal(finalDraft.assistantParts.at(-1)?.type, 'text');
  assert.equal(finalDraft.assistantParts.at(-1)?.content, 'Final answer without any tool use.');
});
