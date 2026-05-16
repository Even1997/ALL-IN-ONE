// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
