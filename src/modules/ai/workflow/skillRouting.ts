import { getRouteableSystemSkillDefinitions } from '../skills/skillLibrary.ts';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';

export type SkillIntent = {
  skill: string;
  cleanedInput: string;
  token: string;
  invocationKind: 'tag' | 'slash';
};

type RouteableSkillDefinition = Pick<
  RuntimeSkillDefinition,
  'id' | 'userInvocable' | 'userTagInvocable' | 'token' | 'aliases'
>;

const getDefaultRouteableSkills = (): RouteableSkillDefinition[] => getRouteableSystemSkillDefinitions();

const buildSkillPatterns = (skills: RouteableSkillDefinition[]) =>
  skills
    .filter((skill) => skill.userInvocable)
    .map((skill) => ({
      patterns:
        skill.userTagInvocable === false
          ? []
          : [skill.token || `@${skill.id}`, ...(skill.aliases || [])],
      slashCommand: `/${skill.id}`,
      skill: skill.id,
      token: skill.token || `@${skill.id}`,
    }));

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSkillPattern = (patterns: string[]) => new RegExp(patterns.map(escapePattern).join('|'), 'i');

const findMatchedTagPattern = (input: string, patterns: string[]) =>
  [...patterns]
    .sort((left, right) => right.length - left.length)
    .find((pattern) => new RegExp(`^${escapePattern(pattern)}(?:\\s|$)`, 'i').test(input)) || null;

const stripSkillToken = (input: string, pattern: string) =>
  input.replace(new RegExp(`^${escapePattern(pattern)}`, 'i'), '').trim();

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
      skill: slashMatched.skill,
      cleanedInput: normalized.slice(slashMatched.slashCommand.length).trim(),
      token: slashMatched.slashCommand,
      invocationKind: 'slash',
    };
  }

  const matched = skillPatterns.find(
    ({ patterns }) => patterns.length > 0 && buildSkillPattern(patterns).test(normalized)
  );
  if (!matched) {
    return null;
  }

  const matchedPattern = findMatchedTagPattern(normalized, matched.patterns);
  if (!matchedPattern) {
    return null;
  }

  return {
    skill: matched.skill,
    cleanedInput: stripSkillToken(normalized, matchedPattern),
    token: matched.token,
    invocationKind: 'tag',
  };
};

export const AVAILABLE_CHAT_SKILLS: Array<Pick<SkillIntent, 'skill' | 'token'> & { slashCommand: string }> =
  buildSkillPatterns(getDefaultRouteableSkills()).map((skill) => ({
    skill: skill.skill,
    token: skill.token,
    slashCommand: skill.slashCommand,
  }));
