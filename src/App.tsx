import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { ProjectSetup } from './components/project/ProjectSetup';
import { WorkbenchIcon } from './components/ui/WorkbenchIcon';
import { MacButton, MacIconButton, MacInput, MacPanel, MacSelectField } from './components/ui';
import { UiFeedbackMode } from './components/ui/UiFeedbackMode';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { ensureDesktopRuntimeSidecar } from './modules/runtime-sidecar/desktopRuntimeSidecar';
import { useProjectStore } from './store/projectStore';
import { APP_STYLE_STORAGE_KEY, getInitialAppStyle, type AppStyle } from './appTheme';
import {
  DESKTOP_PRIMARY_ROLES,
  DESKTOP_WORKBENCH_ROLES,
  ROLE_TAB_ICONS,
  type RoleView,
} from './appNavigation';
import { AI_CHAT_SETTINGS_EVENT } from './modules/ai/chat/chatCommands';
import type { ProjectWorkspaceSnapshot } from './store/projectStore';
import type {
  FeatureNode,
  GeneratedFile,
  PageStructureNode,
  ProjectConfig,
} from './types';
import {
  clampDesktopAiPaneWidth,
  getDesktopAiPaneWidthFromPointer,
  isDesktopTopbarInteractiveTarget,
} from './features/desktopShell/desktopShell';
import { LAYOUT_PREFERENCE_KEYS, readLayoutSize, writeLayoutSize } from './utils/layoutPreferences';
import { getCanvasPreset } from './utils/wireframe';
import {
  getProjectDir,
  ensureProjectVaultDirectory,
  ensureProjectFilesystemStructure,
  getProjectStorageSettings,
  isTauriRuntimeAvailable,
  loadProjectIndexFromDisk,
  loadSketchPageArtifactsFromProjectDir,
  loadProjectSnapshotFromDisk,
  removeProjectDirectoryFromDisk,
  resetProjectStorageRoot,
  resolveProjectRuntimeRootPath,
  saveProjectIndexToDisk,
  saveProjectSnapshotToDisk,
  setProjectStorageRoot,
  syncGeneratedFilesToProjectDir,
  syncSketchFilesToProjectDir,
  type ProjectStorageSettings,
} from './utils/projectPersistence';
import { normalizeComparableFileSystemPath, stripWindowsExtendedLengthPathPrefix } from './utils/fileSystemPaths.ts';
import 'allotment/dist/style.css';
import './App.css';

const LazyAIWorkspace = lazy(async () => {
  const module = await import('./components/ai/AIWorkspace');
  return { default: module.AIWorkspace };
});

const LazyWorkspace = lazy(async () => {
  const module = await import('./components/workspace');
  return { default: module.Workspace };
});

const LazyProductWorkbench = lazy(async () => {
  const module = await import('./components/product/ProductWorkbench');
  return { default: module.ProductWorkbench };
});

const LazyAgentShellPage = lazy(async () => {
  const module = await import('./features/agent-shell/pages/AgentShellPage');
  return { default: module.AgentShellPage };
});

const LazyDesignWorkbenchView = lazy(async () => {
  const module = await import('./components/design/DesignWorkbenchScreen');
  return { default: module.DesignWorkbenchScreen };
});

const WORKBENCH_LAZY_FALLBACK = <div className="app-surface-loading">加载工作区中...</div>;
let aiServiceModulePromise: Promise<typeof import('./modules/ai/core/AIService')> | null = null;

const loadAIServiceModule = () => (aiServiceModulePromise ??= import('./modules/ai/core/AIService'));

type ThemeMode = 'dark' | 'light';
type ProjectStorageState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
type PersistedProjectSnapshot = {
  workspace: ProjectWorkspaceSnapshot;
  featureTree: ReturnType<typeof useFeatureTreeStore.getState>['tree'];
};
type DesktopMenuAction =
  | { kind: 'native'; id: string }
  | { kind: 'edit'; command: 'cut' | 'copy' | 'paste' | 'selectAll' }
  | { kind: 'window'; command: 'minimize' | 'toggleMaximize' | 'close' };

type DesktopMenuGroup = {
  id: string;
  label: string;
  items: Array<{
    label: string;
    hint?: string;
    action: DesktopMenuAction;
  }>;
};

const DESKTOP_APP_MENUS: DesktopMenuGroup[] = [
  {
    id: 'file',
    label: '文件',
    items: [
      { label: '新建项目', hint: 'Ctrl+N', action: { kind: 'native', id: 'file.new_project' } },
      { label: '项目列表', hint: 'Ctrl+O', action: { kind: 'native', id: 'file.project_manager' } },
    ],
  },
  {
    id: 'edit',
    label: '编辑',
    items: [
      { label: '剪切', hint: 'Ctrl+X', action: { kind: 'edit', command: 'cut' } },
      { label: '复制', hint: 'Ctrl+C', action: { kind: 'edit', command: 'copy' } },
      { label: '粘贴', hint: 'Ctrl+V', action: { kind: 'edit', command: 'paste' } },
      { label: '全选', hint: 'Ctrl+A', action: { kind: 'edit', command: 'selectAll' } },
    ],
  },
  {
    id: 'view',
    label: '查看',
    items: [
      { label: '知识库', action: { kind: 'native', id: 'view.knowledge' } },
      { label: 'Wiki 图谱', action: { kind: 'native', id: 'view.wiki' } },
      { label: '页面', action: { kind: 'native', id: 'view.page' } },
      { label: '设计', action: { kind: 'native', id: 'view.design' } },
      { label: 'Agent', action: { kind: 'native', id: 'view.agent' } },
      { label: '开发', action: { kind: 'native', id: 'view.develop' } },
      { label: '测试', action: { kind: 'native', id: 'view.test' } },
      { label: '发布', action: { kind: 'native', id: 'view.operations' } },
      { label: '切换主题', action: { kind: 'native', id: 'view.toggle_theme' } },
    ],
  },
  {
    id: 'window',
    label: '窗口',
    items: [
      { label: '最小化', action: { kind: 'window', command: 'minimize' } },
      { label: '切换最大化', action: { kind: 'window', command: 'toggleMaximize' } },
      { label: '关闭窗口', action: { kind: 'window', command: 'close' } },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    items: [
      { label: '关于 GoodNight', action: { kind: 'native', id: 'help.about' } },
      { label: '布局说明', action: { kind: 'native', id: 'help.layout_overview' } },
      { label: '知识库说明', action: { kind: 'native', id: 'help.knowledge_overview' } },
      { label: '页面说明', action: { kind: 'native', id: 'help.page_overview' } },
    ],
  },
];

const readProjectIndex = (): ProjectConfig[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_INDEX_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ProjectConfig => Boolean(item) && typeof item === 'object') as ProjectConfig[]
      : [];
  } catch {
    return [];
  }
};

const safeLocalStorageSetItem = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const writeProjectIndex = (projects: ProjectConfig[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  safeLocalStorageSetItem(PROJECT_INDEX_STORAGE_KEY, JSON.stringify(projects));
};

const getProjectSnapshotStorageKey = (projectId: string) => `${PROJECT_SNAPSHOT_STORAGE_PREFIX}:${projectId}`;

const readProjectSnapshot = (projectId: string): PersistedProjectSnapshot | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getProjectSnapshotStorageKey(projectId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedProjectSnapshot;
  } catch {
    return null;
  }
};

