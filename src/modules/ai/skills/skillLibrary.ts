import { invoke } from '@tauri-apps/api/core';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence.ts';
import {
  getSystemSkillDefinitionById,
  getSystemSkillDefinitions,
  type RuntimeSystemSkillDefinition,
} from './bundledSkillDefinitions.ts';
import { parseSkillMarkdown } from './parseSkillMarkdown.ts';

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

const readSystemSkillFile = (filePath: string) => {
  const match = filePath.match(/^goodnight:\/\/system-skills\/([^/]+)\/SKILL\.md$/i);
  const skill = match ? getSystemSkillDefinitionById(match[1]) : null;
  return skill?.prompt || null;
};

export const discoverLocalSkills = (params?: { projectRoot?: string | null }) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.resolve(buildSystemSkillDiscoveryEntries());
  }

  return invoke<SkillDiscoveryEntry[]>('discover_local_skills', params ? { params } : undefined);
};

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

export const getSystemRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] => getSystemSkillDefinitions();

export const getRouteableSystemSkillDefinitions = (): RuntimeSystemSkillDefinition[] =>
  getSystemSkillDefinitions();

export const getSystemRuntimeSkillDefinitionById = (skillId: string) =>
  getSystemSkillDefinitionById(skillId);

export const getDefaultRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] =>
  getSystemRuntimeSkillDefinitions();

const getSkillPromptPath = (skill: SkillDiscoveryEntry) =>
  skill.manifestPath.replace(/skill\.json$/i, 'SKILL.md');

const getSkillRoot = (skill: SkillDiscoveryEntry) => {
  const promptPath = getSkillPromptPath(skill).replace(/\\/g, '/');
  return promptPath.replace(/\/SKILL\.md$/i, '');
};

const isProjectSkillEntry = (skill: SkillDiscoveryEntry, projectRoot?: string | null) => {
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

const shouldLoadDiscoveredSkill = (skill: SkillDiscoveryEntry, projectRoot?: string | null) => {
  if (skill.builtin) {
    return false;
  }

  if (skill.imported) {
    return true;
  }

  return isProjectSkillEntry(skill, projectRoot);
};

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

export const loadRuntimeSkillDefinitions = async (params?: {
  projectRoot?: string | null;
}): Promise<RuntimeSkillDefinition[]> => {
  const catalog = await loadRuntimeSkillCatalog(params);
  return catalog.skills;
};

export type { RuntimeSystemSkillDefinition } from './bundledSkillDefinitions.ts';
