import type { SkillIntent } from '../../workflow/skillRouting.ts';

export type RuntimeReplayTurnStartPayload = {
  kind: 'turn_start_v1';
  rawPrompt: string;
  normalizedPrompt: string;
  skillIntent: SkillIntent | null;
  activeSkillIds: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildRuntimeReplayTurnStartPayload = (input: {
  rawPrompt: string;
  normalizedPrompt: string;
  skillIntent: SkillIntent | null;
  activeSkillIds: string[];
}) =>
  JSON.stringify({
    kind: 'turn_start_v1',
    rawPrompt: input.rawPrompt,
    normalizedPrompt: input.normalizedPrompt,
    skillIntent: input.skillIntent,
    activeSkillIds: input.activeSkillIds,
  } satisfies RuntimeReplayTurnStartPayload);

export const parseRuntimeReplayTurnStartPayload = (
  payload: string
): RuntimeReplayTurnStartPayload | null => {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isObject(parsed) || parsed.kind !== 'turn_start_v1') {
      return null;
    }

    return {
      kind: 'turn_start_v1',
      rawPrompt: typeof parsed.rawPrompt === 'string' ? parsed.rawPrompt : '',
      normalizedPrompt: typeof parsed.normalizedPrompt === 'string' ? parsed.normalizedPrompt : '',
      skillIntent: isObject(parsed.skillIntent)
        ? {
            package:
              typeof parsed.skillIntent.package === 'string' || parsed.skillIntent.package === null
                ? (parsed.skillIntent.package as SkillIntent['package'])
                : null,
            skill: typeof parsed.skillIntent.skill === 'string' ? parsed.skillIntent.skill : '',
            cleanedInput:
              typeof parsed.skillIntent.cleanedInput === 'string' ? parsed.skillIntent.cleanedInput : '',
            token: typeof parsed.skillIntent.token === 'string' ? parsed.skillIntent.token : '',
            invocationKind:
              parsed.skillIntent.invocationKind === 'slash' ? 'slash' : 'tag',
          }
        : null,
      activeSkillIds: Array.isArray(parsed.activeSkillIds)
        ? parsed.activeSkillIds.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
};
