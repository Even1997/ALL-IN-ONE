import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSkillIntent } from '../../src/modules/ai/workflow/skillRouting.ts';

test('resolveSkillIntent detects UI tokens and returns the concise token', () => {
  const result = resolveSkillIntent('@UI设计 根据当前草图生成设计');

  assert.deepEqual(result, {
    package: 'page',
    skill: 'ui-design',
    cleanedInput: '根据当前草图生成设计',
    token: '@UI',
  });
});

test('resolveSkillIntent detects requirements mode', () => {
  const result = resolveSkillIntent('@需求 帮我整理当前文档');

  assert.deepEqual(result, {
    package: 'requirements',
    skill: 'requirements',
    cleanedInput: '帮我整理当前文档',
    token: '@需求',
  });
});

test('resolveSkillIntent detects change sync mode', () => {
  const result = resolveSkillIntent('@变更同步 检查当前原型变更');

  assert.deepEqual(result, {
    package: 'change-sync',
    skill: 'change-sync',
    cleanedInput: '检查当前原型变更',
    token: '@变更同步',
  });
});

test('resolveSkillIntent falls back when no skill token exists', () => {
  const result = resolveSkillIntent('继续生成原型');

  assert.equal(result, null);
});

test('resolveSkillIntent detects index mode and routes it to knowledge organize', () => {
  const result = resolveSkillIntent('@索引 帮我整理当前项目知识库');

  assert.deepEqual(result, {
    package: 'knowledge-organize',
    skill: 'knowledge-organize',
    cleanedInput: '帮我整理当前项目知识库',
    token: '@索引',
  });
});

test('resolveSkillIntent keeps the legacy organize alias working', () => {
  const result = resolveSkillIntent('@整理 帮我整理当前项目知识库');

  assert.deepEqual(result, {
    package: 'knowledge-organize',
    skill: 'knowledge-organize',
    cleanedInput: '帮我整理当前项目知识库',
    token: '@索引',
  });
});
