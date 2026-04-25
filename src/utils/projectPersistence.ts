import { invoke } from '@tauri-apps/api/core';
import type { FeatureTree, PageStructureNode, ProjectConfig, WireframeDocument } from '../types';
import type { ProjectWorkspaceSnapshot } from '../store/projectStore';
import type { ContextIndex } from '../modules/ai/chat/contextIndex';
import {
  getBuiltInStylePackFiles,
  parseDesignStyleMarkdown,
  type DesignStyleSeed,
} from '../modules/design/stylePack.ts';
import { buildSketchReferenceFile } from '../modules/knowledge/referenceFiles.ts';
import { buildSketchPageContent, buildSketchPagePath, parseSketchPageFile } from '../modules/knowledge/sketchPageFiles.ts';
import type { WorkflowProjectState } from '../modules/ai/store/workflowStore';
import type { GeneratedFile } from '../types';
import { joinFileSystemPath } from './fileSystemPaths.ts';

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

export interface ProjectStorageSettings {
  rootPath: string;
  defaultPath: string;
  isDefault: boolean;
}

export const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === 'function';

const invokeTauri = async <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauriRuntimeAvailable()) {
    throw new Error('Tauri runtime unavailable');
  }

  return invoke<T>(command, args);
};

const writeTextFile = async (filePath: string, content: string) => {
  const result = await invokeTauri<{ success: boolean; error: string | null }>('tool_write', {
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
  const result = await invokeTauri<{ success: boolean; error: string | null }>('tool_remove', {
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
    return await invokeTauri<string>('read_text_file', { filePath });
  } catch {
    return null;
  }
};

const joinPath = (basePath: string, ...segments: string[]) => joinFileSystemPath(basePath, ...segments);

const WINDOWS_INVALID_SEGMENT_CHARS = /[<>:"\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED_SEGMENT_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const sanitizeProjectPathSegment = (segment: string) => {
  const sanitized = segment
    .trim()
    .replace(WINDOWS_INVALID_SEGMENT_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/\s+\./g, '.')
    .replace(/-\./g, '.')
    .replace(/[. ]+$/g, '')
    .replace(/^-+|-+$/g, '');

  const normalized = sanitized || 'file';
  return WINDOWS_RESERVED_SEGMENT_NAMES.test(normalized) ? `${normalized}-file` : normalized;
};

export const sanitizeProjectRelativePath = (relativePath: string) =>
  relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizeProjectPathSegment(segment))
    .filter(Boolean)
    .join('/');

export const joinProjectRelativePath = (projectDir: string, relativePath: string) => {
  const normalizedRelativePath = sanitizeProjectRelativePath(relativePath);
  const segments = normalizedRelativePath.split('/').filter(Boolean);
  return joinPath(projectDir, ...segments);
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

const ensureDirectory = async (directoryPath: string) => {
  const result = await invokeTauri<{ success: boolean; content: string; error: string | null }>('tool_mkdir', {
    params: {
      file_path: directoryPath,
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Failed to create directory: ${directoryPath}`);
  }
};

const listDirectory = async (directoryPath: string) => {
  const result = await invokeTauri<{ success: boolean; content: string; error: string | null }>('tool_ls', {
    params: {
      path: directoryPath,
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Failed to list directory: ${directoryPath}`);
  }

  return result.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

export const getProjectDir = async (projectId: string) =>
  invokeTauri<string>('get_project_dir', { projectId });

export const getProjectsIndexPath = async () =>
  invokeTauri<string>('get_projects_index_path');

export const getProjectStorageSettings = async () =>
  invokeTauri<ProjectStorageSettings>('get_project_storage_settings');

export const setProjectStorageRoot = async (rootPath: string) =>
  invokeTauri<ProjectStorageSettings>('set_project_storage_root', { rootPath });

export const resetProjectStorageRoot = async () =>
  invokeTauri<ProjectStorageSettings>('set_project_storage_root', { rootPath: null });

export const loadProjectIndexFromDisk = async () => {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  const indexPath = await getProjectsIndexPath();
  return (await readJSONFile<ProjectConfig[]>(indexPath)) || [];
};

export const saveProjectIndexToDisk = async (projects: ProjectConfig[]) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

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

export const getContextIndexPath = (projectDir: string) =>
  joinPath(projectDir, '.ai', 'context-index.json');

export const getProjectMetaPath = (projectDir: string) =>
  joinPath(projectDir, 'project.json');

export const getProjectDesignDir = (projectDir: string) =>
  joinPath(projectDir, 'design');

export const getProjectStyleDir = (projectDir: string) =>
  joinPath(getProjectDesignDir(projectDir), 'styles');

export const ensureProjectFilesystemStructure = async (projectId: string) => {
  const projectDir = await getProjectDir(projectId);

  await ensureDirectory(joinPath(projectDir, 'project'));
  await ensureDirectory(joinPath(projectDir, 'sketch', 'pages'));
  await ensureDirectory(joinPath(projectDir, 'design', 'prototypes'));
  await ensureBuiltInStylePackFiles(projectId);

  return projectDir;
};

export const loadProjectSnapshotFromDisk = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const projectDir = await getProjectDir(projectId);
  return readJSONFile<PersistedProjectSnapshot>(getProjectSnapshotPath(projectDir));
};

export const saveProjectSnapshotToDisk = async (project: ProjectConfig, snapshot: PersistedProjectSnapshot) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(project.id);
  await Promise.all([
    writeJSONFile(getProjectMetaPath(projectDir), project),
    writeJSONFile(getProjectSnapshotPath(projectDir), snapshot),
  ]);
};

export const loadDesignBoardStateFromDisk = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const projectDir = await getProjectDir(projectId);
  return readJSONFile<PersistedDesignBoardState>(getDesignBoardPath(projectDir));
};

export const saveDesignBoardStateToDisk = async (projectId: string, state: PersistedDesignBoardState) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  await writeJSONFile(getDesignBoardPath(projectDir), state);
};

export const loadWorkflowStateFromDisk = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const projectDir = await getProjectDir(projectId);
  return readJSONFile<WorkflowProjectState>(getWorkflowStatePath(projectDir));
};

