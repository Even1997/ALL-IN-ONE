// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { useShallow } from 'zustand/react/shallow';
import { ProjectSetup } from './components/project/ProjectSetup';
import { OperationsWorkbench, TestWorkbench } from './components/workspace';
import { WorkbenchIcon } from './components/ui/WorkbenchIcon';
import {
  DesktopWorkbenchFrame,
  DesktopWorkbenchRail,
  DesktopWorkbenchTopbar,
  EmptyStateView,
  InspectorPane,
  MacButton,
  MacIconButton,
  MacSelectField,
  NoteSurface,
  StateCard,
  StatusBanner,
} from './components/ui';
import { UiFeedbackMode } from './components/ui/UiFeedbackMode';
import { usePreviewStore } from './store/previewStore';
import { useFeatureTreeStore } from './store/featureTreeStore';
import { ensureDesktopRuntimeSidecar } from './modules/runtime-sidecar/desktopRuntimeSidecar';
import { getAgentShellSettings } from './modules/ai/gn-agent/gnAgentShellClient';
import { useGNAgentShellStore } from './modules/ai/gn-agent/gnAgentShellStore';
import {
  DESKTOP_AI_PANE_WIDTH_BOUNDS,
  useAppearanceSettingsStore,
} from './modules/settings/appearanceSettingsStore';
import { useGeneralSettingsStore, type StartupPage } from './modules/settings/generalSettingsStore';
import { useProjectStore } from './store/projectStore';
import {
  DESKTOP_PRIMARY_ROLES,
  DESKTOP_WORKBENCH_ROLES,
  getDesktopWorkbenchRole,
  ROLE_TAB_ICONS,
  type RoleView,
} from './appNavigation';
import { AI_CHAT_SETTINGS_EVENT } from './modules/ai/chat/chatCommands';
import { aiService } from './modules/ai/core/AIService';
import { resolveSettingsTabId, type SettingsTabId } from './components/workspace/globalSettingsPageShared';
import type { ProjectWorkspaceSnapshot } from './store/projectStore';
import type {
  FeatureNode,
  PageStructureNode,
  ProjectConfig,
} from './types';
import {
  clampDesktopAiPaneWidth,
  getDesktopAiPaneWidthFromPointer,
  isDesktopTopbarInteractiveTarget,
} from './features/desktopShell/desktopShell';
import { getCanvasPreset } from './utils/wireframe';
import {
  getProjectDir,
  ensureProjectVaultDirectory,
  ensureProjectFilesystemStructure,
  getProjectStorageSettings,
  PROJECT_STORAGE_SETTINGS_CHANGED_EVENT,
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
import './styles/workbench/tokens.css';
import './styles/workbench/shell.css';
import './styles/workbench/primitives.css';
import './styles/workbench/states.css';
import './styles/workbench/motion.css';
import './App.css';
import './styles/workbench/legacy-bridge.css';

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

const LazyGlobalSettingsPage = lazy(async () => {
  const module = await import('./components/workspace/GlobalSettingsPage');
  return { default: module.GlobalSettingsPage };
});

const WORKBENCH_LAZY_FALLBACK = <div className="app-surface-loading">正在载入工作台…</div>;

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
    label: 'File',
    items: [
      { label: 'New Project', hint: 'Ctrl+N', action: { kind: 'native', id: 'file.new_project' } },
      { label: 'Project List', hint: 'Ctrl+O', action: { kind: 'native', id: 'file.project_manager' } },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Cut', hint: 'Ctrl+X', action: { kind: 'edit', command: 'cut' } },
      { label: 'Copy', hint: 'Ctrl+C', action: { kind: 'edit', command: 'copy' } },
      { label: 'Paste', hint: 'Ctrl+V', action: { kind: 'edit', command: 'paste' } },
      { label: 'Select all', hint: 'Ctrl+A', action: { kind: 'edit', command: 'selectAll' } },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Notes', action: { kind: 'native', id: 'view.knowledge' } },
      { label: 'Sketch', action: { kind: 'native', id: 'view.page' } },
      { label: 'Design', action: { kind: 'native', id: 'view.design' } },
      { label: 'Agent', action: { kind: 'native', id: 'view.agent' } },
      { label: 'Test', action: { kind: 'native', id: 'view.test' } },
      { label: 'Ops', action: { kind: 'native', id: 'view.operations' } },
      { label: 'Toggle Theme', action: { kind: 'native', id: 'view.toggle_theme' } },
    ],
  },
  {
    id: 'window',
    label: 'Window',
    items: [
      { label: 'Minimize', action: { kind: 'window', command: 'minimize' } },
      { label: 'Toggle Maximize', action: { kind: 'window', command: 'toggleMaximize' } },
      { label: 'Close Window', action: { kind: 'window', command: 'close' } },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'About GoodNight', action: { kind: 'native', id: 'help.about' } },
      { label: 'Layout Guide', action: { kind: 'native', id: 'help.layout_overview' } },
      { label: 'Notes Guide', action: { kind: 'native', id: 'help.knowledge_overview' } },
      { label: 'Sketch Guide', action: { kind: 'native', id: 'help.page_overview' } },
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

const DESKTOP_AI_PANE_TRANSITION_MS = 240;
const DESIGN_BOARD_STORAGE_PREFIX = 'goodnight-design-board';
const PROJECT_INDEX_STORAGE_KEY = 'goodnight-project-index';
const PROJECT_SNAPSHOT_STORAGE_PREFIX = 'goodnight-project-snapshot';
const LAST_DESKTOP_ROLE_STORAGE_KEY = 'goodnight-desktop.lastRole';

const ROLE_STARTUP_PAGES = new Set<RoleView>([
  'agent',
  'knowledge',
  'page',
  'design',
  'test',
  'operations',
]);

const normalizeLegacyRoleView = (role: RoleView | null): RoleView | null =>
  role === 'develop' ? 'agent' : role;

const isRoleView = (value: string | null): value is RoleView =>
  value === 'agent' ||
  value === 'knowledge' ||
  value === 'page' ||
  value === 'design' ||
  value === 'develop' ||
  value === 'test' ||
  value === 'operations' ||
  value === 'product';

const readStoredDesktopRole = (): RoleView | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_DESKTOP_ROLE_STORAGE_KEY);
    return isRoleView(raw) ? normalizeLegacyRoleView(raw) : null;
  } catch {
    return null;
  }
};

