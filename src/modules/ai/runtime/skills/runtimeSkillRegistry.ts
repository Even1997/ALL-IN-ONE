import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const createRuntimeSkillRegistry = (skills: RuntimeSkillDefinition[]) => {
  const activeByThread = new Map<string, string[]>();
  const unconditionalSkills = skills.filter(
    (skill) => !skill.activationPaths || skill.activationPaths.length === 0
  );

  const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

  const buildPathPattern = (pattern: string) => {
    const normalizedPattern = normalizePath(pattern);
    let regexSource = '';

    for (let index = 0; index < normalizedPattern.length; index += 1) {
      const current = normalizedPattern[index];
      const next = normalizedPattern[index + 1];

      if (current === '*' && next === '*') {
        regexSource += '.*';
        index += 1;
        continue;
      }

      if (current === '*') {
        regexSource += '[^/]*';
        continue;
      }

      if (current === '?') {
        regexSource += '[^/]';
        continue;
      }

      regexSource += current.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }

    return new RegExp(`^${regexSource}$`);
  };

  const matchesActivationPath = (skill: RuntimeSkillDefinition, paths: string[]) => {
    if (!skill.activationPaths || skill.activationPaths.length === 0) {
      return false;
    }

    const matchers = skill.activationPaths.map(buildPathPattern);
    return paths.some((path) => {
      const normalizedPath = normalizePath(path);
      return matchers.some((matcher) => matcher.test(normalizedPath));
    });
  };

  return {
    listAllSkills: () => [...skills],
    listSkills: (threadId?: string) => {
      if (!threadId) {
        return [...unconditionalSkills];
      }

      const active = activeByThread.get(threadId) || [];
      return skills.filter(
        (skill) =>
          (!skill.activationPaths || skill.activationPaths.length === 0) || active.includes(skill.id)
      );
    },
    activateSkill: (threadId: string, skillId: string) => {
      const current = activeByThread.get(threadId) || [];
      if (!current.includes(skillId)) {
        activeByThread.set(threadId, [...current, skillId]);
      }
    },
    restoreActiveSkills: (threadId: string, skillIds: string[]) => {
      const knownSkillIds = new Set(skills.map((skill) => skill.id));
      const next = [...new Set(skillIds.filter((skillId) => knownSkillIds.has(skillId)))];
      activeByThread.set(threadId, next);
      return skills.filter((skill) => next.includes(skill.id));
    },
    activateSkillsForPaths: (threadId: string, paths: string[]) => {
      const current = activeByThread.get(threadId) || [];
      const matchedSkillIds = skills
        .filter((skill) => matchesActivationPath(skill, paths))
        .map((skill) => skill.id);
      const next = [...new Set([...current, ...matchedSkillIds])];
      activeByThread.set(threadId, next);
      return skills.filter((skill) => next.includes(skill.id));
    },
    listActiveSkills: (threadId: string) => {
      const active = activeByThread.get(threadId) || [];
      return skills.filter((skill) => active.includes(skill.id));
    },
  };
};
