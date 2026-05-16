// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppType, PageStructureNode } from '../../types';
import { WorkbenchShell } from '../product/WorkbenchShell';
import { writeSketchPageFile } from '../../utils/projectPersistence';
import {
  getFallbackDesignStylePreset,
  loadStylePackModule,
  resolveStyleNodeFilePath,
  useDesignStylePackState,
} from './designStylePackState';
import { useDesignBoardState } from './useDesignBoardState';
import { useDesignCanvasController } from './useDesignCanvasController';
import {
  DESIGN_FLOW_CARD_HEIGHT,
  DESIGN_FLOW_CARD_WIDTH,
  DESIGN_PAGE_CARD_HEIGHT,
  DESIGN_PAGE_CARD_WIDTH,
  DESIGN_STYLE_CARD_HEIGHT,
  DESIGN_STYLE_CARD_WIDTH,
  DESIGN_STYLE_PALETTE_SIZE,
  DESIGN_TEXT_CARD_HEIGHT,
  DESIGN_TEXT_CARD_WIDTH,
  DesignWorkbenchView,
  buildDesignDraftElements,
  buildFreeCanvasPosition,
  buildSketchLibraryTree,
  collectDesignPages,
  collectSketchLibraryNodeIds,
  convertAINodesToTextNodes,
  createId,
  getDesignNodeTypeLabel,
  summarizeDesignSelectionText,
} from './DesignWorkbenchView';

type DesignWorkbenchScreenProps = {
  addRootPage: () => PageStructureNode | null;
  canUseProjectFilesystem: boolean;
  designCanvasPreset: {
    width: number;
    height: number;
  };
  currentProjectAppType?: AppType | null;
  currentProjectDir: string | null;
  currentProjectId: string | null;
  handleGenerateDelivery: () => void;
  handleOpenPageModules: (pageId: string) => void;
  pageStructure: PageStructureNode[];
  refreshSketchArtifactsFromDisk: () => Promise<any>;
  renderDesignResizeHandles: (...args: any[]) => React.ReactNode;
  uiSpecs: any[];
  updatePageStructureNode: (pageId: string, updates: any) => void;
  upsertWireframe: (page: { id: string; name: string }, elements: any[]) => void;
  wireframes: Record<string, any>;
};