export const saveWorkflowStateToDisk = async (projectId: string, state: WorkflowProjectState) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  await writeJSONFile(getWorkflowStatePath(projectDir), state);
};

export const loadContextIndexFromDisk = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const projectDir = await getProjectDir(projectId);
  return readJSONFile<ContextIndex>(getContextIndexPath(projectDir));
};

export const saveContextIndexToDisk = async (projectId: string, index: ContextIndex) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  await writeJSONFile(getContextIndexPath(projectDir), index);
};

export const ensureBuiltInStylePackFiles = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  const designDir = getProjectDesignDir(projectDir);
  const styleDir = getProjectStyleDir(projectDir);

  await ensureDirectory(designDir);
  await ensureDirectory(styleDir);

  const files = getBuiltInStylePackFiles();
  await Promise.all(
    files.map(async (file) => {
      const targetPath = joinProjectRelativePath(projectDir, file.path);
      const existingContent = await readTextFile(targetPath);
      if (existingContent !== null) {
        return;
      }

      await writeTextFile(targetPath, file.content);
    })
  );
};

export const loadProjectStylePackPresets = async (projectId: string): Promise<DesignStyleSeed[]> => {
  if (!isTauriRuntimeAvailable()) {
    return getBuiltInStylePackFiles().map((file) => file.seed);
  }

  await ensureBuiltInStylePackFiles(projectId);

  const projectDir = await getProjectDir(projectId);
  const styleDir = getProjectStyleDir(projectDir);

  let entries: string[];
  try {
    entries = await listDirectory(styleDir);
  } catch {
    return getBuiltInStylePackFiles().map((file) => file.seed);
  }

  const markdownEntries = entries
    .filter((entry) => !entry.endsWith('/'))
    .filter((entry) => /\.(md|markdown)$/i.test(entry));

  const presets = await Promise.all(
    markdownEntries.map(async (entry) => {
      const fileName = entry.replace(/\/$/, '');
      const filePath = joinPath(styleDir, fileName);
      const markdown = await readTextFile(filePath);
      if (!markdown) {
        return null;
      }

      const seed = parseDesignStyleMarkdown(markdown, {
        title: fileName.replace(/\.(md|markdown)$/i, ''),
        summary: '',
        keywords: [],
        palette: [],
        prompt: '',
      });

      return {
        id: fileName.replace(/\.(md|markdown)$/i, ''),
        title: seed.title,
        summary: seed.summary,
        keywords: seed.keywords,
        palette: seed.palette,
        prompt: seed.prompt,
        filePath: sanitizeProjectRelativePath(`design/styles/${fileName}`),
      } satisfies DesignStyleSeed;
    })
  );

  const validPresets: DesignStyleSeed[] = presets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset));
  return validPresets.length > 0 ? validPresets : getBuiltInStylePackFiles().map((file) => file.seed);
};

export const saveProjectStylePackFile = async (projectId: string, relativePath: string, content: string) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  await ensureDirectory(getProjectDesignDir(projectDir));
  await ensureDirectory(getProjectStyleDir(projectDir));
  await writeTextFile(joinProjectRelativePath(projectDir, relativePath), content);
};

export const mapGeneratedFilesForProjectOutput = (
  files: Array<Pick<GeneratedFile, 'path' | 'content' | 'language' | 'category'>>
) =>
  files.flatMap((file) => {
    const normalizedPath = file.path.replace(/\\/g, '/');

    if (normalizedPath.startsWith('design/')) {
      return [{ path: sanitizeProjectRelativePath(normalizedPath), content: file.content }];
    }

    if (normalizedPath === 'src/generated/prototypes/manifest.json') {
      return [{ path: sanitizeProjectRelativePath('design/prototypes/manifest.json'), content: file.content }];
    }

    const prototypeMatch = /^src\/generated\/prototypes\/(.+)$/i.exec(normalizedPath);
    if (prototypeMatch && file.language === 'html') {
      return [{ path: sanitizeProjectRelativePath(`design/prototypes/${prototypeMatch[1]}`), content: file.content }];
    }

    return [];
  });

