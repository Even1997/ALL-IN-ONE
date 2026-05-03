import type { AIWorkflowPackage } from '../../../types';
import { getDefaultChatSkillDefinitions } from '../skills/skillLibrary.ts';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';

export type SkillIntent = {
  package: AIWorkflowPackage | 'knowledge-organize' | 'change-sync' | null;
  skill: string;
  cleanedInput: string;
  token: string;
  invocationKind: 'tag' | 'slash';
};

type RouteableSkillDefinition = Pick<
  RuntimeSkillDefinition,
  'id' | 'userInvocable' | 'token' | 'aliases'
> & {
  packageId?: AIWorkflowPackage | 'knowledge-organize' | 'change-sync';
};

const getDefaultRouteableSkills = (): RouteableSkillDefinition[] => getDefaultChatSkillDefinitions();

const buildSkillPatterns = (skills: RouteableSkillDefinition[]) =>
  skills
    .filter((skill) => skill.userInvocable)
    .map((skill) => ({
      patterns: [skill.token || `@${skill.id}`, ...(skill.aliases || [])],
      slashCommand: `/${skill.id}`,
      package: skill.packageId || null,
      skill: skill.id,
      token: skill.token || `@${skill.id}`,
    }));

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSkillPattern = (patterns: string[]) => new RegExp(patterns.map(escapePattern).join('|'), 'i');

const stripSkillToken = (input: string, patterns: string[]) => input.replace(buildSkillPattern(patterns), '').trim();

export const resolveSkillIntent = (
  input: string,
  skills: RouteableSkillDefinition[] = getDefaultRouteableSkills()
): SkillIntent | null => {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const skillPatterns = buildSkillPatterns(skills);
  const slashMatched = skillPatterns.find(
    ({ slashCommand }) => normalized.toLowerCase() === slashCommand || normalized.toLowerCase().startsWith(`${slashCommand} `)
  );
  if (slashMatched) {
    return {
      package: slashMatched.package,
      skill: slashMatched.skill,
      cleanedInput: normalized.slice(slashMatched.slashCommand.length).trim(),
      token: slashMatched.slashCommand,
      invocationKind: 'slash',
    };
  }

  const matched = skillPatterns.find(({ patterns }) => buildSkillPattern(patterns).test(normalized));
  if (!matched) {
    return null;
  }

  return {
    package: matched.package,
    skill: matched.skill,
    cleanedInput: stripSkillToken(normalized, matched.patterns),
    token: matched.token,
    invocationKind: 'tag',
  };
};

export const AVAILABLE_CHAT_SKILLS: Array<Pick<SkillIntent, 'skill' | 'token' | 'package'> & { slashCommand: string }> =
  buildSkillPatterns(getDefaultRouteableSkills()).map((skill) => ({
    skill: skill.skill,
    token: skill.token,
    package: skill.package,
    slashCommand: skill.slashCommand,
  }));