const resolveStartupRole = (startupPage: StartupPage): RoleView => {
  if (startupPage === 'last-opened') {
    return readStoredDesktopRole() || 'agent';
  }

  const nextRole = ROLE_STARTUP_PAGES.has(startupPage as RoleView) ? (startupPage as RoleView) : 'agent';
  return normalizeLegacyRoleView(nextRole) || 'agent';
};

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const getDesignBoardStorageKey = (projectId: string) => `${DESIGN_BOARD_STORAGE_PREFIX}:${projectId}`;

const App: React.FC = () => {
  const hydrateProviderSettings = useGNAgentShellStore((state) => state.hydrateProviderSettings);
  const {
    themeMode,
    appStyle,
    desktopAiPaneWidth,
    desktopAiPaneCollapsedByDefault,
    setThemeMode,
    setDesktopAiPaneWidth,
  } = useAppearanceSettingsStore(useShallow((state) => ({
    themeMode: state.themeMode,
    appStyle: state.appStyle,
    desktopAiPaneWidth: state.desktopAiPaneWidth,
    desktopAiPaneCollapsedByDefault: state.desktopAiPaneCollapsedByDefault,
    setThemeMode: state.setThemeMode,
    setDesktopAiPaneWidth: state.setDesktopAiPaneWidth,
  })));
  const {
    startupPage,
    restoreLastSessionOnLaunch,
    openRecentWorkspaceOnLaunch,
  } = useGeneralSettingsStore(useShallow((state) => ({
    startupPage: state.startupPage,
    restoreLastSessionOnLaunch: state.restoreLastSessionOnLaunch,
    openRecentWorkspaceOnLaunch: state.openRecentWorkspaceOnLaunch,
  })));
  const [currentRole, setCurrentRole] = useState<RoleView>(() => resolveStartupRole(useGeneralSettingsStore.getState().startupPage));
  const isDesignWorkbenchActive = currentRole === 'design';
  const [isDesktopAiCollapsed, setIsDesktopAiCollapsed] = useState(() =>
    useAppearanceSettingsStore.getState().desktopAiPaneCollapsedByDefault,
  );
  const [isDesktopAiPaneMounted, setIsDesktopAiPaneMounted] = useState(true);
  const [isDesktopAiPaneVisible, setIsDesktopAiPaneVisible] = useState(true);
  const [isDesktopAiPaneResizing, setIsDesktopAiPaneResizing] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>(() => readProjectIndex());
  const [currentProjectDir, setCurrentProjectDir] = useState<string | null>(null);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(() => useGeneralSettingsStore.getState().startupPage === 'project-picker');
  const [projectStorageSettings, setProjectStorageSettings] = useState<ProjectStorageSettings | null>(null);
  const [projectStorageDraftOverride, setProjectStorageDraftOverride] = useState<string | null>(null);
  const [projectVaultDraftOverride, setProjectVaultDraftOverride] = useState<string | null>(null);
  const [projectStorageState, setProjectStorageState] = useState<ProjectStorageState>('idle');
  const [projectStorageMessage, setProjectStorageMessage] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<FeatureNode | null>(null);
  const [pageWorkbenchTargetPageId, setPageWorkbenchTargetPageId] = useState<string | null>(null);
  const [openDesktopMenuId, setOpenDesktopMenuId] = useState<string | null>(null);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
  const [activeGlobalSettingsTab, setActiveGlobalSettingsTab] = useState<SettingsTabId>('ai');
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

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    let isMounted = true;

    void getAgentShellSettings()
      .then((settings) => {
        if (!isMounted) {
          return;
        }

        hydrateProviderSettings({
          providerMode: settings.mode,
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [hydrateProviderSettings]);

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
    () => getDesktopWorkbenchRole(currentRole) || DESKTOP_WORKBENCH_ROLES[0],
    [currentRole]
  );
  const isDesktopWorkbenchMode = Boolean(currentProject);
  const showWorkspaceSidebar = !isGlobalSettingsOpen && activeDesktopRole.showCompanionPane;

  useEffect(() => {
    const handleOpenGlobalSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail || {};
      setActiveGlobalSettingsTab(resolveSettingsTabId(detail.tab));
      setIsProjectManagerOpen(false);
      setIsGlobalSettingsOpen(true);
    };

    window.addEventListener(AI_CHAT_SETTINGS_EVENT, handleOpenGlobalSettings as EventListener);
    return () => {
      window.removeEventListener(AI_CHAT_SETTINGS_EVENT, handleOpenGlobalSettings as EventListener);
    };
  }, []);

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
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  }, [setThemeMode, themeMode]);

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
        setProjectStorageMessage('Project storage path could not be loaded.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isTauriRuntimeAvailable()) {
      return;
    }

    let isDisposed = false;

    const refreshProjectStorageContext = async () => {
      try {
        const nextSettings = await getProjectStorageSettings();
        if (isDisposed) {
          return;
        }

        setProjectStorageSettings(nextSettings);
        setProjectStorageState('idle');
        setProjectStorageMessage(null);
      } catch {
        if (!isDisposed) {
          setProjectStorageState('error');
          setProjectStorageMessage('Project storage path could not be loaded.');
        }
      }

      if (!currentProject) {
        return;
      }

      try {
        const projectDir = await getProjectDir(currentProject.id);
        if (!isDisposed) {
          setCurrentProjectDir(projectDir);
        }
      } catch {
        if (!isDisposed) {
          setCurrentProjectDir(null);
        }
      }
    };

    const handleProjectStorageSettingsChanged = () => {
      void refreshProjectStorageContext();
    };

    window.addEventListener(
      PROJECT_STORAGE_SETTINGS_CHANGED_EVENT,
      handleProjectStorageSettingsChanged as EventListener,
    );

    return () => {
      isDisposed = true;
      window.removeEventListener(
        PROJECT_STORAGE_SETTINGS_CHANGED_EVENT,
        handleProjectStorageSettingsChanged as EventListener,
      );
    };
  }, [currentProject]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.style = appStyle;
  }, [appStyle]);

  useEffect(() => {
    setIsDesktopAiCollapsed(desktopAiPaneCollapsedByDefault);
  }, [desktopAiPaneCollapsedByDefault]);

  useEffect(() => {
    if (typeof window === 'undefined' || isGlobalSettingsOpen || isProjectManagerOpen) {
      return;
    }

    try {
      window.localStorage.setItem(LAST_DESKTOP_ROLE_STORAGE_KEY, normalizeLegacyRoleView(currentRole) || 'agent');
    } catch {
      // Ignore persistence failures for non-critical role memory.
    }
  }, [currentRole, isGlobalSettingsOpen, isProjectManagerOpen]);

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

    aiService.setConfig({ projectRoot: runtimeProjectRoot });
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
      setProjectStorageMessage('Project storage path updated.');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : 'Project storage path could not be saved.');
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
      setProjectStorageMessage('Directory selected. Save the path to apply it.');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : 'Directory selection failed.');
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
      setProjectStorageMessage(error instanceof Error ? error.message : 'Knowledge directory selection failed.');
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
      setProjectStorageMessage('Default project path restored.');
    } catch (error) {
      setProjectStorageState('error');
      setProjectStorageMessage(error instanceof Error ? error.message : 'Could not reset the default project path.');
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

  const handleOpenProject = useCallback(async (
    projectId: string,
    options?: { restoreSnapshot?: boolean; preferredRole?: RoleView | null },
  ) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    if (currentProject?.id && currentProject.id !== projectId) {
      persistActiveProjectSnapshot();
    }

    switchProject(targetProject);
    const shouldRestoreSnapshot = options?.restoreSnapshot !== false;
    const snapshot = shouldRestoreSnapshot
      ? ((await loadProjectSnapshotFromDisk(projectId)) || readProjectSnapshot(projectId))
      : null;
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
    setCurrentRole(options?.preferredRole || 'agent');
    setIsProjectManagerOpen(false);
    void ensureProjectFilesystemStructure(targetProject.id).catch(() => undefined);
    if (targetProject.vaultPath) {
      void ensureProjectVaultDirectory(targetProject).catch(() => undefined);
    }
  }, [clearCanvas, clearTree, currentProject?.id, loadProjectWorkspace, persistActiveProjectSnapshot, projects, setTree, switchProject]);

  useEffect(() => {
    if (hasRestoredPersistedProjectRef.current) {
      return;
    }

    if (startupPage === 'project-picker') {
      hasRestoredPersistedProjectRef.current = true;
      setIsProjectManagerOpen(true);
      return;
    }

    if (!currentProjectId) {
      hasRestoredPersistedProjectRef.current = true;
      setIsProjectManagerOpen(true);
      return;
    }

    if (!openRecentWorkspaceOnLaunch) {
      hasRestoredPersistedProjectRef.current = true;
      return;
    }

    const persistedProject = projects.find((project) => project.id === currentProjectId) || currentProject;
    if (!persistedProject) {
      hasRestoredPersistedProjectRef.current = true;
      setIsProjectManagerOpen(true);
      return;
    }

    hasRestoredPersistedProjectRef.current = true;
    void handleOpenProject(persistedProject.id, {
      restoreSnapshot: restoreLastSessionOnLaunch,
      preferredRole: resolveStartupRole(startupPage),
    });
  }, [
    currentProject,
    currentProjectId,
    handleOpenProject,
    openRecentWorkspaceOnLaunch,
    projects,
    restoreLastSessionOnLaunch,
    startupPage,
  ]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const targetProject = projects.find((item) => item.id === projectId);
    if (!targetProject) {
      return;
    }

    const confirmed = isTauriRuntimeAvailable()
      ? await confirm(`Delete project "${targetProject.name}"?`, {
          kind: 'warning',
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
        })
      : window.confirm(`Delete project "${targetProject.name}"?`);

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
        setCurrentRole('agent');
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
        window.alert('The current layout uses a desktop-style menu bar: workspace navigation on the left, project actions on the top, and content arranged like a native window.');
        break;
      case 'help.knowledge_overview':
        window.alert('Notes stores project notes and references, and AI answers against the current project context.');
        break;
      case 'help.page_overview':
        window.alert('Sketch is used to manage page structure, sketches, and canvas modules.');
        break;
      case 'help.about':
        window.alert('GoodNight - visual software development platform');
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
    <div className="platform-review-workbench platform-review-workbench-develop">
      <aside className="platform-review-sidebar">
        {[
          { id: 'files', label: '文件', icon: 'files' as const, active: true },
          { id: 'tasks', label: '任务', icon: 'code' as const, active: false },
          { id: 'terminal', label: '终端', icon: 'terminal' as const, active: false },
        ].map((section) => (
          <button
            key={section.id}
            type="button"
            className={`platform-review-nav-item${section.active ? ' active' : ''}`}
          >
            <WorkbenchIcon name={section.icon} />
            <span>{section.label}</span>
          </button>
        ))}
      </aside>

      <div className="platform-review-stage">
        <div className="platform-review-summary">
          <StateCard title="生成文件" description={`${generatedFiles.length} 个`} icon="files" tone="info" />
          <StateCard
            title="前端任务"
            description={`${devTasks.filter((task) => task.owner === 'frontend').length} 个`}
            icon="design"
            tone="warning"
          />
          <StateCard
            title="后端任务"
            description={`${devTasks.filter((task) => task.owner === 'backend').length} 个`}
            icon="server"
            tone="success"
          />
        </div>

        <NoteSurface
          eyebrow="Develop Workspace"
          title="开发工作台"
          subtitle="把生成文件、实施任务和推荐命令统一收敛到桌面工作台语义中，避免继续停留在临时工具卡片样式。"
          actions={(
            <MacButton type="button" variant="primary" onClick={handleGenerateDelivery}>
              生成交付摘要
            </MacButton>
          )}
        >
          <div className="platform-review-list platform-review-list-compact">
            {devTasks.length > 0 ? (
              devTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="platform-review-row">
                  <span
                    className={`platform-review-dot is-${
                      task.owner === 'frontend' ? 'warning' : task.owner === 'backend' ? 'success' : 'info'
                    }`}
                  />
                  <div className="platform-review-copy">
                    <strong>{task.title}</strong>
                    <span>
                      {task.owner} / {task.relatedFilePaths.length} files
                    </span>
                  </div>
                  <span className="platform-review-badge">{task.relatedFilePaths.length} refs</span>
                </div>
              ))
            ) : (
              <EmptyStateView
                icon="code"
                title="还没有开发任务"
                description="生成交付摘要后，这里会先展示统一格式的实施任务和关联文件。"
              />
            )}
          </div>

          {recommendedCommands.length > 0 ? (
            <div className="platform-review-command-list">
              {recommendedCommands.slice(0, 4).map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          ) : (
            <StatusBanner
              tone="info"
              icon="monitor"
              title="命令建议会出现在这里"
              message="当生成文件和任务上下文更完整时，开发面板会同步给出推荐命令。"
            />
          )}
        </NoteSurface>

        <div className="platform-review-workspace-host">
          <LazyWorkspace
            files={generatedFiles}
            tasks={devTasks}
            recommendedCommands={recommendedCommands}
            projectRoot={currentProjectDir || undefined}
          />
        </div>
      </div>
    </div>
  );

  const renderTestView = () => (
    <TestWorkbench
      requirementCount={requirementDocs.length}
      featureCount={graph.nodes.filter((node) => node.type === 'feature').length}
      caseCount={testPlan?.coverage.caseCount || 0}
      testCases={testCases}
      onGeneratePlan={handleGenerateDelivery}
    />
  );

  const renderOperationsView = () => (
    <OperationsWorkbench
      projectName={currentProject?.name || 'Current project'}
      memoryCount={Object.keys(memory?.designSystem || {}).length + Object.keys(memory?.codeStructure || {}).length}
      deployTarget={deployPlan?.target || 'Workspace'}
      deploySteps={deploySteps}
      generatedFiles={generatedFiles}
      onGenerateDeployScript={handleGenerateDelivery}
    />
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

  const appMainContent = isGlobalSettingsOpen ? (
    <LazyGlobalSettingsPage
      activeSettingsTab={activeGlobalSettingsTab}
      onSelectTab={setActiveGlobalSettingsTab}
      onExit={() => setIsGlobalSettingsOpen(false)}
    />
  ) : isProjectManagerOpen ? (
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
  const desktopMenuBar = (
    <nav className="app-menu-bar standard desktop-titlebar-menu" aria-label="Application menu" data-app-menu-root="desktop">
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
  );
  const desktopWindowControls = (
    <div className="desktop-window-controls" aria-label="Window controls">
      <button
        type="button"
        className="desktop-window-control"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'minimize' })}
      >
        <span className="desktop-window-control-glyph minimize" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="desktop-window-control"
        aria-label="Toggle maximize"
        title="Toggle maximize"
        onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'toggleMaximize' })}
      >
        <span className="desktop-window-control-glyph maximize" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="desktop-window-control close"
        aria-label="Close"
        title="Close"
        onClick={() => void handleDesktopMenuAction({ kind: 'window', command: 'close' })}
      >
        <span className="desktop-window-control-glyph close" aria-hidden="true" />
      </button>
    </div>
  );
  const desktopRail = (
    <DesktopWorkbenchRail
      navigation={DESKTOP_PRIMARY_ROLES.flatMap((roleId) => {
        const role = getDesktopWorkbenchRole(roleId);
        return role
          ? [
              <MacIconButton
                key={role.id}
                className={`desktop-rail-icon-btn ${currentRole === role.id ? 'active' : ''}`}
                onClick={() => {
                  setIsGlobalSettingsOpen(false);
                  setCurrentRole(role.id);
                }}
                aria-label={role.label}
                title={role.label}
              >
                <WorkbenchIcon name={ROLE_TAB_ICONS[role.id]} />
              </MacIconButton>,
            ]
          : [];
      })}
      footer={(
        <>
          <MacIconButton
            className={`desktop-rail-icon-btn ${isGlobalSettingsOpen ? 'active' : ''}`}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(AI_CHAT_SETTINGS_EVENT, {
                  detail: { tab: 'ai' },
                }),
              );
            }}
            aria-label="AI settings"
            title="AI settings"
          >
            <WorkbenchIcon name="settings" />
          </MacIconButton>
          <MacIconButton
            className="desktop-rail-icon-btn"
            onClick={toggleThemeMode}
            aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <WorkbenchIcon name={themeMode === 'dark' ? 'sun' : 'moon'} />
          </MacIconButton>
          <MacIconButton
            className="desktop-rail-icon-btn"
            onClick={() => {
              setIsGlobalSettingsOpen(false);
              setIsProjectManagerOpen(true);
            }}
            aria-label="Project list"
            title="Project list"
          >
            <WorkbenchIcon name="folder" />
          </MacIconButton>
        </>
      )}
    />
  );
  const desktopTopbar = (
    <DesktopWorkbenchTopbar
      menuBar={desktopMenuBar}
      roleLabel={isGlobalSettingsOpen ? 'Settings' : activeDesktopRole.label}
      projectName={currentProject.name}
      projectSubtitle={isGlobalSettingsOpen ? 'Global Preferences' : `${activeDesktopRole.label} Workspace`}
      context={isGlobalSettingsOpen ? <span className="desktop-feature-pill">Global settings</span> : (
        <>
          {selectedFeature ? <span className="desktop-feature-pill">{selectedFeature.name}</span> : null}
          <MacSelectField
            className="desktop-project-switcher"
            label="Project"
            value={currentProject.id}
            onChange={(event) => handleOpenProject(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </MacSelectField>
        </>
      )}
      actions={(
        <>
          {!isGlobalSettingsOpen ? (
            <MacButton className="desktop-topbar-btn" onClick={() => setIsProjectManagerOpen(true)}>
              Projects
            </MacButton>
          ) : null}
          {showWorkspaceSidebar ? (
            <MacIconButton
              className={`desktop-topbar-btn icon ${isDesktopAiCollapsed ? 'active' : ''}`}
              onClick={() => setIsDesktopAiCollapsed((current) => !current)}
              aria-label={isDesktopAiCollapsed ? 'Show AI pane' : 'Hide AI pane'}
              title={isDesktopAiCollapsed ? 'Show AI pane' : 'Hide AI pane'}
            >
              <WorkbenchIcon name={isDesktopAiCollapsed ? 'panelRightOpen' : 'panelRightClose'} />
            </MacIconButton>
          ) : null}
        </>
      )}
      windowControls={desktopWindowControls}
      onTitleDoubleClick={(event) => void handleDesktopTopbarDoubleClick(event)}
    />
  );
  const desktopInspector =
    !isGlobalSettingsOpen && showWorkspaceSidebar && isDesktopAiPaneMounted ? (
      <InspectorPane
        ref={desktopAiPaneElementRef}
        visible={isDesktopAiPaneVisible}
        width={desktopAiPaneWidth}
        minWidth={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
        maxWidth={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
      >
        <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>
          <LazyAIWorkspace collapsed={isDesktopAiCollapsed} onCollapsedChange={setIsDesktopAiCollapsed} />
        </Suspense>
      </InspectorPane>
    ) : null;
  const desktopResizeHandle =
    !isGlobalSettingsOpen && showWorkspaceSidebar && isDesktopAiPaneMounted && isDesktopAiPaneVisible ? (
      <div
        ref={desktopAiResizeHandleRef}
        className="desktop-ai-resize-handle"
        role="separator"
        aria-label="Resize AI pane"
        aria-orientation="vertical"
        aria-valuemin={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
        aria-valuemax={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
        aria-valuenow={desktopAiPaneWidth}
        tabIndex={0}
        onPointerDown={handleDesktopAiResizePointerDown}
        onKeyDown={handleDesktopAiResizeKeyDown}
      />
    ) : null;
  return (
    <div className="app app-shell-desktop desktop-active desktop-shell-codex" data-role={currentRole}>
      <DesktopWorkbenchFrame
        rail={desktopRail}
        topbar={desktopTopbar}
        main={(
          <main className="app-main app-main-desktop">
            <Suspense fallback={WORKBENCH_LAZY_FALLBACK}>{appDesktopContent}</Suspense>
          </main>
        )}
        resizeHandle={desktopResizeHandle}
        inspector={desktopInspector}
        isResizing={isDesktopAiPaneResizing}
      />
      <UiFeedbackMode />
    </div>
  );
};

export default App;
