import { invoke } from '@tauri-apps/api/core';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes';

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

export const getDefaultRuntimeSkillDefinitions = (): RuntimeSkillDefinition[] => [
  {
    id: 'knowledge-organize',
    name: 'Knowledge Organize',
    prompt: 'Organize current project context into stable facts before answering.',
  },
  {
    id: 'requirements',
    name: 'Requirements',
    prompt: 'Work in requirements mode. Clarify goals, flows, constraints, and acceptance criteria.',
  },
  {
    id: 'sketch',
    name: 'Sketch',
    prompt: 'Work in sketch mode. Propose low-fidelity structure before polishing visuals.',
  },
  {
    id: 'ui-design',
    name: 'UI Design',
    prompt: 'Work in UI mode. Preserve the existing shell and produce implementation-ready interface guidance.',
  },
  {
    id: 'change-sync',
    name: 'Change Sync',
    prompt: 'Work in change sync mode. Compare current artifacts and summarize sync actions.',
  },
];
