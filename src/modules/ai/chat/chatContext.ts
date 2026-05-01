import type { CanvasElement, PageStructureNode } from '../../../types';
import type { KnowledgeEntry } from '../../knowledge/knowledgeEntries.ts';
import type { ReferenceFile } from '../../knowledge/referenceFiles.ts';

export type AIChatScene = 'vault' | 'page';
export type AIKnowledgeMode = 'off' | 'all';
export type AIReferenceScopeMode = 'current' | 'directory' | 'open-tabs' | 'all';

type ResolveKnowledgeContextSelectionOptions = {
  scene: AIChatScene;
  knowledgeMode: AIKnowledgeMode;
  knowledgeEntries: KnowledgeEntry[];
  activeKnowledgeFileId: string | null;
};

const buildCurrentFileLabel = (title: string | null) =>
  title ? `Current file / ${title}` : 'Vault / Visible files';

export const resolveKnowledgeContextSelection = ({
  scene,
  knowledgeMode,
  knowledgeEntries,
  activeKnowledgeFileId,
}: ResolveKnowledgeContextSelectionOptions) => {
  const currentFile = knowledgeEntries.find((entry) => entry.id === activeKnowledgeFileId) || null;

  if (scene === 'vault') {
    return {
      currentFile,
      relatedFiles: knowledgeEntries.filter((entry) => entry.id !== currentFile?.id),
      label: buildCurrentFileLabel(currentFile?.title || null),
    };
  }

  if (knowledgeMode === 'all') {
    return {
      currentFile,
      relatedFiles: knowledgeEntries.filter((entry) => entry.id !== currentFile?.id),
      label: buildCurrentFileLabel(currentFile?.title || null),
    };
  }

  return {
    currentFile: null,
    relatedFiles: [],
    label: null,
  };
};

const summarizeElement = (element: CanvasElement | null) => {
  if (!element) {
    return null;
  }

  const label = String(
    element.props.name ||
      element.props.title ||
      element.props.text ||
      element.props.content ||
      element.type
  ).trim();

  return label || element.type;
};

export const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

export const buildChatContextSnapshot = (options: {
  scene: AIChatScene;
  pageTitle?: string | null;
  selectedElementLabel?: string | null;
  currentFileLabel?: string | null;
  vaultLabel?: string | null;
}) => {
  const { scene, pageTitle, selectedElementLabel, currentFileLabel, vaultLabel } = options;

  if (scene === 'vault') {
    return {
      primaryLabel: currentFileLabel || vaultLabel || null,
      secondaryLabel: currentFileLabel && vaultLabel ? vaultLabel : null,
      currentFileLabel: null,
      vaultLabel: null,
    };
  }

  return {
    primaryLabel: pageTitle ? `Page / ${pageTitle}` : null,
    secondaryLabel: selectedElementLabel ? `Canvas / ${selectedElementLabel}` : null,
    currentFileLabel,
    vaultLabel,
  };
};

export const getSelectedElementLabel = (elements: CanvasElement[], selectedElementId: string | null) =>
  summarizeElement(elements.find((element) => element.id === selectedElementId) || null);

export const resolveCurrentReferenceFileIds = (options: {
  scene: AIChatScene;
  activeKnowledgeFileId: string | null;
  selectedPagePath: string | null;
  availableFileIds: string[];
}) => {
  const availableIds = new Set(options.availableFileIds);

  if (options.scene === 'page') {
    return options.selectedPagePath && availableIds.has(options.selectedPagePath) ? [options.selectedPagePath] : [];
  }

  if (options.activeKnowledgeFileId && availableIds.has(options.activeKnowledgeFileId)) {
    return [options.activeKnowledgeFileId];
  }

  return [];
};

export const resolveReferenceScopeSelection = (options: {
  mode: AIReferenceScopeMode;
  currentFileIds: string[];
  openTabFileIds?: string[];
  directoryPath: string | null;
  allFiles: Array<Pick<ReferenceFile, 'id' | 'path' | 'readableByAI'>>;
}) => {
  if (options.mode === 'all') {
    return options.allFiles.filter((file) => file.readableByAI).map((file) => file.id);
  }

  if (options.mode === 'open-tabs') {
    const openTabIds = new Set(options.openTabFileIds || []);
    return options.allFiles
      .filter((file) => file.readableByAI && openTabIds.has(file.id))
      .map((file) => file.id);
  }

  if (options.mode === 'directory') {
    const prefix = (options.directoryPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    if (!prefix) {
      return [];
    }

    return options.allFiles
      .filter((file) => file.readableByAI && (file.path === prefix || file.path.startsWith(`${prefix}/`)))
      .map((file) => file.id);
  }

  return Array.from(new Set(options.currentFileIds));
};
