// 文件作用：注册表，位于runtime 技能层。
// 所在链路：负责 skill 注册、类型约束和 prompt 注入结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个 registry 负责管理线程维度的激活技能集合。
// 它回答两个问题：当前线程有哪些技能可用、哪些路径命中后要自动激活哪些技能。
// 如果你在排查“某个技能为什么没被自动带上”，先看这里。
import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

// registry 负责回答两个问题：
// 1. 当前线程有哪些技能是可用的
// 2. 某些路径命中后，哪些技能应该被自动激活
export const createRuntimeSkillRegistry = (skills: RuntimeSkillDefinition[]) => {
  const activeByThread = new Map<string, string[]>();
  const unconditionalSkills = skills.filter(
    (skill) => !skill.activationPaths || skill.activationPaths.length === 0
  );

  // activation path 匹配统一先做路径标准化，避免 Windows / POSIX 分隔符差异带来误判。
  const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

  // 这里支持简单的 glob 语义：
  // * 匹配单层
  // ** 匹配多层
  // ? 匹配单字符
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

  // 某个 skill 只要命中任一 activation path，就认为应该被该路径集激活。
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
      // 没有 threadId 时，只返回无条件技能，避免把线程态激活信息误当全局默认值。
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
      // 手动激活不会去重整个 skills 表，只是在当前线程的 active 集合里补一个 id。
      const current = activeByThread.get(threadId) || [];
      if (!current.includes(skillId)) {
        activeByThread.set(threadId, [...current, skillId]);
      }
    },
    restoreActiveSkills: (threadId: string, skillIds: string[]) => {
      // restore 常用于会话恢复，只保留当前 registry 仍然认识的 skill id。
      const knownSkillIds = new Set(skills.map((skill) => skill.id));
      const next = [...new Set(skillIds.filter((skillId) => knownSkillIds.has(skillId)))];
      activeByThread.set(threadId, next);
      return skills.filter((skill) => next.includes(skill.id));
    },
    activateSkillsForPaths: (threadId: string, paths: string[]) => {
      // 路径触发是“在现有 active 基础上追加”，而不是覆盖用户已激活的技能。
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
