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

test('resolveSkillIntent detects @需求 and keeps explicit requirements mode', () => {
  const result = resolveSkillIntent('@需求 帮我整理当前文档');

  assert.deepEqual(result, {
    package: 'requirements',
    skill: 'requirements',
    cleanedInput: '帮我整理当前文档',
    token: '@需求',
  });
});

test('resolveSkillIntent falls back when no skill token exists', () => {
  const result = resolveSkillIntent('继续生成原型');

  assert.equal(result, null);
});
