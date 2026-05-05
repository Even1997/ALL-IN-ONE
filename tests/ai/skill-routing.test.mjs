import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSkillIntent } from '../../src/modules/ai/workflow/skillRouting.ts';

test('resolveSkillIntent keeps direct chat free-form when legacy UI tags are used', () => {
  const result = resolveSkillIntent('@UI  based on the current sketch, refine the interface');

  assert.equal(result, null);
});

test('resolveSkillIntent keeps direct chat free-form when legacy sketch tags are used', () => {
  const result = resolveSkillIntent('@sketch generate the landing page sketch');

  assert.equal(result, null);
});

test('resolveSkillIntent falls back when no skill token exists', () => {
  const result = resolveSkillIntent('continue generating the prototype');

  assert.equal(result, null);
});

test('resolveSkillIntent keeps removed legacy workflow tags disabled', () => {
  assert.equal(resolveSkillIntent('@需求 帮我整理当前文档'), null);
  assert.equal(resolveSkillIntent('@索引 帮我整理当前项目知识库'), null);
  assert.equal(resolveSkillIntent('@变更同步 检查当前原型变更'), null);
});

test('resolveSkillIntent routes wiki through slash commands', () => {
  const result = resolveSkillIntent('/wiki sync the current note and project context');

  assert.deepEqual(result, {
    skill: 'wiki',
    cleanedInput: 'sync the current note and project context',
    token: '/wiki',
    invocationKind: 'slash',
  });
});

test('resolveSkillIntent routes sketch through slash commands', () => {
  const result = resolveSkillIntent('/sketch generate the landing page sketch');

  assert.deepEqual(result, {
    skill: 'sketch',
    cleanedInput: 'generate the landing page sketch',
    token: '/sketch',
    invocationKind: 'slash',
  });
});

test('resolveSkillIntent routes ui-design through slash commands', () => {
  const result = resolveSkillIntent('/ui-design based on the current sketch, refine the interface');

  assert.deepEqual(result, {
    skill: 'ui-design',
    cleanedInput: 'based on the current sketch, refine the interface',
    token: '/ui-design',
    invocationKind: 'slash',
  });
});

test('resolveSkillIntent keeps removed structured workflow slash skills disabled', () => {
  assert.equal(resolveSkillIntent('/requirements clarify the current product scope'), null);
  assert.equal(resolveSkillIntent('/knowledge-organize build a stable fact base for this project'), null);
  assert.equal(resolveSkillIntent('/change-sync inspect downstream drift after this prototype update'), null);
});
