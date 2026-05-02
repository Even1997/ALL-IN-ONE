import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const createRuntimeSkillRegistry = (skills: RuntimeSkillDefinition[]) => {
  const activeByThread = new Map<string, string[]>();

  return {
    listSkills: () => [...skills],
    activateSkill: (threadId: string, skillId: string) => {
      const current = activeByThread.get(threadId) || [];
      if (!current.includes(skillId)) {
        activeByThread.set(threadId, [...current, skillId]);
      }
    },
    listActiveSkills: (threadId: string) => {
      const active = activeByThread.get(threadId) || [];
      return skills.filter((skill) => active.includes(skill.id));
    },
  };
};
