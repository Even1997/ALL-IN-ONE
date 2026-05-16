// 文件作用：技能展示派生层，位于技能库与发现层。
// 所在链路：负责技能文件解析、目录发现和展示派生。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责技能库展示层的派生规则。
// 它会根据 discovery entry 推导 tab、分桶、主按钮动作、来源 badge 和摘要文案。
// 如果你在排查“技能库 UI 为什么把某项归到这里”，先看这里。
import type { SkillDiscoveryEntry } from './skillLibrary';

// 这是技能库展示层的轻量派生规则：
// 只根据 discovery entry 推导 tab、bucket、按钮动作和摘要，不负责真正安装/删除逻辑。
export type SkillLibraryTab = 'system' | 'personal';
export type SystemSkillBucket = 'recommended' | 'installed';
export type SkillPrimaryAction = 'install' | 'use';

export const isBuiltinSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.builtin && skill.category === 'system';

export const isRecommendedSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.source === 'GoodNight recommended';

// tab / bucket / action 这几组函数是 UI 过滤和按钮文案的统一来源。
export const getSkillTab = (skill: SkillDiscoveryEntry): SkillLibraryTab =>
  isBuiltinSystemSkill(skill) || isRecommendedSystemSkill(skill) ? 'system' : 'personal';

export const getSystemSkillBucket = (skill: SkillDiscoveryEntry): SystemSkillBucket =>
  skill.imported || isBuiltinSystemSkill(skill) ? 'installed' : 'recommended';

export const getSkillPrimaryAction = (skill: SkillDiscoveryEntry): SkillPrimaryAction =>
  skill.imported || isBuiltinSystemSkill(skill) ? 'use' : 'install';

export const canUninstallSkill = (skill: SkillDiscoveryEntry) =>
  !isBuiltinSystemSkill(skill) && skill.imported;

export const canDeleteSkill = (skill: SkillDiscoveryEntry) => getSkillTab(skill) === 'personal';

// 这里的返回值是展示文案层，当前文件里有历史乱码字符串；
// 本轮只补导航注释，不顺手改动原有展示内容，避免扩大修改范围。
export const formatSourceBadge = (skill: SkillDiscoveryEntry) => {
  if (isBuiltinSystemSkill(skill)) {
    return '内置';
  }

  if (getSkillTab(skill) === 'system') {
    return skill.imported ? '已装推荐' : '推荐';
  }

  return skill.imported ? '已安装' : '未安装';
};

// 详情区摘要同样只做展示映射，不改变技能本身的来源事实。
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
