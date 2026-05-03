import { invoke } from '@tauri-apps/api/core';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes';
import {
  getBundledChatSkillById,
  getBundledChatSkills,
  type RuntimeChatSkillDefinition,
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

export type GitHubSkillImportParams = {
  repo: string;
  path: string;
  gitRef?: string;
};

export const discoverLocalSkills = (params?: { projectRoot?: string | null }) =>
  invoke<SkillDiscoveryEntry[]>('discover_local_skills', params ? { params } : undefined);

export const importLocalSkill = (sourcePath: string) =>
  invoke<SkillDiscoveryEntry>('import_local_skill', { params: { sourcePath } });

export const importGitHubSkill = (params: GitHubSkillImportParams) =>
  invoke<SkillDiscoveryEntry>('import_github_skill', { params });

export const readSkillFile = (filePath: string) =>
  invoke<string>('read_text_file', { filePath });

export const deleteLibrarySkill = (skillId: string) =>
  invoke<SkillDeleteResult>('delete_library_skill', { params: { skillId } });

export const getDefaultRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] => getBundledChatSkills();

export const getDefaultChatSkillDefinitions = (): RuntimeChatSkillDefinition[] => getBundledChatSkills();

export const getDefaultChatSkillDefinitionById = (skillId: string) => getBundledChatSkillById(skillId);

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
    modelInvocable: frontmatter['disable-model-invocation'] !== true,
    source: isProjectSkillEntry(skill, projectRoot) ? 'project' : 'local',
  };
};

export const loadRuntimeSkillDefinitions = async (params?: {
  projectRoot?: string | null;
}): Promise<RuntimeSkillDefinition[]> => {
  const bundledSkills = getBundledChatSkills();
  const discoveredSkills = await discoverLocalSkills(params).catch(() => [] as SkillDiscoveryEntry[]);
  const loadableSkills = discoveredSkills.filter((skill) =>
    shouldLoadDiscoveredSkill(skill, params?.projectRoot)
  );

  if (loadableSkills.length === 0) {
    return bundledSkills;
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

  const mergedSkills = [...bundledSkills, ...loadedSkills.filter((skill): skill is RuntimeSkillDefinition => Boolean(skill))];
  const seenSkillIds = new Set<string>();

  return mergedSkills.filter((skill) => {
    if (seenSkillIds.has(skill.id)) {
      return false;
    }

    seenSkillIds.add(skill.id);
    return true;
  });
};

export type { RuntimeChatSkillDefinition } from './bundledSkillDefinitions.ts';