const writeProjectSnapshot = (projectId: string, snapshot: PersistedProjectSnapshot) => {
  if (typeof window === 'undefined') {
    return;
  }

  safeLocalStorageSetItem(getProjectSnapshotStorageKey(projectId), JSON.stringify(snapshot));
};

const removeProjectSnapshot = (projectId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getProjectSnapshotStorageKey(projectId));
};

const normalizeProjectVaultComparablePath = (value: string | null | undefined) =>
  normalizeComparableFileSystemPath(value);

const resolveProjectVaultPathForProjectDir = (
  vaultPath: string,
  projectDir: string,
  projectStorageSettings: Pick<ProjectStorageSettings, 'rootPath' | 'defaultPath'> | null
) => {
  const normalizedVaultPath = normalizeProjectVaultComparablePath(vaultPath);
  const normalizedRootPath = normalizeProjectVaultComparablePath(projectStorageSettings?.rootPath);
  const normalizedDefaultPath = normalizeProjectVaultComparablePath(projectStorageSettings?.defaultPath);

  if (
    normalizedVaultPath &&
    (normalizedVaultPath === normalizedRootPath || normalizedVaultPath === normalizedDefaultPath)
  ) {
    return projectDir;
  }

  return stripWindowsExtendedLengthPathPrefix(vaultPath.trim());
};

const THEME_STORAGE_KEY = 'goodnight-theme-mode';
const DESKTOP_AI_PANE_WIDTH_BOUNDS = { min: 280, max: 560 };
const DEFAULT_DESKTOP_AI_PANE_WIDTH = 360;
const LEGACY_DESKTOP_AI_PANE_WIDTH = 450;
const DESKTOP_AI_PANE_TRANSITION_MS = 240;
const DESIGN_BOARD_STORAGE_PREFIX = 'goodnight-design-board';
const PROJECT_INDEX_STORAGE_KEY = 'goodnight-project-index';
const PROJECT_SNAPSHOT_STORAGE_PREFIX = 'goodnight-project-snapshot';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const getDesignBoardStorageKey = (projectId: string) => `${DESIGN_BOARD_STORAGE_PREFIX}:${projectId}`;


