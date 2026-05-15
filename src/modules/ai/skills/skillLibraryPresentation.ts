import type { SkillDiscoveryEntry } from './skillLibrary';

export type SkillLibraryTab = 'system' | 'personal';
export type SystemSkillBucket = 'recommended' | 'installed';
export type SkillPrimaryAction = 'install' | 'use';

export const isBuiltinSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.builtin && skill.category === 'system';

export const isRecommendedSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.source === 'GoodNight recommended';

export const getSkillTab = (skill: SkillDiscoveryEntry): SkillLibraryTab =>
  isBuiltinSystemSkill(skill) || isRecommendedSystemSkill(skill) ? 'system' : 'personal';

export const getSystemSkillBucket = (skill: SkillDiscoveryEntry): SystemSkillBucket =>
  skill.imported || isBuiltinSystemSkill(skill) ? 'installed' : 'recommended';

export const getSkillPrimaryAction = (skill: SkillDiscoveryEntry): SkillPrimaryAction =>
  skill.imported || isBuiltinSystemSkill(skill) ? 'use' : 'install';

export const canUninstallSkill = (skill: SkillDiscoveryEntry) =>
  !isBuiltinSystemSkill(skill) && skill.imported;

export const canDeleteSkill = (skill: SkillDiscoveryEntry) => getSkillTab(skill) === 'personal';

export const formatSourceBadge = (skill: SkillDiscoveryEntry) => {
  if (isBuiltinSystemSkill(skill)) {
    return '内置';
  }

  if (getSkillTab(skill) === 'system') {
    return skill.imported ? '已装推荐' : '推荐';
  }

  return skill.imported ? '已安装' : '未安装';
};

export const buildSkillSummary = (skill: SkillDiscoveryEntry) => {
  if (isBuiltinSystemSkill(skill)) {
    return '系统内置技能，默认可用，不支持卸载。';
  }

  if (getSkillTab(skill) === 'system') {
    return skill.imported
      ? '官方推荐技能，已经安装到当前技能库。'
      : '官方推荐技能，可按需安装到当前技能库。';
  }

  return skill.imported
    ? '个人技能，已安装到当前技能库，可直接在聊天中调用。'
    : '个人技能条目仍保留在库中，可随时重新安装。';
};
