// 文件作用：技能库数据层，位于技能库与发现层。
// 所在链路：负责技能文件解析、目录发现和展示派生。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { invoke } from '@tauri-apps/api/core';
// 这个文件负责技能库的数据层能力。
// 它会发现本地技能、读取技能文件、导入/删除技能，并组装最终的 runtime skill catalog。
// 如果你在排查“技能库里为什么会有/没有某个技能”，先看这里。
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence.ts';
import {
  getSystemSkillDefinitionById,
  getSystemSkillDefinitions,
  type RuntimeSystemSkillDefinition,
} from './bundledSkillDefinitions.ts';
import { parseSkillMarkdown } from './parseSkillMarkdown.ts';

// skillLibrary 负责“发现 / 读取 / 导入 / 删除 / 组装 skill catalog”。
// 如果你在排查为什么某个 SKILL.md 没出现在 runtime 可用技能列表里，通常先看这里。
export type SkillDiscoveryEntry = {
  id: string;
  name: string;
  category: string;
  source: string;
  path: string;
  manifestPath: string;
  imported: boolean;
  builtin: boolean;
  deletable: boolean;
  syncedToCodex: boolean;
  syncedToClaude: boolean;
};

export type SkillDeleteResult = {
  skillId: string;
  deletedPath: string;
  deleted: boolean;
};

export type RuntimeSkillCatalog = {
  skills: RuntimeSkillDefinition[];
  discoveredSkills: SkillDiscoveryEntry[];
  loadedSkills: RuntimeSkillDefinition[];
};

export type GitHubSkillImportParams = {
  repo: string;
  path: string;
  gitRef?: string;
};

// 系统内建技能在无桌面 runtime 的场景下也要可见，
// 所以这里先构造一份稳定的 discovery 视图给前端直接消费。
const buildSystemSkillDiscoveryEntries = (): SkillDiscoveryEntry[] =>
  getSystemSkillDefinitions().map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: 'system',
    source: 'GoodNight system',
    path: `goodnight://system-skills/${skill.id}`,
    manifestPath: `goodnight://system-skills/${skill.id}/skill.json`,
    imported: true,
    builtin: true,
    deletable: false,
    syncedToCodex: true,
    syncedToClaude: true,
  }));

// 浏览系统技能时，goodnight:// 协议会映射到 bundled skill prompt。
const readSystemSkillFile = (filePath: string) => {
  const match = filePath.match(/^goodnight:\/\/system-skills\/([^/]+)\/SKILL\.md$/i);
  const skill = match ? getSystemSkillDefinitionById(match[1]) : null;
  return skill?.prompt || null;
};

// discover 负责“列目录”，并不保证这些技能都会被当前项目真正加载进 runtime。
export const discoverLocalSkills = (params?: { projectRoot?: string | null }) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.resolve(buildSystemSkillDiscoveryEntries());
  }

  return invoke<SkillDiscoveryEntry[]>('discover_local_skills', params ? { params } : undefined);
};

// import / delete / uninstall 都是桌面 runtime 才能完成的文件系统动作。
export const importLocalSkill = (sourcePath: string) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.reject(new Error('GoodNight desktop runtime is required to import local skills.'));
  }

  return invoke<SkillDiscoveryEntry>('import_local_skill', { params: { sourcePath } });
};

export const importGitHubSkill = (params: GitHubSkillImportParams) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.reject(new Error('GoodNight desktop runtime is required to import GitHub skills.'));
  }

  return invoke<SkillDiscoveryEntry>('import_github_skill', { params });
};

export const readSkillFile = (filePath: string) => {
  if (!isTauriRuntimeAvailable()) {
    const systemSkillPrompt = readSystemSkillFile(filePath);
    return systemSkillPrompt
      ? Promise.resolve(systemSkillPrompt)
      : Promise.reject(new Error('GoodNight desktop runtime is required to read skill files.'));
  }

  return invoke<string>('read_text_file', { filePath });
};

export const deleteLibrarySkill = (skillId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.reject(new Error('GoodNight desktop runtime is required to delete skills.'));
  }

  return invoke<SkillDeleteResult>('delete_library_skill', { params: { skillId } });
};

export const uninstallLibrarySkill = (skillId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.reject(new Error('GoodNight desktop runtime is required to uninstall skills.'));
  }

  return invoke<SkillDeleteResult>('uninstall_library_skill', { params: { skillId } });
};

export const getSystemRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] => getSystemSkillDefinitions();

export const getRouteableSystemSkillDefinitions = (): RuntimeSystemSkillDefinition[] =>
  getSystemSkillDefinitions();

export const getSystemRuntimeSkillDefinitionById = (skillId: string) =>
  getSystemSkillDefinitionById(skillId);

export const getDefaultRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] =>
  getSystemRuntimeSkillDefinitions();

const getSkillPromptPath = (skill: SkillDiscoveryEntry) =>
  skill.manifestPath.replace(/skill\.json$/i, 'SKILL.md');

// skillRoot 后面会被 runtime 用来解析相对资源、脚本或关联文件。
const getSkillRoot = (skill: SkillDiscoveryEntry) => {
  const promptPath = getSkillPromptPath(skill).replace(/\\/g, '/');
  return promptPath.replace(/\/SKILL\.md$/i, '');
};

