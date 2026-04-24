import { invoke } from '@tauri-apps/api/core';
import type { FeatureTree, ProjectConfig } from '../types';
import type { ProjectWorkspaceSnapshot } from '../store/projectStore';
import type { WorkflowProjectState } from '../modules/ai/store/workflowStore';

export interface PersistedProjectSnapshot {
  workspace: ProjectWorkspaceSnapshot;
  featureTree: FeatureTree | null;
}

export interface PersistedDesignBoardState {
  pageNodes: unknown[];
  flowNodes: unknown[];
  textNodes: unknown[];
  aiNodes: unknown[];
  styleNodes: unknown[];
  edges: unknown[];
}

const writeTextFile = async (filePath: string, content: string) => {
  const result = await invoke<{ success: boolean; error: string | null }>('tool_write', {
    params: {
      file_path: filePath,
      content,
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Failed to write file: ${filePath}`);
  }
};

const removePath = async (filePath: string) => {
  const result = await invoke<{ success: boolean; error: string | null }>('tool_remove', {
    params: {
      file_path: filePath,
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Failed to remove path: ${filePath}`);
  }
};

const readTextFile = async (filePath: string) => {
  try {
    return await invoke<string>('read_text_file', { filePath });
  } catch {
    return null;
  }
};

const joinPath = (basePath: string, ...segments: string[]) => {
  const separator = basePath.includes('\\') ? '\\' : '/';
  return [basePath.replace(/[\\/]+$/, ''), ...segments.map((segment) => segment.replace(/^[\\/]+/, ''))].join(separator);
};

const readJSONFile = async <T>(filePath: string): Promise<T | null> => {
  const content = await readTextFile(filePath);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

const writeJSONFile = async (filePath: string, data: unknown) => {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
};

export const getProjectDir = async (projectId: string) =>
  invoke<string>('get_project_dir', { projectId });

export const getProjectsIndexPath = async () =>
  invoke<string>('get_projects_index_path');

export const loadProjectIndexFromDisk = async () => {
  const indexPath = await getProjectsIndexPath();
  return (await readJSONFile<ProjectConfig[]>(indexPath)) || [];
};

export const saveProjectIndexToDisk = async (projects: ProjectConfig[]) => {
  const indexPath = await getProjectsIndexPath();
  await writeJSONFile(indexPath, projects);
};

export const getProjectStateDir = (projectDir: string) => joinPath(projectDir, '.devflow');

export const getProjectSnapshotPath = (projectDir: string) =>
  joinPath(getProjectStateDir(projectDir), 'workspace.json');

export const getDesignBoardPath = (projectDir: string) =>
  joinPath(getProjectStateDir(projectDir), 'design-board.json');

export const getWorkflowStatePath = (projectDir: string) =>
  joinPath(getProjectStateDir(projectDir), 'ai-workflow.json');

export const getProjectMetaPath = (projectDir: string) =>
  joinPath(projectDir, 'project.json');

export const loadProjectSnapshotFromDisk = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);
  return readJSONFile<PersistedProjectSnapshot>(getProjectSnapshotPath(projectDir));
};

export const saveProjectSnapshotToDisk = async (project: ProjectConfig, snapshot: PersistedProjectSnapshot) => {
  const projectDir = await getProjectDir(project.id);
  await Promise.all([
    writeJSONFile(getProjectMetaPath(projectDir), project),
    writeJSONFile(getProjectSnapshotPath(projectDir), snapshot),
  ]);
};

export const loadDesignBoardStateFromDisk = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);
  return readJSONFile<PersistedDesignBoardState>(getDesignBoardPath(projectDir));
};

export const saveDesignBoardStateToDisk = async (projectId: string, state: PersistedDesignBoardState) => {
  const projectDir = await getProjectDir(projectId);
  await writeJSONFile(getDesignBoardPath(projectDir), state);
};

export const loadWorkflowStateFromDisk = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);
  return readJSONFile<WorkflowProjectState>(getWorkflowStatePath(projectDir));
};

export const saveWorkflowStateToDisk = async (projectId: string, state: WorkflowProjectState) => {
  const projectDir = await getProjectDir(projectId);
  await writeJSONFile(getWorkflowStatePath(projectDir), state);
};

export const syncGeneratedFilesToProjectDir = async (
  projectId: string,
  files: Array<{ path: string; content: string }>
) => {
  const projectDir = await getProjectDir(projectId);
  await Promise.all(
    files.map((file) => writeTextFile(joinPath(projectDir, file.path), file.content))
  );
};

export const removeProjectDirectoryFromDisk = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);
  await removePath(projectDir);
};
