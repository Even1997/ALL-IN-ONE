import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  type KnowledgeDiskItem,
  type KnowledgeGroupId,
} from '../../modules/knowledge/knowledgeTree';
import { useAIContextStore } from '../../modules/ai/store/aiContextStore';
import { useAIChatStore } from '../../modules/ai/store/aiChatStore';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { usePreviewStore } from '../../store/previewStore';
import { useProjectStore } from '../../store/projectStore';
import { AppType, FeatureNode, PageStructureNode, type RequirementDoc } from '../../types';
import { featureTreeToMarkdown } from '../../utils/featureTreeToMarkdown';
import { useShallow } from 'zustand/react/shallow';
import { useKnowledgeStore } from '../../features/knowledge/store/knowledgeStore';
import { useKnowledgeSessionArtifactsStore } from '../../features/knowledge/store/knowledgeSessionArtifactsStore';
import type { KnowledgeNote } from '../../features/knowledge/model/knowledge';
import { projectKnowledgeNotesToRequirementDocs } from '../../features/knowledge/adapters/knowledgeRequirementAdapter';
import { MacDialog } from '../ui/MacDialog';
import {
  createWireframeModule,
  formatCanvasPreset,
  getCanvasPreset,
  isMobileAppType,
  resolveCanvasPresetFromFrame,
} from '../../utils/wireframe';
import {
  deleteSketchPageFile,
  ensureProjectVaultDirectory,
  getProjectVaultRootDir,
  isTauriRuntimeAvailable,
  loadSketchPageArtifactsFromProjectDir,
  writeSketchPageFile,
} from '../../utils/projectPersistence';
import {
  getDirectoryPath,
  getRelativePathFromRoot,
  joinFileSystemPath,
  normalizeRelativeFileSystemPath,
} from '../../utils/fileSystemPaths.ts';
import {
  KNOWLEDGE_FILESYSTEM_CHANGED_EVENT,
  type KnowledgeFilesystemChangedDetail,
} from '../../features/knowledge/workspace/knowledgeFilesystemEvents';
import {
  extractKnowledgeNoteEditorBody,
  serializeKnowledgeNoteMarkdown,
} from '../../features/knowledge/workspace/knowledgeNoteMarkdown';

type SidebarTab = 'knowledge' | 'page';
export type WorkbenchLayoutFocus = 'canvas' | 'balanced' | 'sidebar';
export type WorkbenchLayoutDensity = 'comfortable' | 'compact';

type PendingDeleteRequest =
  | { type: 'knowledge-note'; id: string; title: string; sourceUrl: string | null }
  | { type: 'knowledge-tree-paths'; paths: string[]; title: string; containsFolders: boolean }
  | { type: 'page'; id: string; title: string }
  | { type: 'module'; id: string; title: string };

type KnowledgePathDialogState =
  | {
      mode: 'create-note' | 'create-file' | 'create-folder' | 'rename-path';
      targetDirectory: string | null;
      relativePath: string | null;
      isFolder: boolean;
      inputValue: string;
    }
  | null;

const EMPTY_SESSION_ARTIFACTS: ReturnType<
  typeof useKnowledgeSessionArtifactsStore.getState
>['artifactsBySession'][string] = [];

const LazyProductKnowledgeWorkspacePane = lazy(async () => {
  const module = await import('./ProductKnowledgeWorkspacePane');
  return { default: module.ProductKnowledgeWorkspacePane };
});

const LazyProductPageWorkspacePane = lazy(async () => {
  const module = await import('./ProductPageWorkspacePane');
  return { default: module.ProductPageWorkspacePane };
});

const PRODUCT_WORKBENCH_LAZY_FALLBACK = <div className="app-surface-loading">加载工作台中...</div>;

const normalizeRequirementFilename = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!normalized) {
    return '未命名需求.md';
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
};

const normalizeKnowledgeNoteTitle = (value: string) => {
  const normalized = value.trim();
  return normalized || '未命名笔记';
};

const normalizeKnowledgeTreeSegment = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/-+/g, '-');

const joinDiskPath = (basePath: string, fileName: string) => joinFileSystemPath(basePath, fileName);

const normalizeRelativePath = (value: string) => normalizeRelativeFileSystemPath(value);

const getKnowledgeGroupOverridesStorageKey = (projectId: string) =>
  `goodnight:knowledge-group-overrides:${projectId}`;

const readKnowledgeGroupOverrides = (projectId: string | null) => {
  if (!projectId || typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(getKnowledgeGroupOverridesStorageKey(projectId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, KnowledgeGroupId>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeKnowledgeGroupOverrides = (projectId: string | null, value: Record<string, KnowledgeGroupId>) => {
  if (!projectId || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getKnowledgeGroupOverridesStorageKey(projectId), JSON.stringify(value));
};

const shouldIgnoreKnowledgePath = (relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  return normalized === '.goodnight' || normalized.startsWith('.goodnight/') || normalized === 'project.json';
};

const listKnowledgeDiskItems = async (rootPath: string): Promise<KnowledgeDiskItem[]> => {
  const walk = async (absolutePath: string, relativeBase = ''): Promise<KnowledgeDiskItem[]> => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_ls', {
      params: {
        path: absolutePath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `读取目录失败：${absolutePath}`);
    }

    const items: KnowledgeDiskItem[] = [];
    const entries = result.content
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const isFolder = entry.endsWith('/');
      const name = isFolder ? entry.slice(0, -1) : entry;
      const nextRelativePath = normalizeRelativePath(relativeBase ? `${relativeBase}/${name}` : name);
      if (!nextRelativePath || shouldIgnoreKnowledgePath(nextRelativePath)) {
        continue;
      }

      const nextAbsolutePath = joinDiskPath(absolutePath, name);
      items.push({
        path: nextAbsolutePath,
        relativePath: nextRelativePath,
        type: isFolder ? 'folder' : 'file',
      });

      if (isFolder) {
        items.push(...await walk(nextAbsolutePath, nextRelativePath));
      }
    }

    return items;
  };

  return walk(rootPath);
};

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [
    ...(node.kind === 'page' ? [node] : []),
    ...collectDesignPages(node.children),
  ]);

const collectFeatureNodes = (nodes: FeatureNode[]): FeatureNode[] =>
  nodes.flatMap((node) => [node, ...collectFeatureNodes(node.children)]);

const filterPageTree = (nodes: PageStructureNode[], keyword: string): PageStructureNode[] => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterPageTree(node.children, normalizedKeyword);
    const matchesSelf = [node.name, node.description, node.metadata.route]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedKeyword));

    if (!matchesSelf && filteredChildren.length === 0) {
      return [];
    }

    return [{ ...node, children: filteredChildren }];
  });
};

const getRelativeDirectory = (value: string) => {
  const normalized = normalizeRelativePath(value);
  return normalized.includes('/') ? normalized.replace(/\/[^/]+$/, '') : '';
};

