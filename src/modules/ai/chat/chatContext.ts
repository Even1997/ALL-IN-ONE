import type { CanvasElement, PageStructureNode } from '../../../types';
import { buildKnowledgeContextSelection, type KnowledgeEntry } from '../../knowledge/knowledgeEntries.ts';
import type { ReferenceFile } from '../../knowledge/referenceFiles.ts';

export type AIChatScene = 'knowledge' | 'page';
export type AIKnowledgeMode = 'off' | 'current' | 'selected' | 'all';
export type AIReferenceScopeMode = 'current' | 'directory' | 'all';

type ResolveKnowledgeContextSelectionOptions = {
  scene: AIChatScene;
  knowledgeMode: AIKnowledgeMode;
  knowledgeEntries: KnowledgeEntry[];
  activeKnowledgeFileId: string | null;
  selectedKnowledgeContextIds: string[];
};

export const resolveKnowledgeContextSelection = ({
  scene,
  knowledgeMode,
  knowledgeEntries,
  activeKnowledgeFileId,
  selectedKnowledgeContextIds,
}: ResolveKnowledgeContextSelectionOptions) => {
  if (scene === 'knowledge') {
    const currentFile = knowledgeEntries.find((entry) => entry.id === activeKnowledgeFileId) || null;
    return {
      currentFile,
      relatedFiles: knowledgeEntries.filter((entry) => entry.id !== currentFile?.id),
      label: currentFile ? `知识文档 / ${currentFile.title}` : '知识库 / 按问题自动参考',
    };
  }

  if (knowledgeMode !== 'off') {
    const selectedEntries = selectedKnowledgeContextIds
      .map((id) => knowledgeEntries.find((entry) => entry.id === id) || null)
      .filter((entry): entry is KnowledgeEntry => Boolean(entry));
    const currentFile =
      knowledgeMode === 'selected'
        ? selectedEntries[0] || null
        : knowledgeEntries.find((entry) => entry.id === activeKnowledgeFileId) || null;
    const relatedFiles =
      knowledgeMode === 'all'
        ? knowledgeEntries.filter((entry) => entry.id !== currentFile?.id)
        : selectedEntries.filter((entry) => entry.id !== currentFile?.id);

    return {
      currentFile,
      relatedFiles,
      label: currentFile ? `知识文档 / ${currentFile.title}` : '知识库 / 按问题自动参考',
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
  knowledgeLabel?: string | null;
}) => {
  const { scene, pageTitle, selectedElementLabel, knowledgeLabel } = options;

  if (scene === 'knowledge') {
    return {
      primaryLabel: knowledgeLabel,
      secondaryLabel: null,
      knowledgeLabel: null,
    };
  }

  return {
    primaryLabel: pageTitle ? `页面 / ${pageTitle}` : null,
    secondaryLabel: selectedElementLabel ? `设计 / ${selectedElementLabel}` : null,
    knowledgeLabel,
  };
};

export const getSelectedElementLabel = (elements: CanvasElement[], selectedElementId: string | null) =>
  summarizeElement(elements.find((element) => element.id === selectedElementId) || null);

export const resolveReferenceScopeSelection = (options: {
  mode: AIReferenceScopeMode;
  currentFileIds: string[];
  directoryPath: string | null;
  allFiles: Array<Pick<ReferenceFile, 'id' | 'path' | 'readableByAI'>>;
}) => {
  if (options.mode === 'all') {
    return options.allFiles.filter((file) => file.readableByAI).map((file) => file.id);
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

export const resolveKnowledgeSelectionForPrompt = (options: ResolveKnowledgeContextSelectionOptions) => {
  const selection = resolveKnowledgeContextSelection(options);
  if (options.scene === 'knowledge' && options.knowledgeEntries.length > 0) {
    if (!selection.currentFile) {
      return {
        currentFile: null,
        relatedFiles: selection.relatedFiles,
      };
    }

    return buildKnowledgeContextSelection(
      options.knowledgeEntries,
      selection.currentFile.id,
      options.knowledgeEntries.map((entry) => entry.id).filter((id) => id !== selection.currentFile?.id)
    );
  }

  return {
    currentFile: selection.currentFile,
    relatedFiles: selection.relatedFiles,
  };
};