const hasProjectSkillSource = (skill: SkillDiscoveryEntry) =>
  /project/i.test(skill.source || '');

const isProjectSkillEntry = (skill: SkillDiscoveryEntry, projectRoot?: string | null) => {
  if (hasProjectSkillSource(skill)) {
    return true;
  }

  if (!projectRoot) {
    return false;
  }

  const normalizedProjectRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedSkillPath = skill.path.replace(/\\/g, '/');

  return (
    normalizedSkillPath === normalizedProjectRoot ||
    normalizedSkillPath.startsWith(`${normalizedProjectRoot}/`)
  );
};

// 加载策略是：
// - builtin 技能由系统直接注入，不走 discovered load
// - imported 技能默认加载
// - project 内技能按项目根判定是否纳入当前 runtime
const shouldLoadDiscoveredSkill = (skill: SkillDiscoveryEntry, projectRoot?: string | null) => {
  if (skill.builtin) {
    return false;
  }

  if (skill.imported) {
    return true;
  }

  return isProjectSkillEntry(skill, projectRoot);
};

// 这里把 SKILL.md 的 frontmatter + 正文翻译成 runtime 真正可消费的技能定义。
const buildDiscoveredRuntimeSkillDefinition = (
  skill: SkillDiscoveryEntry,
  markdown: string,
  projectRoot?: string | null
): RuntimeSkillDefinition => {
  const { frontmatter, body } = parseSkillMarkdown(markdown);
  const skillId = frontmatter.skill || skill.id;
  const description = frontmatter.description || body.split('\n')[0] || skill.name || skillId;

  return {
    id: skillId,
    name: frontmatter.name || skill.name || skillId,
    description,
    whenToUse: frontmatter.when_to_use || '',
    version: frontmatter.version,
    prompt: body,
    token: frontmatter.token || `@${skillId}`,
    aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
    executionContext: frontmatter.context === 'fork' ? 'fork' : 'inline',
    argumentHint: frontmatter['argument-hint'],
    argumentNames: Array.isArray(frontmatter.arguments) ? frontmatter.arguments : undefined,
    agent: frontmatter.agent,
    model: frontmatter.model,
    effort: frontmatter.effort,
    shell: frontmatter.shell,
    hooks:
      frontmatter.hooks && typeof frontmatter.hooks === 'object' && !Array.isArray(frontmatter.hooks)
        ? frontmatter.hooks
        : undefined,
    activationPaths: Array.isArray(frontmatter.paths) ? frontmatter.paths : undefined,
    skillRoot: getSkillRoot(skill),
    allowedTools: Array.isArray(frontmatter['allowed-tools']) ? frontmatter['allowed-tools'] : [],
    userInvocable: frontmatter['user-invocable'] !== false,
    userTagInvocable: frontmatter['user-tag-invocable'] !== false,
    modelInvocable: frontmatter['disable-model-invocation'] !== true,
    source: isProjectSkillEntry(skill, projectRoot) ? 'project' : 'local',
  };
};

export const loadRuntimeSkillCatalog = async (params?: {
  projectRoot?: string | null;
}): Promise<RuntimeSkillCatalog> => {
  // catalog 最终会同时返回：
  // 1. skills: 去重后的完整运行时技能表
  // 2. discoveredSkills: 本次实际扫描到并纳入考虑的技能来源
  // 3. loadedSkills: 非系统来源、且成功解析的技能
  const systemSkills = getSystemSkillDefinitions();
  const discoveredSkills = await discoverLocalSkills(params).catch(() => [] as SkillDiscoveryEntry[]);
  const loadableSkills = discoveredSkills.filter((skill) =>
    shouldLoadDiscoveredSkill(skill, params?.projectRoot)
  );

  if (loadableSkills.length === 0) {
    return {
      skills: systemSkills,
      discoveredSkills: [],
      loadedSkills: [],
    };
  }

  const loadedSkills = await Promise.all(
    loadableSkills.map(async (skill) => {
      try {
        const markdown = await readSkillFile(getSkillPromptPath(skill));
        return buildDiscoveredRuntimeSkillDefinition(skill, markdown, params?.projectRoot);
      } catch {
        return null;
      }
    })
  );

  const resolvedLoadedSkills = loadedSkills.filter(
    (skill): skill is RuntimeSkillDefinition => Boolean(skill)
  );
  const mergedSkills = [...systemSkills, ...resolvedLoadedSkills];
  const seenSkillIds = new Set<string>();

  // skill id 是 runtime 侧的主键；重复 id 只保留第一份，避免 prompt 和调用歧义。
  const skills = mergedSkills.filter((skill) => {
    if (seenSkillIds.has(skill.id)) {
      return false;
    }

    seenSkillIds.add(skill.id);
    return true;
  });

  return {
    skills,
    discoveredSkills: loadableSkills,
    loadedSkills: resolvedLoadedSkills,
  };
};

// 如果外层只关心最终可用技能列表，可以走这个更轻的入口。
export const loadRuntimeSkillDefinitions = async (params?: {
  projectRoot?: string | null;
}): Promise<RuntimeSkillDefinition[]> => {
  const catalog = await loadRuntimeSkillCatalog(params);
  return catalog.skills;
};

export type { RuntimeSystemSkillDefinition } from './bundledSkillDefinitions.ts';