const areRequirementDocsEqual = (left: RequirementDoc[], right: RequirementDoc[]) =>
  left.length === right.length &&
  left.every((doc, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      doc.id === other.id &&
      doc.title === other.title &&
      doc.content === other.content &&
      doc.summary === other.summary &&
      doc.filePath === other.filePath &&
      doc.kind === other.kind &&
      doc.docType === other.docType &&
      doc.authorRole === other.authorRole &&
      doc.sourceType === other.sourceType &&
      doc.updatedAt === other.updatedAt &&
      doc.status === other.status &&
      (doc.tags || []).join('\u0000') === (other.tags || []).join('\u0000') &&
      (doc.relatedIds || []).join('\u0000') === (other.relatedIds || []).join('\u0000')
    );
  });

const getRelativePathWithinKnowledgeRoots = (
  filePath: string,
  projectRootDir: string | null,
  legacyVaultRoot: string | null
) =>
  normalizeRelativePath(
    (filePath && projectRootDir && getRelativePathFromRoot(filePath, projectRootDir)) ||
      (filePath && legacyVaultRoot && getRelativePathFromRoot(filePath, legacyVaultRoot)) ||
      ''
  );

const filterKnowledgeNotes = (notes: KnowledgeNote[], keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return notes;
  }

  return notes.filter((note) =>
    [note.title, note.bodyMarkdown, note.sourceUrl || '', ...(note.tags || [])]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedKeyword))
  );
};

interface ProductWorkbenchProps {
  onFeatureSelect?: (node: FeatureNode) => void;
  layoutFocus: WorkbenchLayoutFocus;
  layoutDensity: WorkbenchLayoutDensity;
  entryTab?: SidebarTab;
  preferredPageId?: string | null;
  onEntryTabChange?: (tab: SidebarTab) => void;
}

