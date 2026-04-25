import type { AIWorkflowPackage } from '../../../types';

export type SkillIntent = {
  package: AIWorkflowPackage;
  skill: 'requirements' | 'sketch' | 'ui-design';
  cleanedInput: string;
  token: '@需求' | '@草图' | '@UI';
};

const SKILL_PATTERNS: Array<{
  pattern: RegExp;
  package: AIWorkflowPackage;
  skill: SkillIntent['skill'];
  token: SkillIntent['token'];
}> = [
  { pattern: /@ui设计|@ui|@设计/i, package: 'page', skill: 'ui-design', token: '@UI' },
  { pattern: /@草图|@sketch/i, package: 'prototype', skill: 'sketch', token: '@草图' },
  { pattern: /@需求|@requirement|@requirements/i, package: 'requirements', skill: 'requirements', token: '@需求' },
];

const stripSkillToken = (input: string, pattern: RegExp) => input.replace(pattern, '').trim();

export const resolveSkillIntent = (input: string): SkillIntent | null => {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const matched = SKILL_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  if (!matched) {
    return null;
  }

  return {
    package: matched.package,
    skill: matched.skill,
    cleanedInput: stripSkillToken(normalized, matched.pattern),
    token: matched.token,
  };
};

export const AVAILABLE_CHAT_SKILLS: Array<Pick<SkillIntent, 'skill' | 'token' | 'package'>> = [
  { skill: 'requirements', token: '@需求', package: 'requirements' },
  { skill: 'sketch', token: '@草图', package: 'prototype' },
  { skill: 'ui-design', token: '@UI', package: 'page' },
];
