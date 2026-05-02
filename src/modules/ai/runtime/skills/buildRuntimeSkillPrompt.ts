import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const buildRuntimeSkillPrompt = (skills: RuntimeSkillDefinition[]) =>
  skills.map((skill) => `<skill id="${skill.id}">\n${skill.prompt}\n</skill>`).join('\n\n');