export const ProductWorkbench = ({
  onFeatureSelect,
  layoutFocus,
  layoutDensity,
  entryTab,
  preferredPageId,
  onEntryTabChange,
}: ProductWorkbenchProps) => {
  const [internalSidebarTab, setInternalSidebarTab] = useState<SidebarTab>('knowledge');
  const sidebarTab = entryTab || internalSidebarTab;
  const [selectedKnowledgeNoteId, setSelectedKnowledgeNoteId] = useState<string | null>(null);
  const [openKnowledgeTabIds, setOpenKnowledgeTabIds] = useState<string[]>([]);
  const [requirementDraftTitle, setRequirementDraftTitle] = useState('');
  const [requirementDraftContent, setRequirementDraftContent] = useState('');
  const [requirementSaveMessage, setRequirementSaveMessage] = useState<string | null>(null);
  const [projectRootDir, setProjectRootDir] = useState<string | null>(null);
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [manualPageId, setManualPageId] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeDiskItems, setKnowledgeDiskItems] = useState<KnowledgeDiskItem[]>([]);
  const [knowledgeGroupOverrides, setKnowledgeGroupOverrides] = useState<Record<string, KnowledgeGroupId>>({});
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<PendingDeleteRequest | null>(null);
  const [knowledgePathDialog, setKnowledgePathDialog] = useState<KnowledgePathDialogState>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [isFrameEditorOpen, setIsFrameEditorOpen] = useState(false);
  const [frameEditorDraft, setFrameEditorDraft] = useState('');
  const [isModulePanelOpen, setIsModulePanelOpen] = useState(false);
  const knowledgeRefreshRequestIdRef = useRef(0);
  const hydratedKnowledgeNoteSignatureRef = useRef('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedDraftRef = useRef('');
  const lastPersistedSketchSnapshotRef = useRef('');

  const {
    currentProject,
    featuresMarkdown,
    pageStructure,
    requirementDocs,
    wireframes,
    setFeaturesMarkdown,
    addRootPage,
    addSiblingPage,
    deletePageStructureNode,
    replaceRequirementDocs,
    replacePageStructure,
    replaceWireframes,
    updateWireframeFrame,
  } = useProjectStore(useShallow((state) => ({
    currentProject: state.currentProject,
    featuresMarkdown: state.featuresMarkdown,
    pageStructure: state.pageStructure,
    requirementDocs: state.requirementDocs,
    wireframes: state.wireframes,
    setFeaturesMarkdown: state.setFeaturesMarkdown,
    addRootPage: state.addRootPage,
    addSiblingPage: state.addSiblingPage,
    deletePageStructureNode: state.deletePageStructureNode,
    replaceRequirementDocs: state.replaceRequirementDocs,
    replacePageStructure: state.replacePageStructure,
    replaceWireframes: state.replaceWireframes,
    updateWireframeFrame: state.updateWireframeFrame,
  })));
  const vaultRootDir = useMemo(
    () => (currentProject?.vaultPath ? getProjectVaultRootDir(currentProject) : null),
    [currentProject]
  );

  const tree = useFeatureTreeStore((state) => state.tree);
  const selectFeature = useFeatureTreeStore((state) => state.selectFeature);
  const setSceneContext = useAIContextStore((state) => state.setSceneContext);
  const setCanvasSize = usePreviewStore((state) => state.setCanvasSize);
  const clearCanvas = usePreviewStore((state) => state.clearCanvas);
  const loadFromCode = usePreviewStore((state) => state.loadFromCode);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const deleteElement = usePreviewStore((state) => state.deleteElement);
  const serverNotes = useKnowledgeStore((state) => state.notes);
  const serverSearchResults = useKnowledgeStore((state) => state.searchResults);
  const serverSearchQuery = useKnowledgeStore((state) => state.searchQuery);
  const isKnowledgeSearching = useKnowledgeStore((state) => state.isSearching);
  const knowledgeSidecarError = useKnowledgeStore((state) => state.error);
  const searchServerNotes = useKnowledgeStore((state) => state.searchNotes);
  const loadServerNotes = useKnowledgeStore((state) => state.loadNotes);
  const createServerNote = useKnowledgeStore((state) => state.createProjectNote);
  const deleteServerNote = useKnowledgeStore((state) => state.deleteProjectNote);
  const updateServerNote = useKnowledgeStore((state) => state.updateProjectNote);
  const canUseProjectFilesystem = isTauriRuntimeAvailable();
  const activeChatSessionId = useAIChatStore((state) =>
    currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
  );
  const activeArtifactId = useKnowledgeSessionArtifactsStore((state) =>
    currentProject && activeChatSessionId
      ? state.activeArtifactIdBySession[`${currentProject.id}:${activeChatSessionId}`] || null
      : null
  );
  const activeSessionArtifacts = useKnowledgeSessionArtifactsStore((state) =>
    currentProject && activeChatSessionId
      ? state.artifactsBySession[`${currentProject.id}:${activeChatSessionId}`] || EMPTY_SESSION_ARTIFACTS
      : EMPTY_SESSION_ARTIFACTS
  );

  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const selectedPage = designPages.find((page) => page.id === manualPageId) || designPages[0] || null;
  const selectedPageWireframe = selectedPage ? wireframes[selectedPage.id] || null : null;
  const baseCanvasPreset = useMemo(() => getCanvasPreset(currentProject?.appType), [currentProject?.appType]);
  const selectedPageFrame = selectedPageWireframe?.frame || formatCanvasPreset(baseCanvasPreset);
  const canvasPreset = useMemo(
    () => resolveCanvasPresetFromFrame(selectedPageFrame, currentProject?.appType),
    [currentProject?.appType, selectedPageFrame]
  );
  const projectedRequirementDocs = useMemo(
    () => projectKnowledgeNotesToRequirementDocs(serverNotes),
    [serverNotes]
  );
  const filteredServerNotes = useMemo(() => {
    const normalizedSearch = knowledgeSearch.trim();
    return !normalizedSearch
      ? serverNotes
      : serverSearchQuery === normalizedSearch
        ? serverSearchResults
        : filterKnowledgeNotes(serverNotes, normalizedSearch);
  }, [knowledgeSearch, serverNotes, serverSearchQuery, serverSearchResults]);
  const filteredPageStructure = useMemo(() => filterPageTree(pageStructure, pageSearch), [pageSearch, pageStructure]);
  const filteredDesignPages = useMemo(() => collectDesignPages(filteredPageStructure), [filteredPageStructure]);
  const selectedServerNote = useMemo(
    () => serverNotes.find((note) => note.id === selectedKnowledgeNoteId) || null,
    [serverNotes, selectedKnowledgeNoteId]
  );
  const selectedKnowledgeMarkdownValue = selectedServerNote
    ? serializeKnowledgeNoteMarkdown(
        selectedServerNote.title,
        extractKnowledgeNoteEditorBody(selectedServerNote.title, selectedServerNote.bodyMarkdown)
      )
    : '';
  const currentKnowledgeMarkdownValue = selectedServerNote
    ? serializeKnowledgeNoteMarkdown(requirementDraftTitle, requirementDraftContent)
    : '';
  const hasRequirementChanges = selectedServerNote
    ? requirementDraftTitle !== selectedServerNote.title || currentKnowledgeMarkdownValue !== selectedKnowledgeMarkdownValue
    : false;
  const canPersistRequirementToDisk = Boolean(projectRootDir);
  const canSaveRequirement = Boolean(
    selectedServerNote &&
    !isSavingRequirement &&
    (hasRequirementChanges || !selectedServerNote.sourceUrl)
  );
  const effectiveAppType = useMemo<AppType | undefined>(() => {
    if (canvasPreset.frameType === 'mobile') {
      return currentProject?.appType === 'mini_program' ? 'mini_program' : 'mobile';
    }

    return currentProject?.appType === 'desktop' || currentProject?.appType === 'backend' || currentProject?.appType === 'api'
      ? 'web'
      : currentProject?.appType || 'web';
  }, [canvasPreset.frameType, currentProject?.appType]);
  const featureMap = useMemo(() => {
    const nodes = tree ? collectFeatureNodes(tree.children) : [];
    return new Map(nodes.map((node) => [node.id, node]));
  }, [tree]);
  const activeTemporaryArtifact = useMemo(() => {
    if (!activeArtifactId) {
      return null;
    }

    return (
      activeSessionArtifacts.find((artifact) => artifact.id === activeArtifactId && artifact.status === 'session') ||
      null
    );
  }, [activeArtifactId, activeSessionArtifacts]);
  const layoutStyle = useMemo<CSSProperties>(() => {
    const pageColumns =
      layoutFocus === 'canvas'
        ? 'minmax(0, 1.92fr)'
        : layoutFocus === 'sidebar'
          ? 'minmax(0, 1.34fr)'
          : 'minmax(0, 1.72fr)';

    return {
      ['--pm-page-columns' as string]: pageColumns,
      ['--pm-shell-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-gap' as string]: layoutDensity === 'compact' ? '8px' : '12px',
      ['--pm-card-padding' as string]: layoutDensity === 'compact' ? '12px' : '16px',
      ['--pm-canvas-height' as string]: layoutDensity === 'compact' ? 'clamp(540px, 70vh, 780px)' : 'clamp(600px, 76vh, 860px)',
    };
  }, [layoutDensity, layoutFocus]);

  const setSidebarTab = useCallback(
    (nextTab: SidebarTab) => {
      if (entryTab) {
        onEntryTabChange?.(nextTab);
        return;
      }

      setInternalSidebarTab(nextTab);
    },
    [entryTab, onEntryTabChange]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleFocusKnowledgePane = () => {
      setSidebarTab('knowledge');
    };

    window.addEventListener('goodnight:focus-knowledge-pane', handleFocusKnowledgePane);
    return () => {
      window.removeEventListener('goodnight:focus-knowledge-pane', handleFocusKnowledgePane);
    };
  }, [setSidebarTab]);

  useEffect(() => {
    if (!tree) {
      return;
    }

    const nextMarkdown = featureTreeToMarkdown(tree);
    if (nextMarkdown !== featuresMarkdown) {
      setFeaturesMarkdown(nextMarkdown);
    }
  }, [featuresMarkdown, setFeaturesMarkdown, tree]);

  useEffect(() => {
    setCanvasSize(canvasPreset.width, canvasPreset.height);
  }, [canvasPreset.height, canvasPreset.width, setCanvasSize]);

  useEffect(() => {
    setFrameEditorDraft(selectedPageFrame);
  }, [selectedPageFrame]);

  useEffect(() => {
    setIsFrameEditorOpen(false);
  }, [selectedPage?.id]);

  const handleApplyFrameValue = useCallback((nextFrame: string) => {
    if (!selectedPage) {
      return;
    }

    const normalizedFrame = nextFrame.trim();
    if (!normalizedFrame) {
      return;
    }

    updateWireframeFrame(selectedPage, nextFrame);
    setFrameEditorDraft(normalizedFrame);
    setIsFrameEditorOpen(false);
  }, [selectedPage, updateWireframeFrame]);

  const handleToggleFrameEditor = useCallback(() => {
    setIsFrameEditorOpen((current) => {
      if (current) {
        return false;
      }

      setFrameEditorDraft(selectedPageFrame);
      return true;
    });
  }, [selectedPageFrame]);

  useEffect(() => {
    setSelectedKnowledgeNoteId((current) =>
      current && serverNotes.some((note) => note.id === current) ? current : null
    );
  }, [serverNotes]);

  useEffect(() => {
    if (!selectedServerNote) {
      return;
    }

    setOpenKnowledgeTabIds((current) =>
      current.includes(selectedServerNote.id) ? current : [...current, selectedServerNote.id]
    );
  }, [selectedServerNote]);

  useEffect(() => {
    if (!currentProject || !canUseProjectFilesystem) {
      return;
    }

    void loadServerNotes(currentProject.id);
  }, [canUseProjectFilesystem, currentProject, loadServerNotes]);

  useEffect(() => {
    if (!currentProject || !canUseProjectFilesystem) {
      return;
    }

    const normalizedSearch = knowledgeSearch.trim();
    if (!normalizedSearch) {
      void searchServerNotes(currentProject.id, '');
      return;
    }

    const searchTimer = window.setTimeout(() => {
      void searchServerNotes(currentProject.id, normalizedSearch);
    }, 180);

    return () => {
      window.clearTimeout(searchTimer);
    };
  }, [canUseProjectFilesystem, currentProject, knowledgeSearch, searchServerNotes]);

  useEffect(() => {
    if (serverNotes.length === 0) {
      return;
    }

    if (areRequirementDocsEqual(requirementDocs, projectedRequirementDocs)) {
      return;
    }

    replaceRequirementDocs(projectedRequirementDocs);
  }, [projectedRequirementDocs, replaceRequirementDocs, requirementDocs, serverNotes.length]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setSceneContext(currentProject.id, {
      scene: sidebarTab === 'knowledge' ? 'vault' : 'page',
      selectedKnowledgeEntryId: selectedServerNote?.id || null,
      selectedPageId: selectedPage?.id || null,
      openedKnowledgeEntryIds: openKnowledgeTabIds,
    });
  }, [
    currentProject,
    openKnowledgeTabIds,
    selectedPage?.id,
    selectedServerNote?.id,
    setSceneContext,
    sidebarTab,
  ]);

  useEffect(() => {
    if (!selectedServerNote) {
      setRequirementDraftTitle('');
      setRequirementDraftContent('');
      hydratedKnowledgeNoteSignatureRef.current = '';
      return;
    }

    const nextHydratedSignature = `${selectedServerNote.id}:${selectedServerNote.title}:${selectedServerNote.bodyMarkdown}`;
    if (hydratedKnowledgeNoteSignatureRef.current === nextHydratedSignature) {
      return;
    }

    hydratedKnowledgeNoteSignatureRef.current = nextHydratedSignature;
    setRequirementDraftTitle(selectedServerNote.title);
    setRequirementDraftContent(extractKnowledgeNoteEditorBody(selectedServerNote.title, selectedServerNote.bodyMarkdown));
    setRequirementSaveMessage(null);
  }, [selectedServerNote]);

  useEffect(() => {
    if (!currentProject) {
      setProjectRootDir(null);
      return;
    }

    if (!canUseProjectFilesystem) {
      setProjectRootDir(null);
      setRequirementSaveMessage('当前运行在浏览器开发环境，知识笔记会保存到本地知识库；桌面版可同步 Markdown 镜像。');
      return;
    }

    setProjectRootDir(vaultRootDir);
  }, [canUseProjectFilesystem, currentProject, vaultRootDir]);

  useEffect(() => {
    setKnowledgeGroupOverrides(readKnowledgeGroupOverrides(currentProject?.id || null));
  }, [currentProject?.id]);

  useEffect(() => {
    writeKnowledgeGroupOverrides(currentProject?.id || null, knowledgeGroupOverrides);
  }, [currentProject?.id, knowledgeGroupOverrides]);

  const writeRequirementFile = useCallback(async (filePath: string, content: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_write', {
      params: {
        file_path: filePath,
        content,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `写入文件失败：${filePath}`);
    }
  }, []);

  const renameRequirementFile = useCallback(async (fromPath: string, toPath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_rename', {
      params: {
        from_path: fromPath,
        to_path: toPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `重命名文件失败：${fromPath} -> ${toPath}`);
    }
  }, []);

  const createKnowledgeDirectory = useCallback(async (directoryPath: string) => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_mkdir', {
      params: {
        file_path: directoryPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `创建文件夹失败：${directoryPath}`);
    }
  }, []);

  const removeKnowledgePath = useCallback(async (targetPath: string) => {
    const result = await invoke<{ success: boolean; error: string | null }>('tool_remove', {
      params: {
        file_path: targetPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || `删除路径失败：${targetPath}`);
    }
  }, []);

  const refreshKnowledgeFilesystem = useCallback(async () => {
    const requestId = ++knowledgeRefreshRequestIdRef.current;

    if (!canUseProjectFilesystem || !currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    await ensureProjectVaultDirectory(currentProject);
    const diskItems = await listKnowledgeDiskItems(projectRootDir);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }
    setKnowledgeDiskItems(diskItems);

    const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }

    if (requestId !== knowledgeRefreshRequestIdRef.current) {
      return;
    }

    replacePageStructure(sketchArtifacts.pageStructure, tree);
    replaceWireframes(sketchArtifacts.wireframes, tree);
  }, [canUseProjectFilesystem, currentProject, projectRootDir, replacePageStructure, replaceWireframes, tree]);

  const handleRefreshKnowledgeFilesystem = useCallback(() => {
    void refreshKnowledgeFilesystem();
  }, [refreshKnowledgeFilesystem]);

  const collectNotesForKnowledgePaths = useCallback((relativePaths: string[]) => {
    if (!projectRootDir) {
      return [];
    }

    const normalizedTargets = relativePaths.map((path) => normalizeRelativePath(path)).filter(Boolean);
    return serverNotes.filter((note) => {
      const noteRelativePath = normalizeRelativePath(
        getRelativePathFromRoot(note.sourceUrl || '', projectRootDir) || note.sourceUrl || ''
      );
      if (!noteRelativePath) {
        return false;
      }

      return normalizedTargets.some(
        (targetPath) => noteRelativePath === targetPath || noteRelativePath.startsWith(`${targetPath}/`)
      );
    });
  }, [projectRootDir, serverNotes]);

  const handleCreateKnowledgeNoteAtPath = useCallback(async (relativeDirectory: string | null) => {
    if (!currentProject || !projectRootDir) {
      return;
    }

    const normalizedName = normalizeRequirementFilename('未命名笔记');
    if (!normalizedName) {
      return;
    }

    const baseRelativePath = normalizeRelativePath(relativeDirectory || '');
    const nextRelativePath = normalizeRelativePath(
      baseRelativePath ? `${baseRelativePath}/${normalizedName}` : normalizedName
    );
    const nextAbsolutePath = joinDiskPath(projectRootDir, nextRelativePath);
    const nextTitle = normalizedName.replace(/\.(md|markdown)$/i, '');
    const nextContent = `# ${nextTitle}\n`;

    try {
      await writeRequirementFile(nextAbsolutePath, nextContent);
      const note = await createServerNote(currentProject.id, {
        title: nextTitle,
        content: nextContent,
        filePath: nextAbsolutePath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      });
      await refreshKnowledgeFilesystem();
      setSelectedKnowledgeNoteId(note.id);
      setRequirementDraftTitle(nextTitle);
      setRequirementDraftContent('');
      setRequirementSaveMessage(`已创建 ${nextTitle}。`);
    } catch {
      setRequirementSaveMessage('创建失败。');
    }
  }, [createServerNote, currentProject, projectRootDir, refreshKnowledgeFilesystem, writeRequirementFile]);

  const handleCreateKnowledgeFolderAtPath = useCallback((relativeDirectory: string | null) => {
    setKnowledgePathDialog({
      mode: 'create-folder',
      targetDirectory: normalizeRelativePath(relativeDirectory || ''),
      relativePath: null,
      isFolder: true,
      inputValue: '新建文件夹',
    });
  }, []);

  const handleCreateKnowledgeFileAtPath = useCallback((relativeDirectory: string | null) => {
    setKnowledgePathDialog({
      mode: 'create-file',
      targetDirectory: normalizeRelativePath(relativeDirectory || ''),
      relativePath: null,
      isFolder: false,
      inputValue: 'new-file.txt',
    });
  }, []);

  const handleRenameKnowledgeTreePath = useCallback((relativePath: string, isFolder: boolean) => {
    const normalizedPath = normalizeRelativePath(relativePath);
    setKnowledgePathDialog({
      mode: 'rename-path',
      targetDirectory: getRelativeDirectory(normalizedPath),
      relativePath: normalizedPath,
      isFolder,
      inputValue: normalizedPath.split('/').pop() || normalizedPath,
    });
  }, []);

  const handleDeleteKnowledgeTreePaths = useCallback((relativePaths: string[] | string, isFolder: boolean | null) => {
    const normalizedPaths = (Array.isArray(relativePaths) ? relativePaths : [relativePaths])
      .map((path) => normalizeRelativePath(path))
      .filter(Boolean);
    const uniquePaths = normalizedPaths.filter(
      (path, index, paths) => paths.findIndex((candidate) => candidate === path) === index
    );
    const compactPaths = uniquePaths.filter(
      (path) => !uniquePaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`))
    );

    if (compactPaths.length === 0) {
      return;
    }

    setPendingDeleteRequest({
      type: 'knowledge-tree-paths',
      paths: compactPaths,
      title:
        compactPaths.length > 1
          ? `批量删除 ${compactPaths.length} 项`
          : compactPaths[0].split('/').pop() || compactPaths[0],
      containsFolders: isFolder === true || compactPaths.some((path) =>
        knowledgeDiskItems.some((item) => item.type === 'folder' && normalizeRelativePath(item.relativePath) === path)
      ),
    });
  }, [knowledgeDiskItems]);

  const handleConfirmKnowledgePathDialog = useCallback(async () => {
    if (!knowledgePathDialog || !currentProject || !projectRootDir) {
      setKnowledgePathDialog(null);
      return;
    }

    const normalizedName =
      knowledgePathDialog.mode === 'create-note'
        ? normalizeRequirementFilename(knowledgePathDialog.inputValue)
        : normalizeKnowledgeTreeSegment(knowledgePathDialog.inputValue);

    if (!normalizedName) {
      setRequirementSaveMessage('请输入有效名称。');
      return;
    }

    const baseRelativePath =
      knowledgePathDialog.mode === 'rename-path'
        ? getRelativeDirectory(knowledgePathDialog.relativePath || '')
        : normalizeRelativePath(knowledgePathDialog.targetDirectory || '');
    const nextRelativePath = normalizeRelativePath(
      baseRelativePath ? `${baseRelativePath}/${normalizedName}` : normalizedName
    );
    const nextAbsolutePath = joinDiskPath(projectRootDir, nextRelativePath);

    try {
      if (knowledgePathDialog.mode === 'create-folder') {
        await createKnowledgeDirectory(nextAbsolutePath);
        setRequirementSaveMessage(`已创建文件夹 ${normalizedName}。`);
      } else if (knowledgePathDialog.mode === 'create-note') {
        const nextTitle = normalizedName.replace(/\.(md|markdown)$/i, '');
        const nextContent = serializeKnowledgeNoteMarkdown(nextTitle, '');
        await writeRequirementFile(nextAbsolutePath, nextContent);
        const note = await createServerNote(currentProject.id, {
          title: nextTitle,
          content: nextContent,
          filePath: nextAbsolutePath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        });
        setSelectedKnowledgeNoteId(note.id);
        setRequirementDraftTitle(nextTitle);
        setRequirementDraftContent('');
        setRequirementSaveMessage(`已创建 ${nextTitle}。`);
      } else if (knowledgePathDialog.mode === 'create-file') {
        await writeRequirementFile(nextAbsolutePath, '');
        setRequirementSaveMessage(`已创建文件 ${normalizedName}。`);
      } else if (knowledgePathDialog.relativePath) {
        const previousRelativePath = normalizeRelativePath(knowledgePathDialog.relativePath);
        const previousAbsolutePath = joinDiskPath(projectRootDir, previousRelativePath);
        await renameRequirementFile(previousAbsolutePath, nextAbsolutePath);
        const affectedNotes = collectNotesForKnowledgePaths([previousRelativePath]);
        await Promise.all(
          affectedNotes.map((note) => {
            const noteRelativePath = normalizeRelativePath(
              getRelativePathFromRoot(note.sourceUrl || '', projectRootDir) || note.sourceUrl || ''
            );
            const movedRelativePath =
              noteRelativePath === previousRelativePath
                ? nextRelativePath
                : normalizeRelativePath(noteRelativePath.replace(previousRelativePath, nextRelativePath));
            return updateServerNote(currentProject.id, note.id, {
              title: note.title,
              content: note.bodyMarkdown,
              filePath: joinDiskPath(projectRootDir, movedRelativePath),
              createdAt: note.createdAt,
              updatedAt: new Date().toISOString(),
              tags: note.tags,
            });
          })
        );
        setRequirementSaveMessage(`已重命名为 ${normalizedName}。`);
      }

      setKnowledgePathDialog(null);
      await refreshKnowledgeFilesystem();
      await loadServerNotes(currentProject.id);
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    collectNotesForKnowledgePaths,
    createKnowledgeDirectory,
    createServerNote,
    currentProject,
    knowledgePathDialog,
    loadServerNotes,
    projectRootDir,
    refreshKnowledgeFilesystem,
    renameRequirementFile,
    updateServerNote,
    writeRequirementFile,
  ]);

  useEffect(() => {
    if (!currentProject || !projectRootDir) {
      setKnowledgeDiskItems([]);
      return;
    }

    let isMounted = true;

    const syncRequirementDocsFromDisk = async () => {
      try {
        await refreshKnowledgeFilesystem();
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void syncRequirementDocsFromDisk();

    return () => {
      isMounted = false;
    };
  }, [currentProject, projectRootDir, refreshKnowledgeFilesystem]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    const handleKnowledgeFilesystemChanged = (event: Event) => {
      const detail = (event as CustomEvent<KnowledgeFilesystemChangedDetail>).detail;
      if (!detail || detail.projectId !== currentProject.id) {
        return;
      }

      void refreshKnowledgeFilesystem();
      void loadServerNotes(currentProject.id);
    };

    window.addEventListener(KNOWLEDGE_FILESYSTEM_CHANGED_EVENT, handleKnowledgeFilesystemChanged);
    return () => {
      window.removeEventListener(KNOWLEDGE_FILESYSTEM_CHANGED_EVENT, handleKnowledgeFilesystemChanged);
    };
  }, [currentProject, loadServerNotes, refreshKnowledgeFilesystem]);

  useEffect(() => {
    if (designPages.length === 0) {
      setManualPageId(null);
      clearCanvas();
      return;
    }

    setManualPageId((current) =>
      current && designPages.some((page) => page.id === current) ? current : designPages[0].id
    );
  }, [clearCanvas, designPages]);

  useEffect(() => {
    if (!preferredPageId || !designPages.some((page) => page.id === preferredPageId)) {
      return;
    }

    setManualPageId((current) => (current === preferredPageId ? current : preferredPageId));
  }, [designPages, preferredPageId]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProject || !selectedPage) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    const snapshot = JSON.stringify({
      id: selectedPage.id,
      name: selectedPage.name,
      description: selectedPage.description,
      route: selectedPage.metadata.route,
      goal: selectedPage.metadata.goal,
      frame: selectedPageWireframe?.frame || selectedPageFrame,
      elements: selectedPageWireframe?.elements || [],
    });

    if (snapshot === lastPersistedSketchSnapshotRef.current) {
      return;
    }

    lastPersistedSketchSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      void writeSketchPageFile(currentProject.id, selectedPage, selectedPageWireframe, currentProject.appType).catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [canUseProjectFilesystem, currentProject, selectedPage, selectedPageFrame, selectedPageWireframe]);

  useEffect(() => {
    if (!selectedPage) {
      selectFeature(null);
      return;
    }

    const firstFeature = selectedPage.featureIds.map((id) => featureMap.get(id)).find(Boolean) || null;
    selectFeature(firstFeature?.id || null);
    if (firstFeature) {
      onFeatureSelect?.(firstFeature);
    }
  }, [featureMap, onFeatureSelect, selectFeature, selectedPage]);

  const handleOpenKnowledgeAttachment = useCallback(async (attachmentPath: string) => {
    try {
      await invoke('open_path_in_shell', { path: attachmentPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleDeleteKnowledgeNote = useCallback(() => {
    if (!currentProject || !selectedServerNote) {
      return;
    }

    setPendingDeleteRequest({
      type: 'knowledge-note',
      id: selectedServerNote.id,
      title: selectedServerNote.title,
      sourceUrl: selectedServerNote.sourceUrl || null,
    });
  }, [currentProject, selectedServerNote]);

  const handleCreateKnowledgeNote = useCallback(async () => {
    await handleCreateKnowledgeNoteAtPath(null);
  }, [handleCreateKnowledgeNoteAtPath]);

  const handleSaveKnowledgeNote = useCallback(async () => {
    if (!selectedServerNote || !currentProject) {
      return;
    }

    const nextTitle = normalizeKnowledgeNoteTitle(requirementDraftTitle);
    const nextContent = serializeKnowledgeNoteMarkdown(nextTitle, requirementDraftContent);
    const currentFilePath = selectedServerNote.sourceUrl || '';
    const currentRelativePath = getRelativePathWithinKnowledgeRoots(
      currentFilePath,
      projectRootDir,
      currentProject.vaultPath || null
    );
    const currentDirectory =
      canPersistRequirementToDisk && projectRootDir
        ? joinDiskPath(projectRootDir, getRelativeDirectory(currentRelativePath))
        : currentFilePath
          ? getDirectoryPath(currentFilePath)
          : '';
    const nextFilePath =
      canPersistRequirementToDisk && projectRootDir && currentDirectory
        ? joinDiskPath(currentDirectory, normalizeRequirementFilename(nextTitle))
        : currentFilePath;
    const nextRelativePath = normalizeRelativePath(
      (nextFilePath && projectRootDir && getRelativePathFromRoot(nextFilePath, projectRootDir)) || nextTitle
    );

    try {
      setIsSavingRequirement(true);

      const nextOverrides = { ...knowledgeGroupOverrides };
      const overrideGroup = nextOverrides[currentRelativePath];
      if (currentRelativePath && currentRelativePath !== nextRelativePath) {
        delete nextOverrides[currentRelativePath];
      }
      if (overrideGroup) {
        nextOverrides[nextRelativePath] = overrideGroup;
      }

      setKnowledgeGroupOverrides(nextOverrides);
      writeKnowledgeGroupOverrides(currentProject?.id || null, nextOverrides);

      await updateServerNote(currentProject.id, selectedServerNote.id, {
        title: nextTitle,
        content: nextContent,
        filePath: nextFilePath || currentFilePath || '',
        createdAt: selectedServerNote.createdAt,
        updatedAt: new Date().toISOString(),
        tags: selectedServerNote.tags,
      });

      const shouldSyncMarkdownMirror = Boolean(canPersistRequirementToDisk && nextFilePath);
      if (shouldSyncMarkdownMirror && currentFilePath && currentFilePath !== nextFilePath) {
        await writeRequirementFile(currentFilePath, nextContent);
        await renameRequirementFile(currentFilePath, nextFilePath);
      } else if (shouldSyncMarkdownMirror) {
        await writeRequirementFile(nextFilePath, nextContent);
      }

      if (shouldSyncMarkdownMirror) {
        await refreshKnowledgeFilesystem();
      }

      setSelectedKnowledgeNoteId(selectedServerNote.id);
      setRequirementDraftTitle(nextTitle);
      setRequirementSaveMessage(
        shouldSyncMarkdownMirror
          ? `已保存到知识库，并同步 Markdown 镜像：${nextFilePath}`
          : '已保存到知识库。'
      );
    } catch (error) {
      setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingRequirement(false);
    }
  }, [
    canPersistRequirementToDisk,
    currentProject,
    knowledgeGroupOverrides,
    projectRootDir,
    refreshKnowledgeFilesystem,
    renameRequirementFile,
    requirementDraftContent,
    requirementDraftTitle,
    selectedServerNote,
    updateServerNote,
    writeRequirementFile,
  ]);

  useEffect(() => {
    if (!selectedServerNote) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSaveRequirement) {
          void handleSaveKnowledgeNote();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSaveRequirement, handleSaveKnowledgeNote, selectedServerNote]);

  // Auto-save: debounce draft changes to disk
  useEffect(() => {
    if (!selectedServerNote || !canSaveRequirement) {
      return;
    }

    const currentDraftSignature = `${requirementDraftTitle}|${requirementDraftContent}`;
    if (currentDraftSignature === lastAutoSavedDraftRef.current) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      lastAutoSavedDraftRef.current = `${requirementDraftTitle}|${requirementDraftContent}`;
      void handleSaveKnowledgeNote();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [requirementDraftTitle, requirementDraftContent, selectedServerNote, canSaveRequirement, handleSaveKnowledgeNote]);

  const handleCreateSketchPage = useCallback(async () => {
    if (!currentProject) {
      return null;
    }

    const nextIndex = designPages.length + 1;
    const nextName = `新页面 ${nextIndex}`;
    const nextPage: PageStructureNode = {
      id: `page-${Date.now()}`,
      name: nextName,
      kind: 'page',
      description: '由 sketch/pages 目录直接维护的页面。',
      featureIds: [],
      metadata: {
        route: `/pages/${nextIndex}`,
        title: nextName,
        goal: `继续完善 ${nextName} 的页面结构与模块布局`,
        template: 'custom',
        ownerRole: 'UI设计',
        notes: '',
        status: 'draft',
      },
      children: [],
    };

    const relativePath = await writeSketchPageFile(currentProject.id, nextPage, null, currentProject.appType);
    await refreshKnowledgeFilesystem();
    return relativePath;
  }, [currentProject, designPages.length, refreshKnowledgeFilesystem]);

  const handleAddPageAfter = useCallback(async (_pageId: string) => {
    if (!canUseProjectFilesystem) {
      const nextPage = addSiblingPage(_pageId);
      if (nextPage) {
        setManualPageId(nextPage.id);
        setSidebarTab('page');
      }
      return;
    }

    const nextPageId = await handleCreateSketchPage();
    if (nextPageId) {
      setManualPageId(nextPageId);
      setSidebarTab('page');
    }
  }, [addSiblingPage, canUseProjectFilesystem, handleCreateSketchPage]);

  const handleAddRootPage = useCallback(async () => {
    if (!canUseProjectFilesystem) {
      const nextPage = addRootPage();
      if (nextPage) {
        setManualPageId(nextPage.id);
        setSidebarTab('page');
      }
      return;
    }

    const nextPageId = await handleCreateSketchPage();
    if (nextPageId) {
      setManualPageId(nextPageId);
      setSidebarTab('page');
    }
  }, [addRootPage, canUseProjectFilesystem, handleCreateSketchPage]);

  const handleAddPageFromSidebar = useCallback(() => {
    const referencePageId = selectedPage?.id || designPages[designPages.length - 1]?.id;
    if (!referencePageId) {
      handleAddRootPage();
      return;
    }

    handleAddPageAfter(referencePageId);
  }, [designPages, handleAddPageAfter, handleAddRootPage, selectedPage]);


  const handleDeletePageById = useCallback((pageId: string) => {
    const page = designPages.find((item) => item.id === pageId);
    if (!page || !currentProject) {
      return;
    }

    setPendingDeleteRequest({
      type: 'page',
      id: pageId,
      title: page.name,
    });
  }, [currentProject, designPages]);

  const handleRequestDeleteModule = useCallback((moduleId: string, moduleTitle: string) => {
    setPendingDeleteRequest({
      type: 'module',
      id: moduleId,
      title: moduleTitle,
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteRequest || !currentProject) {
      setPendingDeleteRequest(null);
      return;
    }

    const request = pendingDeleteRequest;
    setPendingDeleteRequest(null);

    if (request.type === 'knowledge-note') {
      await deleteServerNote(currentProject.id, request.id);
      setSelectedKnowledgeNoteId(null);
      setOpenKnowledgeTabIds((current) => current.filter((id) => id !== request.id));
      setRequirementSaveMessage(
        request.sourceUrl
          ? '笔记已从知识库中删除，Markdown 镜像文件会保留。'
          : '笔记已从知识库中删除。'
      );
      return;
    }

    if (request.type === 'knowledge-tree-paths') {
      if (!projectRootDir) {
        setRequirementSaveMessage('当前项目知识目录还没有准备好。');
        return;
      }
      try {
        const affectedNotes = collectNotesForKnowledgePaths(request.paths);
        await Promise.all(
          request.paths
            .map((relativePath) => joinDiskPath(projectRootDir, relativePath))
            .map((absolutePath) => removeKnowledgePath(absolutePath))
        );
        await Promise.all(
          affectedNotes.map((note) => deleteServerNote(currentProject.id, note.id))
        );
        if (selectedServerNote && affectedNotes.some((note) => note.id === selectedServerNote.id)) {
          setSelectedKnowledgeNoteId(null);
        }
        setOpenKnowledgeTabIds((current) =>
          current.filter((id) => !affectedNotes.some((note) => note.id === id))
        );
        await refreshKnowledgeFilesystem();
        await loadServerNotes(currentProject.id);
        setRequirementSaveMessage(
          request.paths.length > 1
            ? `已批量删除 ${request.paths.length} 个项目。`
            : `已删除 ${request.title}。`
        );
      } catch (error) {
        setRequirementSaveMessage(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (request.type === 'module') {
      deleteElement(request.id);
      return;
    }

    if (!canUseProjectFilesystem) {
      deletePageStructureNode(request.id);
      if (selectedPage?.id === request.id) {
        setManualPageId(null);
        loadFromCode([]);
      }
      return;
    }

    try {
      await deleteSketchPageFile(currentProject.id, request.id);
      await refreshKnowledgeFilesystem();
      if (selectedPage?.id === request.id) {
        setManualPageId(null);
        loadFromCode([]);
      }
    } catch {
      return;
    }
  }, [
    canUseProjectFilesystem,
    currentProject,
    deleteElement,
    deletePageStructureNode,
    deleteServerNote,
    collectNotesForKnowledgePaths,
    loadFromCode,
    loadServerNotes,
    pendingDeleteRequest,
    projectRootDir,
    refreshKnowledgeFilesystem,
    removeKnowledgePath,
    selectedPage?.id,
    selectedServerNote,
  ]);

  const handleAddModule = useCallback(() => {
    const currentElements = usePreviewStore.getState().elements;
    const moduleCount = currentElements.length;
    const offset = moduleCount * 28;
    const nextModule = createWireframeModule(
      {
        name: `模块 ${moduleCount + 1}`,
        x: isMobileAppType(effectiveAppType) ? 40 : 72 + (moduleCount % 2) * 360,
        y: isMobileAppType(effectiveAppType) ? 56 + offset : 84 + Math.floor(moduleCount / 2) * 132,
        content: '',
      },
      effectiveAppType
    );

    usePreviewStore.getState().addMultipleElements([nextModule]);
    selectElement(nextModule.id);
  }, [effectiveAppType, selectElement]);

  const handleClearCurrentWireframe = useCallback(() => {
    if (!selectedPage) {
      return;
    }

    loadFromCode([]);
  }, [loadFromCode, selectedPage]);

  const handleRequestEditModule = useCallback((id: string) => {
    selectElement(id);
    setIsModulePanelOpen(true);
  }, [selectElement]);

  const openKnowledgeNote = useCallback((noteId: string) => {
    setSelectedKnowledgeNoteId(noteId);
    setSidebarTab('knowledge');
  }, [setSidebarTab]);

  const renderRequirementMain = () => {
    if (!currentProject) {
      return null;
    }

    return (
      <Suspense fallback={PRODUCT_WORKBENCH_LAZY_FALLBACK}>
        <LazyProductKnowledgeWorkspacePane
          notes={serverNotes}
          filteredNotes={filteredServerNotes}
          diskItems={knowledgeDiskItems}
          selectedNote={selectedServerNote}
          projectRootPath={projectRootDir}
          temporaryContentPreview={
            activeTemporaryArtifact
              ? {
                  title: activeTemporaryArtifact.title,
                  artifactType: activeTemporaryArtifact.artifactType,
                  summary: activeTemporaryArtifact.summary,
                  body: activeTemporaryArtifact.body,
                }
              : null
          }
          titleValue={requirementDraftTitle}
          mirrorSourcePath={selectedServerNote?.sourceUrl || null}
          editorValue={selectedServerNote ? requirementDraftContent : ''}
          editable={Boolean(selectedServerNote)}
          isSaving={isSavingRequirement}
          saveMessage={requirementSaveMessage || ''}
          canSave={canSaveRequirement}
          searchValue={knowledgeSearch}
          isSearching={isKnowledgeSearching}
          error={knowledgeSidecarError}
          onSearchChange={setKnowledgeSearch}
          onSelectNote={openKnowledgeNote}
          onTitleChange={setRequirementDraftTitle}
          onEditorChange={selectedServerNote ? setRequirementDraftContent : () => undefined}
          onSave={handleSaveKnowledgeNote}
          onDelete={handleDeleteKnowledgeNote}
          onCreateNote={() => {
            void handleCreateKnowledgeNote();
          }}
          onCreateNoteAtPath={handleCreateKnowledgeNoteAtPath}
          onCreateFileAtPath={handleCreateKnowledgeFileAtPath}
          onCreateFolderAtPath={handleCreateKnowledgeFolderAtPath}
          onRenameTreePath={handleRenameKnowledgeTreePath}
          onDeleteTreePaths={handleDeleteKnowledgeTreePaths}
          onRefreshFilesystem={handleRefreshKnowledgeFilesystem}
          onOpenAttachment={(attachmentPath) => {
            void handleOpenKnowledgeAttachment(attachmentPath);
          }}
        />
      </Suspense>
    );
  };

  const renderPageLibraryMain = () => (
    <Suspense fallback={PRODUCT_WORKBENCH_LAZY_FALLBACK}>
      <LazyProductPageWorkspacePane
        designPages={designPages}
        filteredPageStructure={filteredPageStructure}
        filteredDesignPages={filteredDesignPages}
        selectedPage={selectedPage}
        pageSearch={pageSearch}
        onPageSearchChange={setPageSearch}
        onAddPage={handleAddPageFromSidebar}
        onSelectPage={(pageId) => setManualPageId(pageId)}
        onDeletePage={handleDeletePageById}
        canvasPreset={canvasPreset}
        isFrameEditorOpen={isFrameEditorOpen}
        frameEditorDraft={frameEditorDraft}
        onFrameEditorDraftChange={setFrameEditorDraft}
        onApplyFrameValue={handleApplyFrameValue}
        onToggleFrameEditor={handleToggleFrameEditor}
        onCloseFrameEditor={() => setIsFrameEditorOpen(false)}
        onAddModule={handleAddModule}
        onRequestEditModule={handleRequestEditModule}
        onClearCurrentWireframe={handleClearCurrentWireframe}
        isModulePanelOpen={isModulePanelOpen}
        onCloseModulePanel={() => setIsModulePanelOpen(false)}
        featureTree={tree}
        effectiveAppType={effectiveAppType}
        onRequestDeleteModule={handleRequestDeleteModule}
      />
    </Suspense>
  );

  const deleteDialogDescription = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? `确定删除笔记“${pendingDeleteRequest.title}”吗？`
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.paths.length > 1
          ? `确定批量删除这 ${pendingDeleteRequest.paths.length} 项吗？`
          : `确定删除“${pendingDeleteRequest.title}”吗？`
      : pendingDeleteRequest.type === 'page'
        ? `确定删除页面“${pendingDeleteRequest.title}”吗？`
        : `确定删除模块“${pendingDeleteRequest.title}”吗？`
    : '';
  const deleteDialogBody = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? '这只会删除知识库里的笔记；Markdown 镜像文件会保留。'
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.containsFolders
          ? '会递归删除所选文件夹及其中的文件，同时移除关联的知识笔记。这个操作不可撤销。'
          : '会删除所选文件，并移除关联的知识笔记。这个操作不可撤销。'
      : pendingDeleteRequest.type === 'page'
        ? '该页面下的所有子页面都会一起删除。'
        : '该模块会从当前页面草图中移除。'
    : '';
  const deleteDialogActionLabel = pendingDeleteRequest
    ? pendingDeleteRequest.type === 'knowledge-note'
      ? '删除笔记'
      : pendingDeleteRequest.type === 'knowledge-tree-paths'
        ? pendingDeleteRequest.paths.length > 1
          ? '批量删除'
          : '删除文件'
      : pendingDeleteRequest.type === 'page'
        ? '删除页面'
        : '删除模块'
    : '删除';
  const knowledgePathDialogTitle = knowledgePathDialog
    ? knowledgePathDialog.mode === 'create-note'
      ? '新建笔记'
      : knowledgePathDialog.mode === 'create-file'
        ? '新建文件'
      : knowledgePathDialog.mode === 'create-folder'
        ? '新建文件夹'
        : knowledgePathDialog.isFolder
          ? '重命名文件夹'
          : '重命名文件'
    : '';
  const knowledgePathDialogDescription = knowledgePathDialog
    ? knowledgePathDialog.mode === 'rename-path'
      ? '请输入新的名称。'
      : knowledgePathDialog.targetDirectory
        ? `目标目录：${knowledgePathDialog.targetDirectory}`
        : '将在知识库根目录创建。'
    : '';
  const knowledgePathDialogActionLabel = knowledgePathDialog
    ? knowledgePathDialog.mode === 'rename-path'
      ? '确认重命名'
      : knowledgePathDialog.mode === 'create-file'
        ? '创建文件'
      : knowledgePathDialog.mode === 'create-folder'
        ? '创建文件夹'
        : '创建笔记'
    : '确认';

  return (
    <>
      <div className="product-workbench-shell" style={layoutStyle}>
        {sidebarTab === 'knowledge' && renderRequirementMain()}
        {sidebarTab === 'page' && renderPageLibraryMain()}
      </div>
      <MacDialog
        open={Boolean(knowledgePathDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setKnowledgePathDialog(null);
          }
        }}
        title={knowledgePathDialogTitle}
        description={knowledgePathDialogDescription}
        footer={
          <>
            <button className="mac-button mac-button-secondary" type="button" onClick={() => setKnowledgePathDialog(null)}>
              取消
            </button>
            <button className="mac-button" type="button" onClick={() => void handleConfirmKnowledgePathDialog()}>
              {knowledgePathDialogActionLabel}
            </button>
          </>
        }
      >
        <input
          className="product-input"
          type="text"
          value={knowledgePathDialog?.inputValue || ''}
          onChange={(event) =>
            setKnowledgePathDialog((current) => (current ? { ...current, inputValue: event.target.value } : current))
          }
          placeholder={knowledgePathDialog?.isFolder ? '输入文件夹名称' : '输入文件名称'}
          autoFocus
        />
      </MacDialog>
      <MacDialog
        open={Boolean(pendingDeleteRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteRequest(null);
          }
        }}
        title="确认删除"
        description={deleteDialogDescription}
        footer={
          <>
            <button className="mac-button mac-button-secondary" type="button" onClick={() => setPendingDeleteRequest(null)}>
              取消
            </button>
            <button className="mac-button mac-button-danger" type="button" onClick={() => void handleConfirmDelete()}>
              {deleteDialogActionLabel}
            </button>
          </>
        }
      >
        <p>{deleteDialogBody}</p>
      </MacDialog>
    </>
  );
};
