import type { AIWorkflowPackage } from '../../../types';

export type SkillIntent = {
  package: AIWorkflowPackage | 'knowledge-organize' | 'change-sync';
  skill: 'knowledge-organize' | 'requirements' | 'sketch' | 'ui-design' | 'change-sync';
  cleanedInput: string;
  token: '@整理' | '@需求' | '@草图' | '@UI' | '@变更同步';
};

const SKILL_PATTERNS: Array<{
  patterns: string[];
  package: SkillIntent['package'];
  skill: SkillIntent['skill'];
  token: SkillIntent['token'];
}> = [
  { patterns: ['@整理', '@organize'], package: 'knowledge-organize', skill: 'knowledge-organize', token: '@整理' },
  { patterns: ['@需求', '@requirement', '@requirements'], package: 'requirements', skill: 'requirements', token: '@需求' },
  { patterns: ['@草图', '@sketch'], package: 'prototype', skill: 'sketch', token: '@草图' },
  { patterns: ['@ui设计', '@ui', '@设计'], package: 'page', skill: 'ui-design', token: '@UI' },
  { patterns: ['@变更同步', '@sync', '@change-sync'], package: 'change-sync', skill: 'change-sync', token: '@变更同步' },
];

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSkillPattern = (patterns: string[]) => new RegExp(patterns.map(escapePattern).join('|'), 'i');

const stripSkillToken = (input: string, patterns: string[]) => input.replace(buildSkillPattern(patterns), '').trim();

export const resolveSkillIntent = (input: string): SkillIntent | null => {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const matched = SKILL_PATTERNS.find(({ patterns }) => buildSkillPattern(patterns).test(normalized));
  if (!matched) {
    return null;
  }

  return {
    package: matched.package,
    skill: matched.skill,
    cleanedInput: stripSkillToken(normalized, matched.patterns),
    token: matched.token,
  };
};

export const AVAILABLE_CHAT_SKILLS: Array<Pick<SkillIntent, 'skill' | 'token' | 'package'>> = [
  { skill: 'knowledge-organize', token: '@整理', package: 'knowledge-organize' },
  { skill: 'requirements', token: '@需求', package: 'requirements' },
  { skill: 'sketch', token: '@草图', package: 'prototype' },
  { skill: 'ui-design', token: '@UI', package: 'page' },
  { skill: 'change-sync', token: '@变更同步', package: 'change-sync' },
];