const renderGeneratedFileLabel = (file: GeneratedFile) => file.path.split('/').pop() || file.path;

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<RoleView>('agent');
  const isDesignWorkbenchActive = currentRole === 'design';
  const [desktopAiPaneWidth, setDesktopAiPaneWidth] = useState(() => {
    const nextWidth = readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      DEFAULT_DESKTOP_AI_PANE_WIDTH,
      DESKTOP_AI_PANE_WIDTH_BOUNDS
    );

    if (nextWidth === LEGACY_DESKTOP_AI_PANE_WIDTH) {
      return writeLayoutSize(
        LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
        DEFAULT_DESKTOP_AI_PANE_WIDTH,
        DESKTOP_AI_PANE_WIDTH_BOUNDS
      );
    }

    return nextWidth;
  });
  const [isDesktopAiCollapsed, setIsDesktopAiCollapsed] = useState(false);
  const [isDesktopAiPaneMounted, setIsDesktopAiPaneMounted] = useState(true);
  const [isDesktopAiPaneVisible, setIsDesktopAiPaneVisible] = useState(true);
  const [isDesktopAiPaneResizing, setIsDesktopAiPaneResizing] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>(() => readProjectIndex());
  const [currentProjectDir, setCurrentProjectDir] = useState<string | null>(null);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [projectStorageSettings, setProjectStorageSettings] = useState<ProjectStorageSettings | null>(null);
  const [projectStorageDraftOverride, setProjectStorageDraftOverride] = useState<string | null>(null);
  const [projectVaultDraftOverride, setProjectVaultDraftOverride] = useState<string | null>(null);
  const [projectStorageState, setProjectStorageState] = useState<ProjectStorageState>('idle');
  const [projectStorageMessage, setProjectStorageMessage] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [appStyle] = useState<AppStyle>(() => {
    if (typeof window === 'undefined') {
      return 'workbench';
    }

    return getInitialAppStyle(() => window.localStorage.getItem(APP_STYLE_STORAGE_KEY));
  });
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const [pageWorkbenchTargetPageId, setPageWorkbenchTargetPageId] = useState<string | null>(null);
  const [openDesktopMenuId, setOpenDesktopMenuId] = useState<string | null>(null);
  const desktopAiTransitionTimerRef = useRef<number | null>(null);
  const desktopAiEnterFrameRef = useRef<number | null>(null);
  const desktopAiEnterCommitFrameRef = useRef<number | null>(null);
  const desktopAiPaneElementRef = useRef<HTMLDivElement | null>(null);
  const desktopAiResizeHandleRef = useRef<HTMLDivElement | null>(null);
  const desktopAiPaneWidthRef = useRef(desktopAiPaneWidth);
  const desktopAiResizeFrameRef = useRef<number | null>(null);
  const desktopAiResizeDraftWidthRef = useRef<number | null>(null);

  useEffect(() => {
    void ensureDesktopRuntimeSidecar();
  }, []);

  const hasRestoredPersistedProjectRef = useRef(false);

  const { clearCanvas } = usePreviewStore();
  const { setTree, tree: featureTree, clearTree } = useFeatureTreeStore();
  const {
    currentProjectId,
    currentProject,
    graph,
    memory,
    rawRequirementInput,
    featuresMarkdown,
    wireframesMarkdown,
    requirementDocs,
    documentEvents,
    activeKnowledgeFileId,
    brief,
    pageStructure,
    wireframes,
    designSystem,
    uiSpecs,
    devTasks,
    generatedFiles,
    testPlan,
    deployPlan,
    createProject,
    updateProject,
    loadProjectWorkspace,
    switchProject,
    deleteProject,
    clearProject,
    addRootPage,
    replacePageStructure,
    replaceWireframes,
    updatePageStructureNode,
    upsertWireframe,
    generateDeliveryArtifacts,
  } = useProjectStore();

  const canUseProjectFilesystem = isTauriRuntimeAvailable();
  const activeDesktopRole = useMemo(
    () => DESKTOP_WORKBENCH_ROLES.find((role) => role.id === currentRole) || DESKTOP_WORKBENCH_ROLES[0],
    [currentRole]
  );
  const isDesktopWorkbenchMode = Boolean(currentProject);
  const showWorkspaceSidebar = currentRole !== 'agent';

  useEffect(() => {
    document.body.classList.toggle('desktop-workbench-mode', isDesktopWorkbenchMode);
    document.documentElement.classList.toggle('desktop-workbench-mode', isDesktopWorkbenchMode);

    return () => {
      document.body.classList.remove('desktop-workbench-mode');
      document.documentElement.classList.remove('desktop-workbench-mode');
    };
  }, [isDesktopWorkbenchMode]);

  useEffect(
    () => () => {
      if (desktopAiTransitionTimerRef.current !== null) {
        window.clearTimeout(desktopAiTransitionTimerRef.current);
      }
      if (desktopAiEnterFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterFrameRef.current);
      }
      if (desktopAiEnterCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterCommitFrameRef.current);
      }
      if (desktopAiResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiResizeFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!showWorkspaceSidebar) {
      if (desktopAiTransitionTimerRef.current !== null) {
        window.clearTimeout(desktopAiTransitionTimerRef.current);
        desktopAiTransitionTimerRef.current = null;
      }
      if (desktopAiEnterFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterFrameRef.current);
        desktopAiEnterFrameRef.current = null;
      }
      if (desktopAiEnterCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterCommitFrameRef.current);
        desktopAiEnterCommitFrameRef.current = null;
      }
      setIsDesktopAiPaneMounted(false);
      setIsDesktopAiPaneVisible(false);
      return;
    }

    if (!isDesktopAiCollapsed) {
      if (desktopAiTransitionTimerRef.current !== null) {
        window.clearTimeout(desktopAiTransitionTimerRef.current);
        desktopAiTransitionTimerRef.current = null;
      }
      if (desktopAiEnterFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterFrameRef.current);
        desktopAiEnterFrameRef.current = null;
      }
      if (desktopAiEnterCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiEnterCommitFrameRef.current);
        desktopAiEnterCommitFrameRef.current = null;
      }

      setIsDesktopAiPaneVisible(false);
      setIsDesktopAiPaneMounted(true);
      desktopAiEnterFrameRef.current = window.requestAnimationFrame(() => {
        desktopAiEnterCommitFrameRef.current = window.requestAnimationFrame(() => {
          setIsDesktopAiPaneVisible(true);
          desktopAiEnterCommitFrameRef.current = null;
        });
        desktopAiEnterFrameRef.current = null;
      });

      return () => {
        if (desktopAiEnterFrameRef.current !== null) {
          window.cancelAnimationFrame(desktopAiEnterFrameRef.current);
          desktopAiEnterFrameRef.current = null;
        }
        if (desktopAiEnterCommitFrameRef.current !== null) {
          window.cancelAnimationFrame(desktopAiEnterCommitFrameRef.current);
          desktopAiEnterCommitFrameRef.current = null;
        }
      };
    }

    if (desktopAiEnterFrameRef.current !== null) {
      window.cancelAnimationFrame(desktopAiEnterFrameRef.current);
      desktopAiEnterFrameRef.current = null;
    }
    if (desktopAiEnterCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(desktopAiEnterCommitFrameRef.current);
      desktopAiEnterCommitFrameRef.current = null;
    }
    setIsDesktopAiPaneVisible(false);
    if (desktopAiTransitionTimerRef.current !== null) {
      window.clearTimeout(desktopAiTransitionTimerRef.current);
    }
    desktopAiTransitionTimerRef.current = window.setTimeout(() => {
      setIsDesktopAiPaneMounted(false);
      desktopAiTransitionTimerRef.current = null;
    }, DESKTOP_AI_PANE_TRANSITION_MS);
  }, [showWorkspaceSidebar, isDesktopAiCollapsed]);

  useEffect(() => {
    desktopAiPaneWidthRef.current = desktopAiPaneWidth;
    writeLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      desktopAiPaneWidth,
      DESKTOP_AI_PANE_WIDTH_BOUNDS
    );
  }, [desktopAiPaneWidth]);

  const syncDesktopAiPaneWidthStyles = useCallback((nextWidth: number) => {
    const pane = desktopAiPaneElementRef.current;
    if (pane) {
      pane.style.flex = `0 0 ${nextWidth}px`;
      pane.style.width = `${nextWidth}px`;
    }

    const handle = desktopAiResizeHandleRef.current;
    if (handle) {
      handle.setAttribute('aria-valuenow', String(nextWidth));
    }
  }, []);

  useEffect(() => {
    syncDesktopAiPaneWidthStyles(desktopAiPaneWidth);
  }, [desktopAiPaneWidth, syncDesktopAiPaneWidthStyles]);

  const handleDesktopAiResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!showWorkspaceSidebar || !isDesktopAiPaneVisible) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = desktopAiPaneWidthRef.current;
    desktopAiResizeDraftWidthRef.current = startWidth;
    syncDesktopAiPaneWidthStyles(startWidth);
    setIsDesktopAiPaneResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = getDesktopAiPaneWidthFromPointer({
        startWidth,
        startPointerX: startX,
        currentPointerX: moveEvent.clientX,
        bounds: DESKTOP_AI_PANE_WIDTH_BOUNDS,
      });
      desktopAiResizeDraftWidthRef.current = nextWidth;
      if (desktopAiResizeFrameRef.current !== null) {
        return;
      }

      desktopAiResizeFrameRef.current = window.requestAnimationFrame(() => {
        desktopAiResizeFrameRef.current = null;
        if (desktopAiResizeDraftWidthRef.current !== null) {
          syncDesktopAiPaneWidthStyles(desktopAiResizeDraftWidthRef.current);
        }
      });
    };

    const handlePointerUp = () => {
      if (desktopAiResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopAiResizeFrameRef.current);
        desktopAiResizeFrameRef.current = null;
      }

      const nextWidth = desktopAiResizeDraftWidthRef.current ?? startWidth;
      desktopAiResizeDraftWidthRef.current = null;
      desktopAiPaneWidthRef.current = nextWidth;
      syncDesktopAiPaneWidthStyles(nextWidth);
      setDesktopAiPaneWidth(nextWidth);
      setIsDesktopAiPaneResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [isDesktopAiPaneVisible, showWorkspaceSidebar, syncDesktopAiPaneWidthStyles]);

  const handleDesktopAiResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    event.preventDefault();
    let nextWidth = desktopAiPaneWidthRef.current;

    if (event.key === 'Home') {
      nextWidth = DESKTOP_AI_PANE_WIDTH_BOUNDS.min;
    } else if (event.key === 'End') {
      nextWidth = DESKTOP_AI_PANE_WIDTH_BOUNDS.max;
    } else {
      const delta = event.key === 'ArrowLeft' ? 16 : -16;
      nextWidth = clampDesktopAiPaneWidth(desktopAiPaneWidthRef.current + delta, DESKTOP_AI_PANE_WIDTH_BOUNDS);
    }

    desktopAiPaneWidthRef.current = nextWidth;
    syncDesktopAiPaneWidthStyles(nextWidth);
    setDesktopAiPaneWidth(nextWidth);
  }, [syncDesktopAiPaneWidthStyles]);

  const toggleThemeMode = useCallback((): void => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshSketchArtifactsFromDisk = useCallback(async () => {
    if (!canUseProjectFilesystem || !currentProject) {
      return null;
    }

    const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
    replacePageStructure(sketchArtifacts.pageStructure, featureTree);
    replaceWireframes(sketchArtifacts.wireframes, featureTree);
    return sketchArtifacts;
  }, [canUseProjectFilesystem, currentProject, featureTree, replacePageStructure, replaceWireframes]);
  const testCases = testPlan?.cases ?? [];
  const deploySteps = deployPlan?.steps ?? [];
  const recommendedCommands = deployPlan?.commands ?? ['npm run build', 'npm run preview'];
  const designCanvasPreset = useMemo(() => getCanvasPreset(currentProject?.appType), [currentProject?.appType]);

  useEffect(() => {
    let isMounted = true;

    void loadProjectIndexFromDisk()
      .then((diskProjects) => {
        if (!isMounted || diskProjects.length === 0) {
          return;
        }

        setProjects((current) => {
          const byId = new Map(current.map((project) => [project.id, project]));
          diskProjects.forEach((project) => byId.set(project.id, project));
          const nextProjects = Array.from(byId.values()).sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );
          writeProjectIndex(nextProjects);
          return nextProjects;
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    let isMounted = true;
    setProjectStorageState('loading');
    setProjectStorageMessage(null);

    void getProjectStorageSettings()
      .then((settings) => {
        if (!isMounted) {
          return;
        }

        setProjectStorageSettings(settings);
        setProjectStorageState('idle');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setProjectStorageState('error');
        setProjectStorageMessage('项目存储路径读取失败。');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.style = appStyle;
    window.localStorage.setItem(APP_STYLE_STORAGE_KEY, appStyle);
  }, [appStyle]);

  const persistActiveProjectSnapshot = useCallback(
    (projectOverride?: ProjectConfig | null, featureTreeOverride = featureTree) => {
      const activeProject = projectOverride || currentProject;
      if (!activeProject) {
        return;
      }

      const workspace: ProjectWorkspaceSnapshot = {
        currentProject: activeProject,
        graph,
        memory,
        rawRequirementInput,
        featuresMarkdown,
        wireframesMarkdown,
        requirementDocs,
        documentEvents,
        activeKnowledgeFileId,
        brief,
        pageStructure,
        wireframes,
        designSystem,
        uiSpecs,
        devTasks,
        generatedFiles,
        testPlan,
        deployPlan,
      };

      writeProjectSnapshot(activeProject.id, {
        workspace,
        featureTree: featureTreeOverride,
      });

      void saveProjectSnapshotToDisk(activeProject, {
        workspace,
        featureTree: featureTreeOverride,
      })
        .then(() =>
          Promise.all([
            syncGeneratedFilesToProjectDir(activeProject.id, generatedFiles),
            syncSketchFilesToProjectDir(activeProject.id, collectDesignPages(pageStructure), wireframes),
          ])
        )
        .catch(() => undefined);

      setProjects((current) => {
        const nextProjects = [...current.filter((item) => item.id !== activeProject.id), activeProject].sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
        writeProjectIndex(nextProjects);
        void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
        return nextProjects;
      });
    },
    [
      currentProject,
      deployPlan,
      designSystem,
      devTasks,
      featureTree,
      featuresMarkdown,
      generatedFiles,
      graph,
      memory,
      pageStructure,
      brief,
      rawRequirementInput,
      requirementDocs,
      documentEvents,
      activeKnowledgeFileId,
      testPlan,
      uiSpecs,
      wireframes,
      wireframesMarkdown,
    ]
  );

  useEffect(() => {
    if (!currentProject || !isDesignWorkbenchActive) {
      return;
    }

    persistActiveProjectSnapshot();
  }, [currentProject, persistActiveProjectSnapshot]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setProjects((current) => {
      if (current.some((item) => item.id === currentProject.id)) {
        return current;
      }

      const nextProjects = [...current, currentProject].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
      writeProjectIndex(nextProjects);
      void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
      return nextProjects;
    });
  }, [currentProject]);

  useEffect(() => {
    if (!currentProject) {
      setCurrentProjectDir(null);
      return;
    }
  }, [currentProject, isDesignWorkbenchActive]);

  useEffect(() => {
    if (!currentProject) {
      setCurrentProjectDir(null);
      return;
    }

    if (!canUseProjectFilesystem) {
      setCurrentProjectDir(null);
      return;
    }

    let isMounted = true;

    void getProjectDir(currentProject.id)
      .then((projectDir) => {
        if (isMounted) {
          setCurrentProjectDir(projectDir);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCurrentProjectDir(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canUseProjectFilesystem, currentProject]);

  useEffect(() => {
    const runtimeProjectRoot = resolveProjectRuntimeRootPath(currentProject, currentProjectDir);
    if (!runtimeProjectRoot) {
      return;
    }

    void loadAIServiceModule()
      .then(({ aiService }) => {
        aiService.setConfig({ projectRoot: runtimeProjectRoot });
      })
      .catch(() => undefined);
  }, [currentProject, currentProjectDir]);

  useEffect(() => {
    if (!currentProject || !currentProjectDir || !projectStorageSettings) {
      return;
    }

    const nextVaultPath = resolveProjectVaultPathForProjectDir(
      currentProject.vaultPath,
      currentProjectDir,
      projectStorageSettings
    );

    if (!nextVaultPath || nextVaultPath === currentProject.vaultPath) {
      return;
    }

    updateProject({ vaultPath: nextVaultPath });
  }, [currentProject, currentProjectDir, projectStorageSettings, updateProject]);

  const handleSaveProjectStoragePath = useCallback(async (rootPath: string) => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    setProjectStorageState('saving');
    setProjectStorageMessage(null);

    try {
      const nextSettings = await setProjectStorageRoot(rootPath);
      setProjectStorageSettings(nextSettings);
      setProjectStorageDraftOverride(null);
      setProjectStorageState('saved');
      setProjectStorageMessage('项目存储路径已更新。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '项目存储路径保存失败。');
    }
  }, []);

  const handlePickProjectStoragePath = useCallback(async () => {
    if (!isTauriRuntimeAvailable() || !projectStorageSettings) {
      return;
    }

    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath: projectStorageSettings?.rootPath || projectStorageSettings?.defaultPath,
      });

      if (typeof selectedPath !== 'string') {
        return;
      }

      setProjectStorageDraftOverride(selectedPath);
      setProjectStorageState('idle');
      setProjectStorageMessage('已选择目录，点击“保存路径”后生效。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '目录选择失败。');
    }
  }, [projectStorageSettings]);

  const handlePickProjectVaultPath = useCallback(async () => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath:
          projectVaultDraftOverride ||
          currentProject?.vaultPath ||
          projectStorageSettings?.rootPath ||
          projectStorageSettings?.defaultPath,
      });

      if (typeof selectedPath !== 'string') {
        return;
      }

      setProjectVaultDraftOverride(selectedPath);
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '知识库目录选择失败。');
    }
  }, [currentProject?.vaultPath, projectStorageSettings?.defaultPath, projectStorageSettings?.rootPath, projectVaultDraftOverride]);

  const handleResetProjectStoragePath = useCallback(async () => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    setProjectStorageState('saving');
    setProjectStorageMessage(null);

    try {
      const nextSettings = await resetProjectStorageRoot();
      setProjectStorageSettings(nextSettings);
      setProjectStorageDraftOverride(null);
      setProjectStorageState('saved');
      setProjectStorageMessage('已恢复默认项目路径。');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : '恢复默认项目路径失败。');
    }
  }, []);

  const handleCreateProject = (input: Parameters<typeof createProject>[0]) => {
    const { project, featureTree: starterFeatureTree } = createProject(input);
    setTree(starterFeatureTree);
    clearCanvas();
    setSelectedFeature(starterFeatureTree.children[0] || null);
    setCurrentRole('agent');
    setIsProjectManagerOpen(false);
    setProjectVaultDraftOverride(null);
    void ensureProjectFilesystemStructure(project.id)
      .then(async (projectDir) => {
        const effectiveProjectStorageSettings =
          projectStorageSettings ||
          (isTauriRuntimeAvailable() ? await getProjectStorageSettings().catch(() => null) : null);
        const nextVaultPath = resolveProjectVaultPathForProjectDir(
          project.vaultPath,
          projectDir,
          effectiveProjectStorageSettings
        );

        if (nextVaultPath && nextVaultPath !== project.vaultPath) {
          updateProject({ vaultPath: nextVaultPath });
          await ensureProjectVaultDirectory({ vaultPath: nextVaultPath }).catch(() => undefined);
          return;
        }

        if (project.vaultPath) {
          await ensureProjectVaultDirectory(project).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  };

  const handleOpenProject = useCallback(async (projectId: string) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    if (currentProject?.id && currentProject.id !== projectId) {
      persistActiveProjectSnapshot();
    }

    switchProject(targetProject);
    const snapshot = (await loadProjectSnapshotFromDisk(projectId)) || readProjectSnapshot(projectId);
    if (snapshot?.workspace) {
      loadProjectWorkspace(snapshot.workspace);
    }

    if (snapshot?.featureTree) {
      setTree(snapshot.featureTree);
      setSelectedFeature(snapshot.featureTree.children[0] || null);
    } else {
      clearTree();
      setSelectedFeature(null);
    }

    clearCanvas();
    setCurrentRole('agent');
    setIsProjectManagerOpen(false);
    void ensureProjectFilesystemStructure(targetProject.id).catch(() => undefined);
    if (targetProject.vaultPath) {
      void ensureProjectVaultDirectory(targetProject).catch(() => undefined);
    }
  }, [clearCanvas, clearTree, currentProject?.id, loadProjectWorkspace, persistActiveProjectSnapshot, projects, setTree, switchProject]);

  useEffect(() => {
    if (hasRestoredPersistedProjectRef.current || !currentProjectId) {
      return;
    }

    const persistedProject = projects.find((project) => project.id === currentProjectId) || currentProject;
    if (!persistedProject) {
      return;
    }

    hasRestoredPersistedProjectRef.current = true;
    void handleOpenProject(persistedProject.id);
  }, [currentProject, currentProjectId, handleOpenProject, projects]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    const confirmed = isTauriRuntimeAvailable()
      ? await confirm(`确定删除项目“${targetProject.name}”吗？`, {
          kind: 'warning',
          okLabel: '删除',
          cancelLabel: '取消',
        })
      : window.confirm(`确定删除项目“${targetProject.name}”吗？`);

    if (!confirmed) {
      return;
    }

    deleteProject(projectId);
    removeProjectSnapshot(projectId);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getDesignBoardStorageKey(projectId));
    }

    await removeProjectDirectoryFromDisk(projectId).catch(() => undefined);

    setProjects((current) => {
      const nextProjects = current.filter((item) => item.id !== projectId);
      writeProjectIndex(nextProjects);
      void saveProjectIndexToDisk(nextProjects).catch(() => undefined);
      return nextProjects;
    });

    if (currentProject?.id === projectId) {
      const fallbackProject = projects.find((item) => item.id !== projectId) || null;
      if (fallbackProject) {
        void handleOpenProject(fallbackProject.id);
      } else {
        clearProject();
        clearTree();
        clearCanvas();
        setSelectedFeature(null);
        setIsProjectManagerOpen(true);
      }
    }
  }, [clearCanvas, clearProject, clearTree, currentProject?.id, deleteProject, handleOpenProject, projects]);

  const handleResetProject = useCallback(() => {
    if (currentProject && typeof window !== 'undefined') {
      window.localStorage.removeItem(getDesignBoardStorageKey(currentProject.id));
    }

    clearProject();
    clearTree();
    clearCanvas();
    setSelectedFeature(null);
    setCurrentRole('agent');
    setIsProjectManagerOpen(true);
  }, [clearCanvas, clearProject, clearTree, currentProject]);

  const handleNativeMenuEvent = useCallback((menuId: string) => {
    switch (menuId) {
      case 'file.new_project':
        handleResetProject();
        break;
      case 'file.project_manager':
        setIsProjectManagerOpen(true);
        break;
      case 'view.knowledge':
        setCurrentRole('knowledge');
        break;
      case 'view.wiki':
        setCurrentRole('knowledge');
        break;
      case 'view.page':
        setCurrentRole('page');
        break;
      case 'view.design':
        setCurrentRole('design');
        break;
      case 'view.agent':
        setCurrentRole('agent');
        break;
      case 'view.develop':
        setCurrentRole('develop');
        break;
      case 'view.test':
        setCurrentRole('test');
        break;
      case 'view.operations':
        setCurrentRole('operations');
        break;
      case 'view.toggle_theme':
        toggleThemeMode();
        break;
      case 'help.layout_overview':
        window.alert('当前界面参考桌面应用菜单栏布局：左侧切换工作区，顶部菜单负责项目级操作，内容区按默认窗口尺寸排布。');
        break;
      case 'help.knowledge_overview':
        window.alert('知识库用于承载用户内容；AI 会直接结合当前项目内容和技能上下文来回答问题。');
        break;
      case 'help.page_overview':
        window.alert('页面用于维护页面结构、页面草图和画布模块。');
        break;
      case 'help.about':
        window.alert('GoodNight · 可视化软件开发平台');
        break;
      default:
        break;
    }
  }, [handleResetProject, toggleThemeMode]);

  const handleDesktopMenuAction = useCallback(
    async (action: DesktopMenuAction) => {
      setOpenDesktopMenuId(null);

      if (action.kind === 'native') {
        handleNativeMenuEvent(action.id);
        return;
      }

      if (action.kind === 'edit') {
        try {
          document.execCommand(action.command);
        } catch {
          // Ignore clipboard restrictions in the webview.
        }
        return;
      }

      if (!isTauriRuntimeAvailable()) {
        return;
      }

      const appWindow = getCurrentWindow();

      try {
        switch (action.command) {
          case 'minimize':
            await appWindow.minimize();
            break;
          case 'toggleMaximize':
            if (await appWindow.isMaximized()) {
              await appWindow.unmaximize();
            } else {
              await appWindow.maximize();
            }
            break;
          case 'close':
            await appWindow.close();
            break;
          default:
            break;
        }
      } catch (error) {
        console.error(`Failed to run desktop window action: ${action.command}`, error);
      }
    },
    [handleNativeMenuEvent]
  );

  const handleDesktopTopbarDoubleClick = useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || isDesktopTopbarInteractiveTarget(event.target)) {
        return;
      }

      await handleDesktopMenuAction({ kind: 'window', command: 'toggleMaximize' });
    },
    [handleDesktopMenuAction]
  );

  useEffect(() => {
    if (!openDesktopMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-app-menu-root="desktop"]')) {
        return;
      }

      setOpenDesktopMenuId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDesktopMenuId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDesktopMenuId]);

  const handleGenerateDelivery = () => {
    generateDeliveryArtifacts(featureTree);
  };

  const renderDesignResizeHandles = useCallback((..._args: unknown[]) => null, []);

  const handleOpenPageModules = useCallback((pageId: string | null | undefined) => {
    if (!pageId) {
      return;
    }

    setPageWorkbenchTargetPageId(pageId);
    setCurrentRole('page');
  }, []);

  const renderProductView = (entryTab: 'knowledge' | 'page') => (
    <LazyProductWorkbench
      onFeatureSelect={(node) => setSelectedFeature(node)}
      layoutFocus="balanced"
      layoutDensity="comfortable"
      entryTab={entryTab}
      preferredPageId={pageWorkbenchTargetPageId}
      onEntryTabChange={(tab) => setCurrentRole(tab)}
    />
  );

  const designWorkbenchViewProps = {
    addRootPage,
    canUseProjectFilesystem,
    designCanvasPreset,
    currentProjectAppType: currentProject?.appType,
    currentProjectDir,
    currentProjectId: currentProject?.id ?? null,
    handleGenerateDelivery,
    handleOpenPageModules,
    pageStructure,
    refreshSketchArtifactsFromDisk,
    renderDesignResizeHandles,
    uiSpecs,
    updatePageStructureNode,
    upsertWireframe,
    wireframes,
  };

  const renderAgentView = () => <LazyAgentShellPage />;

  const renderDevelopView = () => (
    <div className="develop-view">
      <div className="workspace-shell">
        <div className="delivery-summary-bar">
          <div className="graph-metric">
            <span>Files</span>
            <strong>{generatedFiles.length}</strong>
          </div>
          <div className="graph-metric">
            <span>Frontend Tasks</span>
            <strong>{devTasks.filter((task) => task.owner === 'frontend').length}</strong>
          </div>
          <div className="graph-metric">
            <span>Backend Tasks</span>
            <strong>{devTasks.filter((task) => task.owner === 'backend').length}</strong>
          </div>
          <button className="doc-action-btn" onClick={handleGenerateDelivery} type="button">
            更新交付物
          </button>
        </div>

        <div className="delivery-card-grid">
          {devTasks.map((task) => (
            <div key={task.id} className="delivery-card">
              <strong>{task.title}</strong>
              <p>{task.summary}</p>
              <span>
                {task.owner} · {task.relatedFilePaths.length} files
              </span>
            </div>
          ))}
        </div>

        <LazyWorkspace
          files={generatedFiles}
          tasks={devTasks}
          recommendedCommands={recommendedCommands}
          projectRoot={currentProjectDir || undefined}
        />
      </div>
    </div>
  );

  const renderTestView = () => (
    <div className="test-view">
      <div className="test-sidebar">
        <div className="test-nav">
          <button className="test-nav-item active" type="button">
            <span>测试计划</span>
          </button>
          <button className="test-nav-item" type="button">
            <span>Bug 跟踪</span>
          </button>
          <button className="test-nav-item" type="button">
            <span>测试报告</span>
          </button>
        </div>
      </div>

      <div className="test-content">
        <div className="test-header">
          <div className="test-stats">
            <div className="stat-card">
              <span className="stat-num">{graph.nodes.filter((node) => node.type === 'feature').length}</span>
              <span className="stat-label">功能数</span>
            </div>
            <div className="stat-card success">
              <span className="stat-num">{requirementDocs.length}</span>
              <span className="stat-label">知识笔记</span>
            </div>
            <div className="stat-card warning">
              <span className="stat-num">{featureTree?.children.length || 0}</span>
              <span className="stat-label">功能节点</span>
            </div>
            <div className="stat-card info">
              <span className="stat-num">{testPlan?.coverage.caseCount || 0}</span>
              <span className="stat-label">测试用例</span>
            </div>
          </div>

          <div className="test-actions">
            <button className="test-btn primary" onClick={handleGenerateDelivery} type="button">
              生成测试计划
            </button>
            <button className="test-btn" type="button">
              建立 QA 流程
            </button>
          </div>
        </div>

        <div className="test-cases">
          {testCases.map((testCase) => (
            <div key={testCase.id} className="case-item">
              <div className={`case-status ${testCase.priority === 'high' ? 'pending' : 'passed'}`}></div>
              <div className="case-info">
                <span className="case-name">{testCase.title}</span>
                <span className="case-module">
                  {testCase.module} · {testCase.type}
                </span>
              </div>
              <span className="case-time">{testCase.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOperationsView = () => (
    <div className="operations-view">
      <div className="ops-sidebar">
        <div className="ops-nav">
          <button className="ops-nav-item active" type="button">
            <span>部署</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>构建</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>监控</span>
          </button>
          <button className="ops-nav-item" type="button">
            <span>配置</span>
          </button>
        </div>
      </div>

      <div className="ops-content">
        <div className="ops-header">
          <h2>部署中心</h2>
          <div className="ops-actions">
            <button className="ops-btn primary" onClick={handleGenerateDelivery} type="button">
              生成部署脚本
            </button>
            <button className="ops-btn success" type="button">
              规划发布流程
            </button>
          </div>
        </div>

        <div className="deploy-targets">
          <div className="target-card">
            <div className="target-info">
              <span className="target-name">{currentProject?.name || '当前项目'}</span>
              <span className="target-desc">当前工作区</span>
            </div>
            <span className="target-status connected">在线</span>
          </div>
          <div className="target-card">
            <div className="target-info">
              <span className="target-name">Project Memory</span>
              <span className="target-desc">
                {Object.keys(memory?.designSystem || {}).length + Object.keys(memory?.codeStructure || {}).length} 项工作记忆
              </span>
            </div>
            <span className="target-status connected">在线</span>
          </div>
        </div>

        <div className="deploy-history">
          <h3>阶段进度</h3>
          <div className="history-list">
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 1</span>
              <span className="history-time">当前项目基线已建立</span>
              <span className="history-target">{currentProject?.name}</span>
            </div>
            <div className="history-item">
              <span className="history-status success">完成</span>
              <span className="history-version">Phase 2-6</span>
              <span className="history-time">Wiki / Sketch / UI / Dev / Test / Deploy</span>
              <span className="history-target">{deployPlan?.target || 'Workspace'}</span>
            </div>
          </div>
        </div>

        {deployPlan ? (
          <div className="deploy-history">
            <h3>部署步骤</h3>
            <div className="history-list">
              {deploySteps.map((step, index) => (
                <div key={step} className="history-item">
                  <span className="history-status success">{index + 1}</span>
                  <span className="history-version">Step</span>
                  <span className="history-time">{step}</span>
                  <span className="history-target">{deployPlan.target}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {generatedFiles.length > 0 ? (
          <div className="deploy-history">
            <h3>交付清单</h3>
            <div className="history-list">
              {generatedFiles.slice(0, 8).map((file) => (
                <div key={file.path} className="history-item">
                  <span className="history-status success">{file.category}</span>
                  <span className="history-version">{renderGeneratedFileLabel(file)}</span>
                  <span className="history-time">{file.summary}</span>
                  <span className="history-target">{file.language}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!currentProject) {
    return (
      <>
        <ProjectSetup
          projects={projects}
          activeProjectId={currentProjectId}
          projectStorageSettings={projectStorageSettings}
          projectStorageDraftOverride={projectStorageDraftOverride}
          projectVaultDraftOverride={projectVaultDraftOverride}
          projectStorageState={projectStorageState}
          projectStorageMessage={projectStorageMessage}
          onCreateProject={handleCreateProject}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onSaveProjectStoragePath={handleSaveProjectStoragePath}
          onPickProjectStoragePath={handlePickProjectStoragePath}
          onPickProjectVaultPath={canUseProjectFilesystem ? handlePickProjectVaultPath : undefined}
          onResetProjectStoragePath={handleResetProjectStoragePath}
        />
        <UiFeedbackMode />
      </>
    );
  }

  const roleContent =
    currentRole === 'product' || currentRole === 'knowledge'
      ? renderProductView('knowledge')
      : currentRole === 'page'
        ? renderProductView('page')
      : currentRole === 'agent'
        ? renderAgentView()
      : currentRole === 'design'
        ? <LazyDesignWorkbenchView key={currentProject?.id ?? 'design-workbench'} {...designWorkbenchViewProps} />
        : currentRole === 'develop'
          ? renderDevelopView()
          : currentRole === 'test'
            ? renderTestView()
            : renderOperationsView();

  const appMainContent = isProjectManagerOpen ? (
    <ProjectSetup
      projects={projects}
      activeProjectId={currentProjectId}
      currentProjectName={currentProject?.name ?? null}
      projectStorageSettings={projectStorageSettings}
      projectStorageDraftOverride={projectStorageDraftOverride}
      projectVaultDraftOverride={projectVaultDraftOverride}
      projectStorageState={projectStorageState}
      projectStorageMessage={projectStorageMessage}
      onCreateProject={handleCreateProject}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onSaveProjectStoragePath={handleSaveProjectStoragePath}
      onPickProjectStoragePath={handlePickProjectStoragePath}
      onPickProjectVaultPath={canUseProjectFilesystem ? handlePickProjectVaultPath : undefined}
      onResetProjectStoragePath={handleResetProjectStoragePath}
    />
  ) : roleContent;
  const appDesktopContent = appMainContent;
  if (isDesktopWorkbenchMode) {
    return (
      <div className="app app-shell-desktop desktop-active desktop-shell-codex" data-role={currentRole}>
        <div className="desktop-shell-frame">
          <MacPanel as="aside" className="desktop-primary-rail mac-sidebar-panel">
            <MacButton
              className="desktop-brand-chip"
              variant="ghost"
              size="sm"
              onClick={() => setCurrentRole('knowledge')}
              aria-label="返回知识库"
              title="返回知识库"
            >
              <img src="/branding/goodnight-icon.svg" alt="GoodNight" />
            </MacButton>

            <nav className="desktop-primary-nav" aria-label="工作区切换">
              {DESKTOP_PRIMARY_ROLES.flatMap((roleId) => {
                const role = DESKTOP_WORKBENCH_ROLES.find((item) => item.id === roleId);
                return role ? [
                <MacIconButton
                  key={role.id}
                  className={`desktop-rail-icon-btn ${currentRole === role.id ? 'active' : ''}`}
                  onClick={() => setCurrentRole(role.id)}
                  aria-label={role.label}
                  title={role.label}
                >
                  <WorkbenchIcon name={ROLE_TAB_ICONS[role.id]} />
                </MacIconButton>
                ] : [];
              })}
            </nav>

            <div className="desktop-primary-foot">
              <MacIconButton
                className="desktop-rail-icon-btn"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent(AI_CHAT_SETTINGS_EVENT, {
                      detail: { tab: 'skills' },
                    }),
                  );
                }}
                aria-label="设置"
                title="设置"
              >
                <WorkbenchIcon name="settings" />
              </MacIconButton>
              <MacIconButton
                className="desktop-rail-icon-btn"
                onClick={toggleThemeMode}
                aria-label={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                title={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              >
                <WorkbenchIcon name={themeMode === 'dark' ? 'sun' : 'moon'} />
              </MacIconButton>
              <MacIconButton
                className="desktop-rail-icon-btn"
                onClick={() => setIsProjectManagerOpen(true)}
                aria-label="项目列表"
                title="项目列表"
              >
                <WorkbenchIcon name="folder" />
              </MacIconButton>
            </div>
          </MacPanel>

          <section className="desktop-workbench-column">
            <MacPanel
              as="header"
              className="desktop-workbench-topbar mac-toolbar mac-panel desktop-workbench-menubar"
            >
              <div className="desktop-workbench-leading">
                <nav className="app-menu-bar standard desktop-titlebar-menu" aria-label="应用菜单" data-app-menu-root="desktop">
                  {DESKTOP_APP_MENUS.map((menu) => {
                    const isOpen = openDesktopMenuId === menu.id;

                    return (
                      <div key={menu.id} className={`app-menu-group ${isOpen ? 'open' : ''}`}>
                        <button
                          className="app-menu-trigger"
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={isOpen}
                          onClick={() => setOpenDesktopMenuId((current) => (current === menu.id ? null : menu.id))}
                          onMouseEnter={() => {
                            setOpenDesktopMenuId((current) => (current ? menu.id : current));
                          }}
                        >
                          {menu.label}
                        </button>
                        {isOpen ? (
                          <div className="app-menu-panel" role="menu">
                            {menu.items.map((item) => (
                              <button
                                key={item.label}
                                className="app-menu-item"
                                type="button"
                                role="menuitem"
                                onClick={() => void handleDesktopMenuAction(item.action)}
                              >
                                <span>{item.label}</span>
                                {item.hint ? <em>{item.hint}</em> : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </nav>
                <div
                  className="desktop-workbench-title-shell desktop-window-drag-region"
                  data-tauri-drag-region
                  onDoubleClick={(event) => void handleDesktopTopbarDoubleClick(event)}
                >
                  <span className="desktop-workbench-role-indicator" aria-hidden="true">
                    {activeDesktopRole.label}
                  </span>
                  <div className="desktop-workbench-title compact">
                    <h1>{currentProject.name}</h1>
                    <p>{activeDesktopRole.label} 工作台</p>
                  </div>
                </div>
              </div>

              <div className="desktop-workbench-tools">
                <div className="desktop-workbench-toolbar-group is-context">
                  {selectedFeature ? <span className="desktop-feature-pill">{selectedFeature.name}</span> : null}
                  <MacSelectField
                    className="desktop-project-switcher"
                    label="项目"
                    value={currentProject.id}
                    onChange={(event) => handleOpenProject(event.target.value)}
                  >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </MacSelectField>
                </div>
                <div className="desktop-workbench-toolbar-group is-actions">
                  <MacButton className="desktop-topbar-btn" onClick={() => setIsProjectManagerOpen(true)}>
                    项目
                  </MacButton>
                  {showWorkspaceSidebar ? (
                    <MacIconButton
                      className={`desktop-topbar-btn icon ${isDesktopAiCollapsed ? 'active' : ''}`}
                      onClick={() => setIsDesktopAiCollapsed((current) => !current)}
                      aria-label={isDesktopAiCollapsed ? '展开 AI 侧栏' : '收起 AI 侧栏'}
                      title={isDesktopAiCollapsed ? '展开 AI 侧栏' : '收起 AI 侧栏'}
                    >
                      <WorkbenchIcon name={isDesktopAiCollapsed ? 'panelRightOpen' : 'panelRightClose'} />
                    </MacIconButton>
                  ) : null}
                </div>
              </div>
              <div
                className="desktop-workbench-drag-spacer desktop-window-drag-region"
                aria-hidden="true"
                data-tauri-drag-region
                onDoubleClick={(event) => void handleDesktopTopbarDoubleClick(event)}
              />
              <div className="desktop-window-controls" aria-label="窗口控制">
                <button
                  type="button"
                  className="desktop-window-control"
                  aria-label="最小化"
                  title="最小化"
                  onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'minimize' })}
                >
                  <span className="desktop-window-control-glyph minimize" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="desktop-window-control"
                  aria-label="切换最大化"
                  title="切换最大化"
                  onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'toggleMaximize' })}
                >
                  <span className="desktop-window-control-glyph maximize" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="desktop-window-control close"
                  aria-label="关闭"
                  title="关闭"
                  onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'close' })}
                >
                  <span className="desktop-window-control-glyph close" aria-hidden="true" />
                </button>
              </div>
            </MacPanel>

            <div className={`desktop-workbench-panels ${isDesktopAiPaneResizing ? 'is-resizing-ai' : ''}`}>
              <div className="app-workbench-pane app-workbench-main-shell">
                <main className="app-main app-main-desktop">
                  <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>{appDesktopContent}</Suspense>
                </main>
              </div>
              {showWorkspaceSidebar && isDesktopAiPaneMounted ? (
                <>
                  {isDesktopAiPaneVisible ? (
                    <div
                      ref={desktopAiResizeHandleRef}
                      className="desktop-ai-resize-handle"
                      role="separator"
                      aria-label="调整 AI 栏宽度"
                      aria-orientation="vertical"
                      aria-valuemin={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
                      aria-valuemax={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
                      aria-valuenow={desktopAiPaneWidth}
                      tabIndex={0}
                      onPointerDown={handleDesktopAiResizePointerDown}
                      onKeyDown={handleDesktopAiResizeKeyDown}
                    />
                  ) : null}
                  <div
                    ref={desktopAiPaneElementRef}
                    className={`app-workbench-pane app-workbench-ai-shell desktop-ai-shell ${isDesktopAiPaneVisible ? '' : 'is-hidden'}`}
                    style={{
                      flex: `0 0 ${desktopAiPaneWidth}px`,
                      width: desktopAiPaneWidth,
                      minWidth: DESKTOP_AI_PANE_WIDTH_BOUNDS.min,
                      maxWidth: DESKTOP_AI_PANE_WIDTH_BOUNDS.max,
                    }}
                  >
                    <aside className="app-ai-activity-pane">
                      <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>
                        <LazyAIWorkspace collapsed={isDesktopAiCollapsed} onCollapsedChange={setIsDesktopAiCollapsed} />
                      </Suspense>
                    </aside>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
        <UiFeedbackMode />
      </div>
    );
  }

  return (
    <div className={`app app-shell-desktop ${isDesktopWorkbenchMode ? 'desktop-active' : ''}`} data-role={currentRole}>
      <header className="app-header">
        <div className="header-left app-window-drag-region" data-tauri-drag-region>
          <div className="app-brand">
            <img className="app-brand-logo" src="/branding/goodnight-logo-horizontal.svg" alt="GoodNight" />
          </div>
          <div className="header-project">
            <h1 className="app-title">{currentProject.name}</h1>
            <span className="app-subtitle">
              {currentProject.description || currentProject.appType}
            </span>
          </div>
        </div>

        <div className="header-right">
          <MacSelectField
            className="project-switcher"
            label="项目"
            value={currentProject.id}
            onChange={(event) => handleOpenProject(event.target.value)}
          >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </MacSelectField>

          <MacButton className="reset-project-btn" onClick={() => setIsProjectManagerOpen(true)}>
            查看项目列表
          </MacButton>

          <label className="header-search mac-field">
            <span className="header-search-icon">
              <WorkbenchIcon name="search" />
            </span>
            <MacInput placeholder="搜索项目..." type="text" />
          </label>

          <MacIconButton
            className="theme-mode-btn"
            onClick={toggleThemeMode}
            aria-label={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            title={themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            <WorkbenchIcon name={themeMode === 'dark' ? 'sun' : 'moon'} />
          </MacIconButton>

          {selectedFeature ? <span className="current-feature">当前功能：{selectedFeature.name}</span> : null}

          <MacButton className="reset-project-btn" variant="primary" onClick={handleResetProject}>
            新建项目
          </MacButton>
          <div className="desktop-window-controls app-header-window-controls" aria-label="窗口控制">
            <button
              type="button"
              className="desktop-window-control"
              aria-label="最小化"
              title="最小化"
              onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'minimize' })}
            >
              <span className="desktop-window-control-glyph minimize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-window-control"
              aria-label="切换最大化"
              title="切换最大化"
              onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'toggleMaximize' })}
            >
              <span className="desktop-window-control-glyph maximize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-window-control close"
              aria-label="关闭"
              title="关闭"
              onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'close' })}
            >
              <span className="desktop-window-control-glyph close" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="app-workbench-row">
        {isDesktopWorkbenchMode ? (
          <div className={`app-workbench-desktop-layout ${isDesktopAiPaneResizing ? 'is-resizing-ai' : ''}`}>
            <div className="app-workbench-pane app-workbench-main-shell">
              <main className="app-main app-main-desktop">
                <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>{appDesktopContent}</Suspense>
              </main>
            </div>
            {showWorkspaceSidebar ? (
              <>
                <div
                  className="desktop-ai-resize-handle"
                  role="separator"
                  aria-label="调整 AI 栏宽度"
                  aria-orientation="vertical"
                  aria-valuemin={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
                  aria-valuemax={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
                  aria-valuenow={desktopAiPaneWidth}
                  tabIndex={0}
                  onPointerDown={handleDesktopAiResizePointerDown}
                  onKeyDown={handleDesktopAiResizeKeyDown}
                />
                <div
                  className="app-workbench-pane app-workbench-ai-shell"
                  style={{
                    flex: `0 0 ${desktopAiPaneWidth}px`,
                    width: desktopAiPaneWidth,
                    minWidth: DESKTOP_AI_PANE_WIDTH_BOUNDS.min,
                    maxWidth: DESKTOP_AI_PANE_WIDTH_BOUNDS.max,
                  }}
                >
                  <aside className="app-ai-activity-pane">
                    <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>
                      <LazyAIWorkspace />
                    </Suspense>
                  </aside>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <main className="app-main app-main-desktop">
              <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>{appMainContent}</Suspense>
            </main>
            {showWorkspaceSidebar ? (
              <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>
                <LazyAIWorkspace />
              </Suspense>
            ) : null}
          </>
        )}
      </div>
      <UiFeedbackMode />
    </div>
  );
};

export default App;