export const mapSketchFilesForProjectOutput = (
  designPages: Array<Pick<PageStructureNode, 'id' | 'name'> & Partial<PageStructureNode>>,
  wireframes: Record<string, WireframeDocument>
) =>
  designPages.map((page) => buildSketchReferenceFile(page, wireframes[page.id]));

export const loadSketchPageArtifactsFromProjectDir = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return {
      pageStructure: [],
      wireframes: {},
    };
  }

  const projectDir = await ensureProjectFilesystemStructure(projectId);
  const sketchPagesDir = joinPath(projectDir, 'sketch', 'pages');

  let entries: string[] = [];
  try {
    entries = await listDirectory(sketchPagesDir);
  } catch {
    entries = [];
  }

  const markdownEntries = entries
    .filter((entry) => !entry.endsWith('/'))
    .filter((entry) => /\.(md|markdown)$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  const parsedPages = await Promise.all(
    markdownEntries.map(async (entry) => {
      const fileName = entry.replace(/\/$/, '');
      const relativePath = `sketch/pages/${fileName}`;
      const absolutePath = joinProjectRelativePath(projectDir, relativePath);
      const content = (await readTextFile(absolutePath)) || '';
      const parsed = parseSketchPageFile(relativePath, content);
      parsed.wireframe.updatedAt = new Date().toISOString();
      return parsed;
    })
  );

  return {
    pageStructure: parsedPages.map((item) => item.page),
    wireframes: Object.fromEntries(parsedPages.map((item) => [item.page.id, item.wireframe])),
  };
};

export const writeSketchPageFile = async (
  projectId: string,
  page: Pick<PageStructureNode, 'id' | 'name' | 'description'> & Partial<PageStructureNode>,
  wireframe: WireframeDocument | null | undefined
) => {
  if (!isTauriRuntimeAvailable()) {
    return buildSketchPagePath(page);
  }

  const projectDir = await ensureProjectFilesystemStructure(projectId);
  const relativePath = sanitizeProjectRelativePath(buildSketchPagePath(page));
  await writeTextFile(joinProjectRelativePath(projectDir, relativePath), buildSketchPageContent(page, wireframe));
  return relativePath;
};

export const deleteSketchPageFile = async (projectId: string, relativePath: string) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await ensureProjectFilesystemStructure(projectId);
  await removePath(joinProjectRelativePath(projectDir, relativePath));
};

export const syncGeneratedFilesToProjectDir = async (
  projectId: string,
  files: Array<{ path: string; content: string }>
) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  const syncedFiles = mapGeneratedFilesForProjectOutput(
    files.map((file) => ({
      ...file,
      language: file.path.endsWith('.html') ? 'html' : file.path.endsWith('.json') ? 'json' : 'md',
      category: 'design',
    }))
  );

  await ensureDirectory(getProjectDesignDir(projectDir));
  await ensureDirectory(joinPath(getProjectDesignDir(projectDir), 'prototypes'));
  await ensureDirectory(getProjectStyleDir(projectDir));

  try {
    await removePath(joinPath(projectDir, 'src', 'generated'));
  } catch {
    // Ignore cleanup failure for projects that never had legacy generated outputs.
  }

  try {
    const srcEntries = await listDirectory(joinPath(projectDir, 'src'));
    if (srcEntries.length === 0) {
      await removePath(joinPath(projectDir, 'src'));
    }
  } catch {
    // Ignore missing src directory.
  }

  await Promise.all(
    syncedFiles.map((file) => writeTextFile(joinProjectRelativePath(projectDir, file.path), file.content))
  );
};

export const syncSketchFilesToProjectDir = async (
  projectId: string,
  designPages: Array<Pick<PageStructureNode, 'id' | 'name'>>,
  wireframes: Record<string, WireframeDocument>
) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  const sketchDir = joinPath(projectDir, 'sketch');
  const sketchPagesDir = joinPath(sketchDir, 'pages');
  const sketchFiles = mapSketchFilesForProjectOutput(designPages, wireframes);
  const sketchFilePaths = new Set(sketchFiles.map((file) => sanitizeProjectRelativePath(file.path)));

  await ensureDirectory(sketchDir);
  await ensureDirectory(sketchPagesDir);

  let existingEntries: string[] = [];
  try {
    existingEntries = await listDirectory(sketchPagesDir);
  } catch {
    existingEntries = [];
  }

  await Promise.all(
    existingEntries
      .filter((entry) => !entry.endsWith('/'))
      .filter((entry) => /\.(md|markdown)$/i.test(entry))
      .map((entry) => `sketch/pages/${entry.replace(/\/$/, '')}`)
      .filter((relativePath) => !sketchFilePaths.has(relativePath))
      .map((relativePath) => removePath(joinProjectRelativePath(projectDir, relativePath)))
  );

  await Promise.all(
    sketchFiles.map((file) => writeTextFile(joinProjectRelativePath(projectDir, file.path), file.content))
  );
};

export const removeProjectDirectoryFromDisk = async (projectId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return;
  }

  const projectDir = await getProjectDir(projectId);
  await removePath(projectDir);
};
