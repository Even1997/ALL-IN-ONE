import { invoke } from '@tauri-apps/api/core';

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