export const DesignWorkbenchScreen: React.FC<DesignWorkbenchScreenProps> = ({
  addRootPage,
  canUseProjectFilesystem,
  designCanvasPreset,
  currentProjectAppType,
  currentProjectDir,
  currentProjectId,
  handleGenerateDelivery,
  handleOpenPageModules,
  pageStructure,
  refreshSketchArtifactsFromDisk,
  renderDesignResizeHandles,
  uiSpecs,
  updatePageStructureNode,
  upsertWireframe,
  wireframes,
}) => {
  const {
    designAINodes,
    designFlowEdges,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
    setDesignAINodes,
    setDesignFlowEdges,
    setDesignFlowNodes,
    setDesignPageNodes,
    setDesignStyleNodes,
    setDesignTextNodes,
  } = useDesignBoardState(currentProjectId, pageStructure);
  const [selectedDesignPageId, setSelectedDesignPageId] = useState<string | null>(null);
  const designPrompt = '';
  const lastPersistedSketchSnapshotRef = useRef('');
  const [isSketchLibraryOpen, setIsSketchLibraryOpen] = useState(true);
  const [sketchLibrarySearch, setSketchLibrarySearch] = useState('');
  const [expandedSketchLibraryNodeIds, setExpandedSketchLibraryNodeIds] = useState<Set<string>>(() => new Set());
  const designPages = useMemo(() => collectDesignPages(pageStructure), [pageStructure]);
  const sketchLibraryTree = useMemo(() => buildSketchLibraryTree(pageStructure), [pageStructure]);
  const {
    connectionDraftPath,
    designBoardBounds,
    designBoardScrollRef,
    designCamera,
    designCanvasSelection,
    designCanvasContextMenu,
    designCanvasMode,
    designContextMenuRef,
    designFlowPaths,
    designGridMetrics,
    designNodeLayers,
    designSelectionIds,
    designSelectionRect,
    designZoom,
    handleCanvasNodeClick,
    handleConnectorPointerDown,
    handleDesignBoardContextMenu,
    handleDesignBoardPointerDown,
    handleDesignBoardWheel,
    handleDesignNodeContextMenu,
    handleDesignNodePointerDown,
    handleScrollableAreaWheel,
    isCanvasPanning,
    isConnectorMode,
    isSpacePressed,
    pendingConnectionStartId,
    setDesignCanvasSelection,
    setDesignCanvasContextMenu,
    setDesignCanvasMode,
    setDesignSelectionIds,
  } = useDesignCanvasController({
    currentProjectId,
    designAINodes,
    designFlowEdges,
    designFlowNodes,
    designPageNodes,
    designPagesLength: designPages.length,
    designStyleNodes,
    designTextNodes,
    setDesignAINodes,
    setDesignFlowEdges,
    setDesignFlowNodes,
    setDesignPageNodes,
    setDesignStyleNodes,
    setDesignTextNodes,
    setSelectedDesignPageId,
  });
  const setIsConnectorMode = (_value?: boolean | ((current: boolean) => boolean)) => {};
  const setPendingConnectionStartId = (_value?: string | null | ((current: string | null) => string | null)) => {};
  const selectedDesignPage = designPages.find((page) => page.id === selectedDesignPageId) || null;
  const selectedUISpec = uiSpecs.find((spec) => spec.pageId === selectedDesignPage?.id) || null;
  const selectedWireframe = selectedDesignPage ? wireframes[selectedDesignPage.id] || null : null;
  const selectedPageNode = designCanvasSelection?.type === 'page'
    ? designPageNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedFlowNode = designCanvasSelection?.type === 'flow'
    ? designFlowNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedTextNode = designCanvasSelection?.type === 'text'
    ? designTextNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedAINode = designCanvasSelection?.type === 'ai'
    ? designAINodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const selectedStyleNode = designCanvasSelection?.type === 'style'
    ? designStyleNodes.find((node) => node.id === designCanvasSelection.id) || null
    : null;
  const {
    builtinStylePackPaths,
    defaultStylePresets,
    lastSyncedStyleMarkdownRef,
    setStyleInspectorMode,
    setStyleMarkdownDraft,
    styleInspectorMode,
    styleMarkdownDraft,
    stylePresets,
  } = useDesignStylePackState({
    currentProjectDir,
    currentProjectId,
    selectedStyleNode,
    setDesignStyleNodes,
  });
  const selectedDesignContextItems = useMemo(() => {
    const pageNodeMap = new Map(designPageNodes.map((node) => [node.id, node]));
    const flowNodeMap = new Map(designFlowNodes.map((node) => [node.id, node]));
    const textNodeMap = new Map(designTextNodes.map((node) => [node.id, node]));
    const aiNodeMap = new Map(designAINodes.map((node) => [node.id, node]));
    const styleNodeMap = new Map(designStyleNodes.map((node) => [node.id, node]));
    const pageMap = new Map(designPages.map((page) => [page.id, page]));

    return designSelectionIds.reduce<any[]>((items, id) => {
      const pageNode = pageNodeMap.get(id);
      if (pageNode) {
        const page = pageMap.get(pageNode.pageId);
        if (!page) {
          return items;
        }

        const pageWireframe = wireframes[page.id];
        items.push({
          id,
          type: 'page',
          title: page.name,
          summary: summarizeDesignSelectionText(
            [
              page.description,
              page.metadata.route ? `Route: ${page.metadata.route}` : '',
              typeof pageWireframe?.elements?.length === 'number' ? `${pageWireframe.elements.length} modules` : '',
            ].filter(Boolean).join(' | ')
          ),
        });
        return items;
      }

      const flowNode = flowNodeMap.get(id);
      if (flowNode) {
        items.push({
          id,
          type: 'flow',
          title: flowNode.title,
          summary: summarizeDesignSelectionText(flowNode.description),
        });
        return items;
      }

      const textNode = textNodeMap.get(id);
      if (textNode) {
        items.push({
          id,
          type: 'text',
          title: 'Text Note',
          summary: summarizeDesignSelectionText(textNode.content),
        });
        return items;
      }

      const aiNode = aiNodeMap.get(id);
      if (aiNode) {
        items.push({
          id,
          type: 'ai',
          title: aiNode.title,
          summary: summarizeDesignSelectionText(aiNode.prompt),
        });
        return items;
      }

      const styleNode = styleNodeMap.get(id);
      if (styleNode) {
        items.push({
          id,
          type: 'style',
          title: styleNode.title,
          summary: summarizeDesignSelectionText(
            [styleNode.summary, styleNode.keywords.slice(0, 4).join(', ')].filter(Boolean).join(' | ')
          ),
        });
      }

      return items;
    }, []);
  }, [designAINodes, designFlowNodes, designPageNodes, designPages, designSelectionIds, designStyleNodes, designTextNodes, wireframes]);
  const linkedStyleNodesForSelectedPage = useMemo(() => {
    if (selectedPageNode) {
      const linkedStyleIds = new Set(
        designFlowEdges.flatMap((edge) => {
          if (edge.from === selectedPageNode.id) {
            return [edge.to];
          }

          if (edge.to === selectedPageNode.id) {
            return [edge.from];
          }

          return [];
        })
      );
      const linkedByEdge = designStyleNodes.filter((node) => linkedStyleIds.has(node.id));
      if (linkedByEdge.length > 0) {
        return linkedByEdge;
      }
    }

    return designStyleNodes.filter((node) => designSelectionIds.includes(node.id));
  }, [designFlowEdges, designSelectionIds, designStyleNodes, selectedPageNode]);
  const isPageSelected = designCanvasSelection?.type === 'page' && !!selectedDesignPage && !!selectedPageNode;
  const selectTextNode = useCallback((nodeId: string) => {
    handleCanvasNodeClick(nodeId, 'text');
  }, [handleCanvasNodeClick]);

  const handleGenerateDesignDraft = useCallback(() => {
    if (!selectedDesignPage || designCanvasSelection?.type !== 'page') {
      return;
    }

    const selectedContextPrompt = selectedDesignContextItems
      .filter((item) => item.id !== designCanvasSelection.id)
      .map((item, index) => `${index + 1}. [${getDesignNodeTypeLabel(item.type)}] ${item.title}${item.summary ? ` - ${item.summary}` : ''}`)
      .join('\n');

    const nextElements = buildDesignDraftElements(
      selectedDesignPage,
      [
        ...(selectedUISpec?.sections || []).slice(0, 2),
        [...(selectedUISpec?.interactionNotes || []), (selectedUISpec?.sections || [])[2]].filter(Boolean).join(' / '),
      ],
      [
        designPrompt.trim(),
        ...linkedStyleNodesForSelectedPage.map(
          (node) => `${node.title}: ${node.prompt}。关键词：${node.keywords.join(', ')}。配色：${node.palette.join(', ')}`
        ),
        selectedContextPrompt ? `当前选中节点可作为 AI 参考：\n${selectedContextPrompt}` : '',
      ].filter(Boolean).join('\n\n'),
      currentProjectAppType
    );

    upsertWireframe(
      {
        id: selectedDesignPage.id,
        name: selectedDesignPage.name,
      },
      nextElements
    );

    handleGenerateDelivery();
  }, [
    currentProjectAppType,
    designCanvasSelection,
    designPrompt,
    handleGenerateDelivery,
    linkedStyleNodesForSelectedPage,
    selectedDesignContextItems,
    selectedDesignPage,
    selectedUISpec?.interactionNotes,
    selectedUISpec?.sections,
    upsertWireframe,
  ]);

  const handleAddDesignPage = useCallback(async () => {
    if (!currentProjectId) {
      return;
    }

    if (!canUseProjectFilesystem) {
      const nextPage = addRootPage();
      if (!nextPage) {
        return;
      }

      const position = buildFreeCanvasPosition(designPageNodes.length, DESIGN_PAGE_CARD_WIDTH, DESIGN_PAGE_CARD_HEIGHT);
      const nextNode = {
        id: createId(),
        pageId: nextPage.id,
        x: position.x,
        y: position.y,
        width: DESIGN_PAGE_CARD_WIDTH,
        height: DESIGN_PAGE_CARD_HEIGHT,
      };
      setDesignPageNodes((current) => [...current, nextNode]);
      setSelectedDesignPageId(nextPage.id);
      setDesignCanvasSelection({ type: 'page', id: nextNode.id });
      setDesignSelectionIds([nextNode.id]);
      return;
    }

    const nextIndex = designPages.length + 1;
    const nextName = `新页面 ${nextIndex}`;
    const nextPage: PageStructureNode = {
      id: `page-${Date.now()}`,
      name: nextName,
      kind: 'page',
      description: `在 design workspace 中创建的 ${nextName}`,
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

    const nextPageId = await writeSketchPageFile(currentProjectId, nextPage, null, currentProjectAppType);
    const sketchArtifacts = await refreshSketchArtifactsFromDisk();
    const resolvedPageId = sketchArtifacts?.pageStructure.find((page: PageStructureNode) => page.id === nextPageId)?.id || nextPageId;
    const position = buildFreeCanvasPosition(designPageNodes.length, DESIGN_PAGE_CARD_WIDTH, DESIGN_PAGE_CARD_HEIGHT);
    const nextNode = {
      id: createId(),
      pageId: resolvedPageId,
      x: position.x,
      y: position.y,
      width: DESIGN_PAGE_CARD_WIDTH,
      height: DESIGN_PAGE_CARD_HEIGHT,
    };
    setDesignPageNodes((current) => [...current, nextNode]);
    setSelectedDesignPageId(resolvedPageId);
    setDesignCanvasSelection({ type: 'page', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [addRootPage, canUseProjectFilesystem, currentProjectAppType, currentProjectId, designPageNodes.length, designPages.length, refreshSketchArtifactsFromDisk, setDesignPageNodes, setDesignCanvasSelection, setDesignSelectionIds]);

  const handleAddPageReferenceNode = useCallback((pageId: string, position?: { x: number; y: number }) => {
    const nextPosition = position || buildFreeCanvasPosition(
      designPageNodes.length + designFlowNodes.length + designTextNodes.length + designAINodes.length,
      DESIGN_PAGE_CARD_WIDTH,
      DESIGN_PAGE_CARD_HEIGHT
    );

    const nextNode = {
      id: createId(),
      pageId,
      x: nextPosition.x,
      y: nextPosition.y,
      width: DESIGN_PAGE_CARD_WIDTH,
      height: DESIGN_PAGE_CARD_HEIGHT,
    };

    setDesignPageNodes((current) => [...current, nextNode]);
    setSelectedDesignPageId(pageId);
    setDesignCanvasSelection({ type: 'page', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designAINodes.length, designFlowNodes.length, designPageNodes.length, designTextNodes.length, setDesignCanvasSelection, setDesignPageNodes, setDesignSelectionIds]);

  const handleAddFlowNode = useCallback((position?: { x: number; y: number }) => {
    const index = designFlowNodes.length + designPageNodes.length + designAINodes.length;
    const nextPosition = position || buildFreeCanvasPosition(index, DESIGN_FLOW_CARD_WIDTH, DESIGN_FLOW_CARD_HEIGHT);
    const nextNode = {
      id: createId(),
      title: `流程节点 ${designFlowNodes.length + 1}`,
      description: '描述这个节点要承接的操作、决策或页面跳转。',
      x: nextPosition.x + 48,
      y: nextPosition.y + 60,
      width: DESIGN_FLOW_CARD_WIDTH,
      height: DESIGN_FLOW_CARD_HEIGHT,
    };

    setDesignFlowNodes((current) => [...current, nextNode]);
    setDesignCanvasSelection({ type: 'flow', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [designAINodes.length, designFlowNodes.length, designPageNodes.length, setDesignCanvasSelection, setDesignFlowNodes, setDesignSelectionIds]);

  const handleAddTextNode = useCallback((position?: { x: number; y: number }) => {
    const nextNode = {
      id: createId(),
      content: '',
      x: position?.x ?? 240,
      y: position?.y ?? 220,
      width: DESIGN_TEXT_CARD_WIDTH,
      height: DESIGN_TEXT_CARD_HEIGHT,
    };

    setDesignTextNodes((current) => [...current, nextNode]);
    setDesignCanvasSelection({ type: 'text', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [setDesignCanvasSelection, setDesignSelectionIds, setDesignTextNodes]);

  const handleAddStyleNode = useCallback((preset?: any, position?: { x: number; y: number }) => {
    const activePreset = preset || getFallbackDesignStylePreset(stylePresets.length > 0 ? stylePresets : defaultStylePresets);
    const nextPosition = position || buildFreeCanvasPosition(
      designPageNodes.length + designFlowNodes.length + designTextNodes.length + designAINodes.length + designStyleNodes.length,
      DESIGN_STYLE_CARD_WIDTH,
      DESIGN_STYLE_CARD_HEIGHT
    );

    const nextNode = {
      id: createId(),
      title: activePreset.title,
      summary: activePreset.summary,
      keywords: activePreset.keywords,
      palette: activePreset.palette,
      prompt: activePreset.prompt,
      styleFilePath: resolveStyleNodeFilePath(
        { id: activePreset.title, title: activePreset.title, styleFilePath: activePreset.styleFilePath },
        stylePresets
      ),
      x: nextPosition.x,
      y: nextPosition.y,
      width: DESIGN_STYLE_CARD_WIDTH,
      height: DESIGN_STYLE_CARD_HEIGHT,
    };

    setDesignStyleNodes((current) => [...current, nextNode]);
    setDesignCanvasSelection({ type: 'style', id: nextNode.id });
    setDesignSelectionIds([nextNode.id]);
  }, [defaultStylePresets, designAINodes.length, designFlowNodes.length, designPageNodes.length, designStyleNodes.length, designTextNodes.length, setDesignCanvasSelection, setDesignSelectionIds, setDesignStyleNodes, stylePresets]);

  const handleDeleteSelectedFlowNode = useCallback(() => {
    if (!selectedFlowNode) {
      return;
    }

    setDesignFlowNodes((current) => current.filter((node) => node.id !== selectedFlowNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedFlowNode.id && edge.to !== selectedFlowNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedFlowNode.id));
    setDesignCanvasSelection(null);
  }, [selectedFlowNode, setDesignCanvasSelection, setDesignFlowEdges, setDesignFlowNodes, setDesignSelectionIds]);

  const handleDeleteSelectedPageNode = useCallback(() => {
    if (!selectedPageNode) {
      return;
    }

    setDesignPageNodes((current) => current.filter((node) => node.id !== selectedPageNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedPageNode.id && edge.to !== selectedPageNode.id)
    );
    setSelectedDesignPageId((current) => (current === selectedPageNode.pageId ? null : current));
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedPageNode.id));
    setDesignCanvasSelection(null);
  }, [selectedPageNode, setDesignCanvasSelection, setDesignFlowEdges, setDesignPageNodes, setDesignSelectionIds]);

  const handleDeleteSelectedTextNode = useCallback(() => {
    if (!selectedTextNode) {
      return;
    }

    setDesignTextNodes((current) => current.filter((node) => node.id !== selectedTextNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedTextNode.id && edge.to !== selectedTextNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedTextNode.id));
    setDesignCanvasSelection(null);
  }, [selectedTextNode, setDesignCanvasSelection, setDesignFlowEdges, setDesignSelectionIds, setDesignTextNodes]);

  const handleDeleteSelectedAINode = useCallback(() => {
    if (!selectedAINode) {
      return;
    }

    setDesignAINodes((current) => current.filter((node) => node.id !== selectedAINode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedAINode.id && edge.to !== selectedAINode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedAINode.id));
    setDesignCanvasSelection(null);
  }, [selectedAINode, setDesignAINodes, setDesignCanvasSelection, setDesignFlowEdges, setDesignSelectionIds]);

  const handleDeleteSelectedStyleNode = useCallback(() => {
    if (!selectedStyleNode) {
      return;
    }

    setDesignStyleNodes((current) => current.filter((node) => node.id !== selectedStyleNode.id));
    setDesignFlowEdges((current) =>
      current.filter((edge) => edge.from !== selectedStyleNode.id && edge.to !== selectedStyleNode.id)
    );
    setDesignSelectionIds((current) => current.filter((id) => id !== selectedStyleNode.id));
    setDesignCanvasSelection(null);
  }, [selectedStyleNode, setDesignCanvasSelection, setDesignFlowEdges, setDesignSelectionIds, setDesignStyleNodes]);

  const handleFlowNodeUpdate = useCallback((updates: Partial<{ title: string; description: string }>) => {
    if (!selectedFlowNode) {
      return;
    }

    setDesignFlowNodes((current) =>
      current.map((node) => (node.id === selectedFlowNode.id ? { ...node, ...updates } : node))
    );
  }, [selectedFlowNode, setDesignFlowNodes]);

  const handleTextNodeUpdate = useCallback((updates: Partial<{ content: string; width: number; height: number }>) => {
    if (!selectedTextNode) {
      return;
    }

    setDesignTextNodes((current) =>
      current.map((node) => (node.id === selectedTextNode.id ? { ...node, ...updates } : node))
    );
  }, [selectedTextNode, setDesignTextNodes]);

  const handleStyleNodeUpdate = useCallback((updates: Partial<{ title: string; summary: string; keywords: string[]; palette: string[]; prompt: string }>) => {
    if (!selectedStyleNode) {
      return;
    }

    setDesignStyleNodes((current) =>
      current.map((node) => (node.id === selectedStyleNode.id ? { ...node, ...updates } : node))
    );
  }, [selectedStyleNode, setDesignStyleNodes]);

  const handleStylePaletteColorChange = useCallback((index: number, value: string) => {
    if (!selectedStyleNode) {
      return;
    }

    const nextPalette = [...selectedStyleNode.palette];
    while (nextPalette.length < Math.max(DESIGN_STYLE_PALETTE_SIZE, index + 1)) {
      nextPalette.push(
        getFallbackDesignStylePreset(stylePresets.length > 0 ? stylePresets : defaultStylePresets).palette[nextPalette.length] || '#ffffff'
      );
    }
    nextPalette[index] = value;
    handleStyleNodeUpdate({ palette: nextPalette });
  }, [defaultStylePresets, handleStyleNodeUpdate, selectedStyleNode, stylePresets]);

  const handleApplyStyleMarkdown = useCallback(async () => {
    if (!selectedStyleNode) {
      return;
    }

    const { buildDesignStyleMarkdown, parseDesignStyleMarkdown } = await loadStylePackModule();
    const updates = parseDesignStyleMarkdown(styleMarkdownDraft, selectedStyleNode);
    const nextNode = { ...selectedStyleNode, ...updates };
    const nextMarkdown = buildDesignStyleMarkdown(nextNode);

    lastSyncedStyleMarkdownRef.current = nextMarkdown;
    setStyleMarkdownDraft(nextMarkdown);
    handleStyleNodeUpdate(updates);
  }, [handleStyleNodeUpdate, selectedStyleNode, setStyleMarkdownDraft, styleMarkdownDraft, lastSyncedStyleMarkdownRef]);

  const handleResetStyleMarkdown = useCallback(async () => {
    if (!selectedStyleNode) {
      return;
    }

    const { buildDesignStyleMarkdown } = await loadStylePackModule();
    const nextMarkdown = buildDesignStyleMarkdown(selectedStyleNode);
    lastSyncedStyleMarkdownRef.current = nextMarkdown;
    setStyleMarkdownDraft(nextMarkdown);
  }, [lastSyncedStyleMarkdownRef, selectedStyleNode, setStyleMarkdownDraft]);

  const handlePageNodeUpdate = useCallback((
    updates: Partial<Pick<PageStructureNode, 'name' | 'description'>> & {
      metadata?: Partial<PageStructureNode['metadata']>;
    }
  ) => {
    if (!selectedDesignPage) {
      return;
    }

    updatePageStructureNode(selectedDesignPage.id, updates);
  }, [selectedDesignPage, updatePageStructureNode]);

  useEffect(() => {
    if (!currentProjectId) {
      setSelectedDesignPageId(null);
      setDesignCanvasSelection(null);
      setDesignSelectionIds([]);
      return;
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProjectId) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    let isMounted = true;

    void refreshSketchArtifactsFromDisk()
      .then((sketchArtifacts) => {
        if (!isMounted || !sketchArtifacts) {
          return;
        }

        setSelectedDesignPageId((current) =>
          current && sketchArtifacts.pageStructure.some((page: PageStructureNode) => page.id === current)
            ? current
            : sketchArtifacts.pageStructure[0]?.id || null
        );
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [canUseProjectFilesystem, currentProjectId, refreshSketchArtifactsFromDisk]);

  useEffect(() => {
    if (!canUseProjectFilesystem || !currentProjectId || !selectedDesignPage) {
      lastPersistedSketchSnapshotRef.current = '';
      return;
    }

    const snapshot = JSON.stringify({
      id: selectedDesignPage.id,
      name: selectedDesignPage.name,
      description: selectedDesignPage.description,
      route: selectedDesignPage.metadata.route,
      goal: selectedDesignPage.metadata.goal,
      frame: selectedWireframe?.frame,
      elements: selectedWireframe?.elements || [],
    });

    if (snapshot === lastPersistedSketchSnapshotRef.current) {
      return;
    }

    lastPersistedSketchSnapshotRef.current = snapshot;

    const persistTimer = window.setTimeout(() => {
      void writeSketchPageFile(currentProjectId, selectedDesignPage, selectedWireframe, currentProjectAppType).catch(() => undefined);
    }, 120);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [canUseProjectFilesystem, currentProjectAppType, currentProjectId, selectedDesignPage, selectedWireframe]);

  useEffect(() => {
    if (designAINodes.length === 0) {
      return;
    }

    const aiNodeIds = new Set(designAINodes.map((node) => node.id));
    const migratedTextNodes = convertAINodesToTextNodes(designAINodes);

    setDesignTextNodes((current) => [...current, ...migratedTextNodes]);
    setDesignAINodes([]);
    setDesignFlowEdges((current) =>
      current.filter((edge) => !aiNodeIds.has(edge.from) && !aiNodeIds.has(edge.to))
    );
    setDesignSelectionIds((current) => current.filter((id) => !aiNodeIds.has(id)));
    setDesignCanvasSelection((current: any) => (current?.type === 'ai' ? null : current));
  }, [designAINodes, setDesignAINodes, setDesignFlowEdges, setDesignTextNodes]);

  useEffect(() => {
    if (!designCanvasSelection) {
      return;
    }

    if (designCanvasSelection.type === 'page' && !designPageNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }

    if (designCanvasSelection.type === 'flow' && !designFlowNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }

    if (designCanvasSelection.type === 'text' && !designTextNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }

    if (designCanvasSelection.type === 'ai' && !designAINodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }

    if (designCanvasSelection.type === 'style' && !designStyleNodes.some((node) => node.id === designCanvasSelection.id)) {
      setDesignCanvasSelection(null);
    }
  }, [designAINodes, designCanvasSelection, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  useEffect(() => {
    const validIds = new Set([
      ...designPageNodes.map((node) => node.id),
      ...designFlowNodes.map((node) => node.id),
      ...designTextNodes.map((node) => node.id),
      ...designAINodes.map((node) => node.id),
      ...designStyleNodes.map((node) => node.id),
    ]);

    setDesignSelectionIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const sketchLibraryNodeIds = useMemo(() => collectSketchLibraryNodeIds(sketchLibraryTree), [sketchLibraryTree]);

  useEffect(() => {
    setExpandedSketchLibraryNodeIds((current) => {
      const next = new Set([...current].filter((id) => sketchLibraryNodeIds.includes(id)));
      sketchLibraryNodeIds.forEach((id) => {
        if (!current.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [sketchLibraryNodeIds]);

  const getCanvasContextPosition = useCallback(
    () => (designCanvasContextMenu ? { x: designCanvasContextMenu.boardX, y: designCanvasContextMenu.boardY } : undefined),
    [designCanvasContextMenu]
  );

  const handleAddFlowNodeFromCanvas = useCallback(() => {
    handleAddFlowNode(getCanvasContextPosition());
    setDesignCanvasContextMenu(null);
  }, [getCanvasContextPosition, handleAddFlowNode]);

  const handleAddPageReferenceNodeFromCanvas = useCallback((pageId: string) => {
    handleAddPageReferenceNode(pageId, getCanvasContextPosition());
    setDesignCanvasContextMenu(null);
  }, [getCanvasContextPosition, handleAddPageReferenceNode]);

  const handleAddTextNodeFromCanvas = useCallback(() => {
    handleAddTextNode(getCanvasContextPosition());
    setDesignCanvasContextMenu(null);
  }, [getCanvasContextPosition, handleAddTextNode]);

  const handleAddStyleNodeFromCanvas = useCallback((preset?: any) => {
    handleAddStyleNode(preset, getCanvasContextPosition());
    setDesignCanvasContextMenu(null);
  }, [getCanvasContextPosition, handleAddStyleNode]);
  /* const designUtilitySidebar = (
    <UtilitySidebar
      className="design-utility-sidebar"
      title="设计概览"
      subtitle="Review current board"
      icon="design"
      railLabel="设计工作台侧栏"
      panelLabel="设计工作台检查面板"
      collapsed={isUtilitySidebarCollapsed}
      panelVisible={Boolean(selectedDesignPage || designSelectionIds.length || designPages.length)}
      onToggleCollapsed={() => setIsUtilitySidebarCollapsed((current) => !current)}
      tabs={[
        {
          icon: 'design',
          label: '设计概览',
          active: true,
          hasDot: Boolean(designSelectionIds.length || linkedStyleNodesForSelectedPage.length || selectedDesignPage),
          onClick: () => {
            if (isUtilitySidebarCollapsed) {
              setIsUtilitySidebarCollapsed(false);
            }
          },
        },
      ]}
    >
      <>
        {selectedDesignPage ? (
          <StateCard
            icon="page"
            tone="info"
            title={selectedDesignPage.name}
            description={
              summarizeDesignSelectionText(
                selectedDesignPage.description || selectedDesignPage.metadata.goal || ''
              ) || '当前页面已进入统一的设计工作台壳层。'
            }
            meta={selectedDesignPage.metadata.route || 'Page'}
          />
        ) : null}

        <StateCard
          icon="files"
          tone="neutral"
          title="设计画布"
          description={`共 ${designPages.length} 个页面节点，${designFlowNodes.length} 个 flow，${designStyleNodes.length} 个 style。`}
          meta={`${designZoom.toFixed(2)}x`}
        />

        {designSelectionIds.length > 0 ? (
          <StateCard
            icon="spark"
            tone="warning"
            title="当前选择"
            description={selectedDesignContextItems.map((item) => item.title).slice(0, 3).join(' / ')}
            meta={`${designSelectionIds.length} selected`}
          />
        ) : null}

        {linkedStyleNodesForSelectedPage.length > 0 ? (
          <StatusBanner
            tone="info"
            icon="design"
            title="关联视觉方向"
            message={linkedStyleNodesForSelectedPage.map((node) => node.title).slice(0, 3).join(' / ')}
          />
        ) : null}
      </>
    </UtilitySidebar>
  );
  ); */
  /* const designFloatingCompanion =
    selectedDesignPage || designSelectionIds.length > 0 ? (
      <FloatingRunCompanion
        className="design-floating-run-companion"
        title={designSelectionIds.length > 0 ? 'Current selection' : 'Current board'}
        subtitle={
          designSelectionIds.length > 0
            ? selectedDesignContextItems.map((item) => item.title).slice(0, 2).join(' / ')
            : selectedDesignPage?.name || 'Design workspace'
        }
        icon={designSelectionIds.length > 0 ? 'spark' : 'design'}
        meta={
          <span>
            {selectedDesignPage ? `${selectedPageModuleCount} modules` : `${designPages.length} pages`}
          </span>
        }
      >
        <StateCard
          icon={designSelectionIds.length > 0 ? 'document' : 'page'}
          tone={designSelectionIds.length > 0 ? 'warning' : 'info'}
          title={
            designSelectionIds.length > 0
              ? `${designSelectionIds.length} 个对象已选中`
              : selectedDesignPage?.metadata.goal || 'Design board'
          }
          description={
            summarizeDesignSelectionText(
              selectedDesignContextItems[0]?.summary
                || selectedDesignPage?.description
                || selectedDesignPage?.metadata.goal
                || ''
            ) || '当前设计上下文会以统一 companion 的形式悬浮在主舞台内。'
          }
          meta={selectedDesignPage?.metadata.route || `${designZoom.toFixed(2)}x`}
        />
      </FloatingRunCompanion>
    ) : null; */

  return (
    <WorkbenchShell
      className="design-workbench-shell"
      main={(
        <DesignWorkbenchView
          builtinStylePackPaths={builtinStylePackPaths}
          connectionDraftPath={connectionDraftPath}
          defaultStylePresets={defaultStylePresets}
          designAINodes={designAINodes}
          designBoardBounds={designBoardBounds}
          designBoardScrollRef={designBoardScrollRef}
          designCamera={designCamera}
          designCanvasContextMenu={designCanvasContextMenu}
          designCanvasMode={designCanvasMode}
          designCanvasPreset={designCanvasPreset}
          designCanvasSelection={designCanvasSelection}
          designContextMenuRef={designContextMenuRef}
          designFlowNodes={designFlowNodes}
          designFlowPaths={designFlowPaths}
          designGridMetrics={designGridMetrics}
          designNodeLayers={designNodeLayers}
          designPageNodes={designPageNodes}
          designPages={designPages}
          designSelectionIds={designSelectionIds}
          designSelectionRect={designSelectionRect}
          designStyleNodes={designStyleNodes}
          designTextNodes={designTextNodes}
          designZoom={designZoom}
          expandedSketchLibraryNodeIds={expandedSketchLibraryNodeIds}
          handleAddDesignPage={handleAddDesignPage}
          handleAddFlowNode={handleAddFlowNodeFromCanvas}
          handleAddPageReferenceNode={handleAddPageReferenceNodeFromCanvas}
          handleAddStyleNode={handleAddStyleNodeFromCanvas}
          handleAddTextNode={handleAddTextNodeFromCanvas}
          handleApplyStyleMarkdown={handleApplyStyleMarkdown}
          handleCanvasNodeClick={handleCanvasNodeClick}
          handleConnectorPointerDown={handleConnectorPointerDown}
          handleDeleteSelectedAINode={handleDeleteSelectedAINode}
          handleDeleteSelectedFlowNode={handleDeleteSelectedFlowNode}
          handleDeleteSelectedPageNode={handleDeleteSelectedPageNode}
          handleDeleteSelectedStyleNode={handleDeleteSelectedStyleNode}
          handleDeleteSelectedTextNode={handleDeleteSelectedTextNode}
          handleDesignBoardContextMenu={handleDesignBoardContextMenu}
          handleDesignBoardPointerDown={handleDesignBoardPointerDown}
          handleDesignBoardWheel={handleDesignBoardWheel}
          handleDesignNodeContextMenu={handleDesignNodeContextMenu}
          handleDesignNodePointerDown={handleDesignNodePointerDown}
          handleFlowNodeUpdate={handleFlowNodeUpdate}
          handleGenerateDelivery={handleGenerateDelivery}
          handleGenerateDesignDraft={handleGenerateDesignDraft}
          handleOpenPageModules={handleOpenPageModules}
          handlePageNodeUpdate={handlePageNodeUpdate}
          handleResetStyleMarkdown={handleResetStyleMarkdown}
          handleScrollableAreaWheel={handleScrollableAreaWheel}
          handleStyleNodeUpdate={handleStyleNodeUpdate}
          handleStylePaletteColorChange={handleStylePaletteColorChange}
          handleTextNodeUpdate={handleTextNodeUpdate}
          isCanvasPanning={isCanvasPanning}
          isConnectorMode={isConnectorMode}
          isPageSelected={isPageSelected}
          isSketchLibraryOpen={isSketchLibraryOpen}
          isSpacePressed={isSpacePressed}
          pendingConnectionStartId={pendingConnectionStartId}
          renderDesignResizeHandles={renderDesignResizeHandles}
          sketchLibraryTree={sketchLibraryTree}
          selectedDesignPage={selectedDesignPage}
          selectedDesignPageId={selectedDesignPageId}
          selectedFlowNode={selectedFlowNode}
          selectedStyleNode={selectedStyleNode}
          selectedTextNode={selectedTextNode}
          selectedWireframe={selectedWireframe}
          setDesignAINodes={setDesignAINodes}
          setDesignCanvasContextMenu={setDesignCanvasContextMenu}
          setDesignCanvasMode={setDesignCanvasMode}
          setDesignFlowNodes={setDesignFlowNodes}
          setDesignTextNodes={setDesignTextNodes}
          setExpandedSketchLibraryNodeIds={setExpandedSketchLibraryNodeIds}
          setIsConnectorMode={setIsConnectorMode}
          setIsSketchLibraryOpen={setIsSketchLibraryOpen}
          setPendingConnectionStartId={setPendingConnectionStartId}
          setSketchLibrarySearch={setSketchLibrarySearch}
          setStyleInspectorMode={setStyleInspectorMode}
          setStyleMarkdownDraft={setStyleMarkdownDraft}
          sketchLibrarySearch={sketchLibrarySearch}
          selectTextNode={selectTextNode}
          styleInspectorMode={styleInspectorMode}
          styleMarkdownDraft={styleMarkdownDraft}
          stylePresets={stylePresets}
          uiSpecs={uiSpecs}
          wireframes={wireframes}
        />
      )}
    />
  );
};
