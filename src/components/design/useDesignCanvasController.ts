import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DESIGN_BOARD_PADDING,
  DESIGN_ZOOM_STEP,
  buildEdgePath,
  clampZoom,
  normalizePatternOffset,
} from './DesignWorkbenchView';

type DesignNodeType = 'page' | 'flow' | 'text' | 'ai' | 'style';

type UseDesignCanvasControllerArgs = {
  currentProjectId: string | null;
  designAINodes: any[];
  designFlowEdges: any[];
  designFlowNodes: any[];
  designPageNodes: any[];
  designPagesLength: number;
  designStyleNodes: any[];
  designTextNodes: any[];
  setDesignAINodes: React.Dispatch<React.SetStateAction<any[]>>;
  setDesignFlowEdges: React.Dispatch<React.SetStateAction<any[]>>;
  setDesignFlowNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setDesignPageNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setDesignStyleNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setDesignTextNodes: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedDesignPageId: React.Dispatch<React.SetStateAction<string | null>>;
};

export const useDesignCanvasController = ({
  currentProjectId,
  designAINodes,
  designFlowEdges,
  designFlowNodes,
  designPageNodes,
  designPagesLength,
  designStyleNodes,
  designTextNodes,
  setDesignAINodes,
  setDesignFlowEdges,
  setDesignFlowNodes,
  setDesignPageNodes,
  setDesignStyleNodes,
  setDesignTextNodes,
  setSelectedDesignPageId,
}: UseDesignCanvasControllerArgs) => {
  const [designCanvasSelection, setDesignCanvasSelection] = useState<any>(null);
  const [designSelectionIds, setDesignSelectionIds] = useState<string[]>([]);
  const [designMarqueeSelection, setDesignMarqueeSelection] = useState<any>(null);
  const [designNodeLayers, setDesignNodeLayers] = useState<Record<string, number>>({});
  const [connectionDraft, setConnectionDraft] = useState<any>(null);
  const [designZoom, setDesignZoom] = useState(1);
  const [designCamera, setDesignCamera] = useState({ x: DESIGN_BOARD_PADDING, y: DESIGN_BOARD_PADDING });
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [designCanvasMode, setDesignCanvasMode] = useState<'pan' | 'select'>('pan');
  const [designCanvasContextMenu, setDesignCanvasContextMenu] = useState<any>(null);
  const [designBoardViewport, setDesignBoardViewport] = useState({ width: 0, height: 0 });
  const designBoardScrollRef = useRef<HTMLDivElement | null>(null);
  const designContextMenuRef = useRef<HTMLDivElement | null>(null);
  const designMarqueeRef = useRef<any>(null);
  const designDragRef = useRef<any>(null);
  const designPanRef = useRef<any>(null);
  const designLayerCounterRef = useRef(1);
  const designConnectionRef = useRef<any>(null);
  const hasAutoFramedDesignBoardRef = useRef(false);

  useEffect(() => {
    hasAutoFramedDesignBoardRef.current = false;
    setDesignCanvasContextMenu(null);
    setIsCanvasPanning(false);
    setConnectionDraft(null);
    setDesignCanvasSelection(null);
    setDesignSelectionIds([]);
  }, [currentProjectId]);

  const getNodeFrame = useCallback((nodeId: string) => {
    const pageNode = designPageNodes.find((item) => item.id === nodeId);
    if (pageNode) {
      return { x: pageNode.x, y: pageNode.y, width: pageNode.width, height: pageNode.height };
    }

    const flowNode = designFlowNodes.find((item) => item.id === nodeId);
    if (flowNode) {
      return { x: flowNode.x, y: flowNode.y, width: flowNode.width, height: flowNode.height };
    }

    const textNode = designTextNodes.find((item) => item.id === nodeId);
    if (textNode) {
      return { x: textNode.x, y: textNode.y, width: textNode.width, height: textNode.height };
    }

    const aiNode = designAINodes.find((item) => item.id === nodeId);
    if (aiNode) {
      return { x: aiNode.x, y: aiNode.y, width: aiNode.width, height: aiNode.height };
    }

    const styleNode = designStyleNodes.find((item) => item.id === nodeId);
    if (styleNode) {
      return { x: styleNode.x, y: styleNode.y, width: styleNode.width, height: styleNode.height };
    }

    return null;
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const designContentBounds = useMemo(() => {
    const pageBounds = designPageNodes.map((page) => ({
      left: page.x,
      top: page.y,
      right: page.x + page.width,
      bottom: page.y + page.height,
    }));
    const flowBounds = designFlowNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const textBounds = designTextNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const aiBounds = designAINodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const styleBounds = designStyleNodes.map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
    const allBounds = [...pageBounds, ...flowBounds, ...textBounds, ...aiBounds, ...styleBounds];
    if (allBounds.length === 0) {
      return {
        x: -DESIGN_BOARD_PADDING,
        y: -DESIGN_BOARD_PADDING,
        width: DESIGN_BOARD_PADDING * 2,
        height: DESIGN_BOARD_PADDING * 2,
      };
    }

    const minLeft = Math.min(...allBounds.map((item) => item.left)) - DESIGN_BOARD_PADDING;
    const minTop = Math.min(...allBounds.map((item) => item.top)) - DESIGN_BOARD_PADDING;
    const maxRight = Math.max(...allBounds.map((item) => item.right)) + DESIGN_BOARD_PADDING;
    const maxBottom = Math.max(...allBounds.map((item) => item.bottom)) + DESIGN_BOARD_PADDING;

    return {
      x: minLeft,
      y: minTop,
      width: Math.max(1, maxRight - minLeft),
      height: Math.max(1, maxBottom - minTop),
    };
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const designBoardBounds = useMemo(() => {
    const viewportWidth = designBoardViewport.width > 0 ? designBoardViewport.width / designZoom : designContentBounds.width;
    const viewportHeight = designBoardViewport.height > 0 ? designBoardViewport.height / designZoom : designContentBounds.height;
    const visibleMinX = -designCamera.x / designZoom;
    const visibleMinY = -designCamera.y / designZoom;
    const visibleMaxX = visibleMinX + viewportWidth;
    const visibleMaxY = visibleMinY + viewportHeight;
    const draftLeft = connectionDraft ? connectionDraft.x - DESIGN_BOARD_PADDING : visibleMinX - DESIGN_BOARD_PADDING;
    const draftTop = connectionDraft ? connectionDraft.y - DESIGN_BOARD_PADDING : visibleMinY - DESIGN_BOARD_PADDING;
    const draftRight = connectionDraft ? connectionDraft.x + DESIGN_BOARD_PADDING : visibleMaxX + DESIGN_BOARD_PADDING;
    const draftBottom = connectionDraft ? connectionDraft.y + DESIGN_BOARD_PADDING : visibleMaxY + DESIGN_BOARD_PADDING;
    const minX = Math.min(designContentBounds.x, visibleMinX - DESIGN_BOARD_PADDING, draftLeft);
    const minY = Math.min(designContentBounds.y, visibleMinY - DESIGN_BOARD_PADDING, draftTop);
    const maxX = Math.max(designContentBounds.x + designContentBounds.width, visibleMaxX + DESIGN_BOARD_PADDING, draftRight);
    const maxY = Math.max(designContentBounds.y + designContentBounds.height, visibleMaxY + DESIGN_BOARD_PADDING, draftBottom);

    return {
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }, [
    connectionDraft,
    designBoardViewport.height,
    designBoardViewport.width,
    designCamera.x,
    designCamera.y,
    designContentBounds.height,
    designContentBounds.width,
    designContentBounds.x,
    designContentBounds.y,
    designZoom,
  ]);

  const designGridMetrics = useMemo(() => {
    const minorSize = 40 * designZoom;
    const majorSize = minorSize * 5;

    return {
      minorSize,
      majorSize,
      minorOffsetX: normalizePatternOffset(designCamera.x, minorSize),
      minorOffsetY: normalizePatternOffset(designCamera.y, minorSize),
      majorOffsetX: normalizePatternOffset(designCamera.x, majorSize),
      majorOffsetY: normalizePatternOffset(designCamera.y, majorSize),
    };
  }, [designCamera.x, designCamera.y, designZoom]);

  const designFlowPaths = useMemo(
    () =>
      designFlowEdges
        .map((edge) => {
          const fromFrame = getNodeFrame(edge.from);
          const toFrame = getNodeFrame(edge.to);
          if (!fromFrame || !toFrame) {
            return null;
          }

          return {
            id: edge.id,
            d: buildEdgePath(
              { x: fromFrame.x + fromFrame.width, y: fromFrame.y + fromFrame.height / 2 },
              { x: toFrame.x, y: toFrame.y + toFrame.height / 2 }
            ),
          };
        })
        .filter((path): path is { id: string; d: string } => Boolean(path)),
    [designFlowEdges, getNodeFrame]
  );

  const bringDesignNodeToFront = useCallback((nodeId: string) => {
    designLayerCounterRef.current += 1;
    const nextLayer = designLayerCounterRef.current;

    setDesignNodeLayers((current) => {
      if (current[nodeId] === nextLayer) {
        return current;
      }

      return {
        ...current,
        [nodeId]: nextLayer,
      };
    });
  }, []);

  const selectPageNode = useCallback(
    (nodeId: string) => {
      const pageNode = designPageNodes.find((item) => item.id === nodeId);
      if (!pageNode) {
        return;
      }

      setSelectedDesignPageId(pageNode.pageId);
      setDesignCanvasSelection({ type: 'page', id: nodeId });
    },
    [designPageNodes, setSelectedDesignPageId]
  );

  const selectFlowNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'flow', id: nodeId });
  }, []);

  const selectTextNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'text', id: nodeId });
  }, []);

  const selectAINode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'ai', id: nodeId });
  }, []);

  const selectStyleNode = useCallback((nodeId: string) => {
    setDesignCanvasSelection({ type: 'style', id: nodeId });
  }, []);

  const appendEdge = useCallback((from: string, to: string) => {
    if (from === to) {
      return;
    }

    setDesignFlowEdges((current) =>
      current.some((edge) => edge.from === from && edge.to === to)
        ? current
        : [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from, to }]
    );
  }, [setDesignFlowEdges]);

  const handleCanvasNodeClick = useCallback((nodeId: string, type: DesignNodeType) => {
    setDesignCanvasContextMenu(null);
    setDesignSelectionIds([nodeId]);

    if (type === 'page') {
      selectPageNode(nodeId);
      return;
    }

    if (type === 'text') {
      selectTextNode(nodeId);
      return;
    }

    if (type === 'ai') {
      selectAINode(nodeId);
      return;
    }

    if (type === 'style') {
      selectStyleNode(nodeId);
      return;
    }

    selectFlowNode(nodeId);
  }, [selectAINode, selectFlowNode, selectPageNode, selectStyleNode, selectTextNode]);

  const updateCanvasNodePosition = useCallback((nodeId: string, type: DesignNodeType, x: number, y: number) => {
    if (type === 'page') {
      setDesignPageNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
      );
      return;
    }

    if (type === 'text') {
      setDesignTextNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
      );
      return;
    }

    if (type === 'ai') {
      setDesignAINodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
      );
      return;
    }

    if (type === 'style') {
      setDesignStyleNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
      );
      return;
    }

    setDesignFlowNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
    );
  }, [setDesignAINodes, setDesignFlowNodes, setDesignPageNodes, setDesignStyleNodes, setDesignTextNodes]);

  const getDesignNodeTypeById = useCallback((nodeId: string): DesignNodeType | null => {
    if (designPageNodes.some((node) => node.id === nodeId)) {
      return 'page';
    }
    if (designTextNodes.some((node) => node.id === nodeId)) {
      return 'text';
    }
    if (designAINodes.some((node) => node.id === nodeId)) {
      return 'ai';
    }
    if (designStyleNodes.some((node) => node.id === nodeId)) {
      return 'style';
    }
    if (designFlowNodes.some((node) => node.id === nodeId)) {
      return 'flow';
    }
    return null;
  }, [designAINodes, designFlowNodes, designPageNodes, designStyleNodes, designTextNodes]);

  const getNodeConnectorPoint = useCallback((nodeId: string, side: 'left' | 'right') => {
    const frame = getNodeFrame(nodeId);
    if (!frame) {
      return null;
    }

    return {
      x: frame.x + (side === 'right' ? frame.width : 0),
      y: frame.y + frame.height / 2,
    };
  }, [getNodeFrame]);

  const connectionDraftPath = useMemo(() => {
    if (!connectionDraft) {
      return null;
    }

    const start = getNodeConnectorPoint(connectionDraft.fromId, 'right');
    if (!start) {
      return null;
    }

    return buildEdgePath(start, { x: connectionDraft.x, y: connectionDraft.y });
  }, [connectionDraft, getNodeConnectorPoint]);

  const getDesignWorldPoint = useCallback((clientX: number, clientY: number) => {
    const viewport = designBoardScrollRef.current;
    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;

    return {
      viewportX,
      viewportY,
      x: (viewportX - designCamera.x) / designZoom,
      y: (viewportY - designCamera.y) / designZoom,
    };
  }, [designCamera.x, designCamera.y, designZoom]);

  const worldToDesignViewportPoint = useCallback((x: number, y: number) => ({
    x: x * designZoom + designCamera.x,
    y: y * designZoom + designCamera.y,
  }), [designCamera.x, designCamera.y, designZoom]);

  const handleConnectorPointerMove = useCallback((event: PointerEvent) => {
    const draft = designConnectionRef.current;
    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!draft || !point) {
      return;
    }

    const nextDraft = { ...draft, x: point.x, y: point.y };
    designConnectionRef.current = nextDraft;
    setConnectionDraft(nextDraft);
  }, [getDesignWorldPoint]);

  const handleConnectorPointerUp = useCallback((event: PointerEvent) => {
    const draft = designConnectionRef.current;
    if (!draft || draft.pointerId !== event.pointerId) {
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const targetNodeId = target?.closest('[data-design-node-id]')?.getAttribute('data-design-node-id');
    if (targetNodeId) {
      appendEdge(draft.fromId, targetNodeId);
      const nodeType = getDesignNodeTypeById(targetNodeId) || 'flow';
      handleCanvasNodeClick(targetNodeId, nodeType);
    }

    designConnectionRef.current = null;
    setConnectionDraft(null);
    window.removeEventListener('pointermove', handleConnectorPointerMove);
    window.removeEventListener('pointerup', handleConnectorPointerUp);
    window.removeEventListener('pointercancel', handleConnectorPointerUp);
  }, [appendEdge, getDesignNodeTypeById, handleCanvasNodeClick, handleConnectorPointerMove]);

  const handleConnectorPointerDown = useCallback((nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const start = getNodeConnectorPoint(nodeId, 'right');
    if (!start) {
      return;
    }

    const draft = {
      fromId: nodeId,
      pointerId: event.pointerId,
      x: start.x,
      y: start.y,
    };

    bringDesignNodeToFront(nodeId);
    designConnectionRef.current = draft;
    setConnectionDraft(draft);
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handleConnectorPointerMove);
    window.addEventListener('pointerup', handleConnectorPointerUp);
    window.addEventListener('pointercancel', handleConnectorPointerUp);
  }, [bringDesignNodeToFront, getNodeConnectorPoint, handleConnectorPointerMove, handleConnectorPointerUp]);

  const handleDesignNodePointerMove = useCallback((event: PointerEvent) => {
    const dragState = designDragRef.current;
    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!dragState || !point) {
      return;
    }

    if (!dragState.moved && Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) > 4) {
      dragState.moved = true;
    }

    updateCanvasNodePosition(dragState.nodeId, dragState.nodeType, point.x - dragState.offsetX, point.y - dragState.offsetY);
  }, [getDesignWorldPoint, updateCanvasNodePosition]);

  const handleDesignNodePointerUp = useCallback((event: PointerEvent) => {
    const dragState = designDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    designDragRef.current = null;
    window.removeEventListener('pointermove', handleDesignNodePointerMove);
    window.removeEventListener('pointerup', handleDesignNodePointerUp);
    window.removeEventListener('pointercancel', handleDesignNodePointerUp);
  }, [handleDesignNodePointerMove]);

  const handleDesignNodePointerDown = useCallback((nodeId: string, nodeType: DesignNodeType, event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || isSpacePressed || target.closest('.design-node-control')) {
      return;
    }

    if (target.closest('.design-node-scroll-area')) {
      handleCanvasNodeClick(nodeId, nodeType);
      bringDesignNodeToFront(nodeId);
      return;
    }

    const card = event.currentTarget;
    handleCanvasNodeClick(nodeId, nodeType);
    const cardRect = card.getBoundingClientRect();
    bringDesignNodeToFront(nodeId);

    designDragRef.current = {
      nodeId,
      nodeType,
      pointerId: event.pointerId,
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: (event.clientX - cardRect.left) / designZoom,
      offsetY: (event.clientY - cardRect.top) / designZoom,
    };

    card.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handleDesignNodePointerMove);
    window.addEventListener('pointerup', handleDesignNodePointerUp);
    window.addEventListener('pointercancel', handleDesignNodePointerUp);
  }, [
    bringDesignNodeToFront,
    designZoom,
    handleCanvasNodeClick,
    handleDesignNodePointerMove,
    handleDesignNodePointerUp,
    isSpacePressed,
  ]);

  const zoomDesignBoardAtPoint = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = designBoardScrollRef.current;
    if (!viewport) {
      return;
    }

    const clampedZoom = clampZoom(nextZoom);
    const rect = viewport.getBoundingClientRect();
    const pointerX = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const pointerY = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    const contentX = (pointerX - designCamera.x) / designZoom;
    const contentY = (pointerY - designCamera.y) / designZoom;

    setDesignZoom(clampedZoom);
    setDesignCamera({
      x: pointerX - contentX * clampedZoom,
      y: pointerY - contentY * clampedZoom,
    });
  }, [designCamera.x, designCamera.y, designZoom]);

  const frameDesignBoard = useCallback((target?: { x: number; y: number; width: number; height: number }, zoomCap = 1) => {
    if (designBoardViewport.width <= 0 || designBoardViewport.height <= 0) {
      return;
    }

    const frame = target || designContentBounds;
    const padding = target ? 72 : 120;
    const availableWidth = Math.max(1, designBoardViewport.width - padding * 2);
    const availableHeight = Math.max(1, designBoardViewport.height - padding * 2);
    const zoomByWidth = availableWidth / Math.max(1, frame.width);
    const zoomByHeight = availableHeight / Math.max(1, frame.height);
    const nextZoom = clampZoom(Math.min(zoomCap, zoomByWidth, zoomByHeight));

    setDesignZoom(nextZoom);
    setDesignCamera({
      x: designBoardViewport.width / 2 - (frame.x + frame.width / 2) * nextZoom,
      y: designBoardViewport.height / 2 - (frame.y + frame.height / 2) * nextZoom,
    });
  }, [designBoardViewport.height, designBoardViewport.width, designContentBounds]);

  const designSelectionRect = useMemo(() => {
    if (!designMarqueeSelection) {
      return null;
    }

    return {
      x: worldToDesignViewportPoint(
        Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX),
        Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)
      ).x,
      y: worldToDesignViewportPoint(
        Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX),
        Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)
      ).y,
      width:
        (Math.max(designMarqueeSelection.startX, designMarqueeSelection.currentX) -
          Math.min(designMarqueeSelection.startX, designMarqueeSelection.currentX)) *
        designZoom,
      height:
        (Math.max(designMarqueeSelection.startY, designMarqueeSelection.currentY) -
          Math.min(designMarqueeSelection.startY, designMarqueeSelection.currentY)) *
        designZoom,
    };
  }, [designMarqueeSelection, designZoom, worldToDesignViewportPoint]);

  useEffect(() => {
    const viewport = designBoardScrollRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') {
      return;
    }

    const syncViewport = () => {
      setDesignBoardViewport({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const preventBrowserZoomWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();
    };

    const preventBrowserZoomKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const blockedKeys = ['=', '+', '-', '_', '0'];
      const blockedCodes = ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'];
      if (!blockedKeys.includes(event.key) && !blockedCodes.includes(event.code)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('wheel', preventBrowserZoomWheel, { passive: false, capture: true });
    window.addEventListener('keydown', preventBrowserZoomKey, { capture: true });

    return () => {
      window.removeEventListener('wheel', preventBrowserZoomWheel, { capture: true });
      window.removeEventListener('keydown', preventBrowserZoomKey, { capture: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (hasAutoFramedDesignBoardRef.current) {
      return;
    }

    const hasContent =
      designPagesLength > 0 ||
      designFlowNodes.length > 0 ||
      designTextNodes.length > 0 ||
      designAINodes.length > 0 ||
      designStyleNodes.length > 0;
    if (!hasContent || designBoardViewport.width <= 0 || designBoardViewport.height <= 0) {
      return;
    }

    hasAutoFramedDesignBoardRef.current = true;
    frameDesignBoard();
  }, [
    designAINodes.length,
    designBoardViewport.height,
    designBoardViewport.width,
    designFlowNodes.length,
    designPagesLength,
    designStyleNodes.length,
    designTextNodes.length,
    frameDesignBoard,
  ]);

  const handleDesignBoardWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isEditingField = Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();

      if (isEditingField) {
        return;
      }

      const nextZoom = clampZoom(designZoom * Math.exp(-event.deltaY * DESIGN_ZOOM_STEP));
      if (Math.abs(nextZoom - designZoom) < 0.001) {
        return;
      }

      zoomDesignBoardAtPoint(nextZoom, event.clientX, event.clientY);
      return;
    }

    if (isEditingField) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = Math.abs(event.deltaX) > 0.5 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const deltaY = event.shiftKey && Math.abs(event.deltaX) < 0.5 ? 0 : event.deltaY;
    setDesignCamera((current) => ({
      x: current.x - deltaX,
      y: current.y - deltaY,
    }));
  }, [designZoom, zoomDesignBoardAtPoint]);

  const handleScrollableAreaWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const canScrollY = element.scrollHeight > element.clientHeight + 1;
    const canScrollX = element.scrollWidth > element.clientWidth + 1;

    event.stopPropagation();

    if (!canScrollX && !canScrollY) {
      return;
    }

    event.preventDefault();
    element.scrollBy({
      left: canScrollX ? event.deltaX : 0,
      top: canScrollY ? event.deltaY : 0,
      behavior: 'auto',
    });
  }, []);

  const handleDesignBoardContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-design-node-id], .design-inspector-panel, .design-workbench-topbar, .design-bottom-bar')) {
      return;
    }

    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.preventDefault();
    setDesignCanvasSelection(null);
    setDesignSelectionIds([]);
    setDesignCanvasContextMenu({
      type: 'canvas',
      clientX: event.clientX,
      clientY: event.clientY,
      viewportX: point.viewportX,
      viewportY: point.viewportY,
      boardX: point.x,
      boardY: point.y,
      submenu: null,
    });
  }, [getDesignWorldPoint, setDesignCanvasSelection, setDesignSelectionIds]);

  const handleDesignMarqueePointerMove = useCallback((event: PointerEvent) => {
    const draft = designMarqueeRef.current;
    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!draft || !point) {
      return;
    }

    const nextDraft = { ...draft, currentX: point.x, currentY: point.y };
    designMarqueeRef.current = nextDraft;
    setDesignMarqueeSelection(nextDraft);
  }, [getDesignWorldPoint]);

  const handleDesignMarqueePointerUp = useCallback((event: PointerEvent) => {
    const draft = designMarqueeRef.current;
    if (!draft || draft.pointerId !== event.pointerId) {
      return;
    }

    const nextRect = {
      left: Math.min(draft.startX, draft.currentX),
      right: Math.max(draft.startX, draft.currentX),
      top: Math.min(draft.startY, draft.currentY),
      bottom: Math.max(draft.startY, draft.currentY),
    };

    const nextSelectedIds = [
      ...designPageNodes.map((node) => ({ id: node.id, frame: node })),
      ...designFlowNodes.map((node) => ({ id: node.id, frame: node })),
      ...designTextNodes.map((node) => ({ id: node.id, frame: node })),
      ...designAINodes.map((node) => ({ id: node.id, frame: node })),
      ...designStyleNodes.map((node) => ({ id: node.id, frame: node })),
    ]
      .filter(({ frame }) => {
        const left = frame.x;
        const right = left + frame.width;
        const top = frame.y;
        const bottom = top + frame.height;

        return !(right < nextRect.left || left > nextRect.right || bottom < nextRect.top || top > nextRect.bottom);
      })
      .map(({ id }) => id);

    if (nextRect.right - nextRect.left < 6 && nextRect.bottom - nextRect.top < 6) {
      setDesignSelectionIds([]);
      setDesignCanvasSelection(null);
    } else {
      setDesignSelectionIds(nextSelectedIds);
      if (nextSelectedIds.length === 1) {
        const nodeType = getDesignNodeTypeById(nextSelectedIds[0]);
        if (nodeType) {
          handleCanvasNodeClick(nextSelectedIds[0], nodeType);
        }
      } else {
        setDesignCanvasSelection(null);
      }
    }

    designMarqueeRef.current = null;
    setDesignMarqueeSelection(null);
    window.removeEventListener('pointermove', handleDesignMarqueePointerMove);
    window.removeEventListener('pointerup', handleDesignMarqueePointerUp);
    window.removeEventListener('pointercancel', handleDesignMarqueePointerUp);
  }, [
    designAINodes,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
    getDesignNodeTypeById,
    handleCanvasNodeClick,
    handleDesignMarqueePointerMove,
    setDesignCanvasSelection,
    setDesignSelectionIds,
  ]);

  const handleDesignNodeContextMenu = useCallback((nodeId: string, nodeType: DesignNodeType, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    handleCanvasNodeClick(nodeId, nodeType);
    setDesignCanvasContextMenu({
      type: 'node',
      clientX: event.clientX,
      clientY: event.clientY,
      viewportX: point.viewportX,
      viewportY: point.viewportY,
      boardX: point.x,
      boardY: point.y,
      nodeId,
      nodeType,
    });
  }, [getDesignWorldPoint, handleCanvasNodeClick]);

  const handleDesignBoardPointerMove = useCallback((event: PointerEvent) => {
    const panState = designPanRef.current;
    if (!panState) {
      return;
    }

    if (!panState.moved && Math.hypot(event.clientX - panState.startX, event.clientY - panState.startY) > 4) {
      panState.moved = true;
    }

    setDesignCamera({
      x: panState.startCameraX + (event.clientX - panState.startX),
      y: panState.startCameraY + (event.clientY - panState.startY),
    });
  }, []);

  const handleDesignBoardPointerUp = useCallback((event: PointerEvent) => {
    const panState = designPanRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    if (panState.clearSelectionOnRelease && !panState.moved) {
      setDesignSelectionIds([]);
      setDesignCanvasSelection(null);
      setDesignCanvasContextMenu(null);
      setSelectedDesignPageId(null);
    }

    designPanRef.current = null;
    setIsCanvasPanning(false);
    window.removeEventListener('pointermove', handleDesignBoardPointerMove);
    window.removeEventListener('pointerup', handleDesignBoardPointerUp);
    window.removeEventListener('pointercancel', handleDesignBoardPointerUp);
  }, [handleDesignBoardPointerMove, setDesignCanvasSelection, setDesignSelectionIds, setSelectedDesignPageId]);

  const handleDesignBoardPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = designBoardScrollRef.current;
    const target = event.target as HTMLElement;
    const hitProtectedLayer = target.closest(
      '.design-inspector-panel, .design-workbench-topbar, .design-workbench-note, .design-bottom-bar, .design-sketch-library, .design-context-menu, .design-sketch-library-toggle'
    );
    const hitNodeLayer = target.closest('[data-design-node-id], .design-node-control, .design-node-inline-input, .design-node-inline-textarea');
    const shouldStartMarquee =
      event.button === 0 && !isSpacePressed && !hitNodeLayer && (designCanvasMode === 'select' || event.shiftKey);
    const shouldStartPan =
      isSpacePressed ||
      event.button === 1 ||
      (event.button === 0 && !shouldStartMarquee && !hitNodeLayer);

    if (hitProtectedLayer) {
      return;
    }

    if (shouldStartPan) {
      if (!viewport) {
        return;
      }

      designPanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCameraX: designCamera.x,
        startCameraY: designCamera.y,
        moved: false,
        clearSelectionOnRelease: event.button === 0 && !isSpacePressed,
      };

      setIsCanvasPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handleDesignBoardPointerMove);
      window.addEventListener('pointerup', handleDesignBoardPointerUp);
      window.addEventListener('pointercancel', handleDesignBoardPointerUp);
      event.preventDefault();
      return;
    }

    if (event.button !== 0 || isSpacePressed || (!event.shiftKey && designCanvasMode !== 'select') || hitNodeLayer) {
      return;
    }

    const point = getDesignWorldPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const draft = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };

    setDesignCanvasContextMenu(null);
    designMarqueeRef.current = draft;
    setDesignMarqueeSelection(draft);
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handleDesignMarqueePointerMove);
    window.addEventListener('pointerup', handleDesignMarqueePointerUp);
    window.addEventListener('pointercancel', handleDesignMarqueePointerUp);
    event.preventDefault();
  }, [
    designCamera.x,
    designCamera.y,
    designCanvasMode,
    getDesignWorldPoint,
    handleDesignBoardPointerMove,
    handleDesignBoardPointerUp,
    handleDesignMarqueePointerMove,
    handleDesignMarqueePointerUp,
    isSpacePressed,
  ]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleDesignNodePointerMove);
    window.removeEventListener('pointerup', handleDesignNodePointerUp);
    window.removeEventListener('pointercancel', handleDesignNodePointerUp);
  }, [handleDesignNodePointerMove, handleDesignNodePointerUp]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleConnectorPointerMove);
    window.removeEventListener('pointerup', handleConnectorPointerUp);
    window.removeEventListener('pointercancel', handleConnectorPointerUp);
  }, [handleConnectorPointerMove, handleConnectorPointerUp]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleDesignBoardPointerMove);
    window.removeEventListener('pointerup', handleDesignBoardPointerUp);
    window.removeEventListener('pointercancel', handleDesignBoardPointerUp);
  }, [handleDesignBoardPointerMove, handleDesignBoardPointerUp]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleDesignMarqueePointerMove);
    window.removeEventListener('pointerup', handleDesignMarqueePointerUp);
    window.removeEventListener('pointercancel', handleDesignMarqueePointerUp);
  }, [handleDesignMarqueePointerMove, handleDesignMarqueePointerUp]);

  useEffect(() => {
    if (!designCanvasContextMenu) {
      return;
    }

    const closeMenu = () => {
      setDesignCanvasContextMenu(null);
    };

    const handleWindowScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && designContextMenuRef.current?.contains(target)) {
        return;
      }

      setDesignCanvasContextMenu(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', handleWindowScroll, true);

    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', handleWindowScroll, true);
    };
  }, [designCanvasContextMenu]);

  return {
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
    isConnectorMode: false,
    isSpacePressed,
    pendingConnectionStartId: connectionDraft?.fromId ?? null,
    setDesignCanvasSelection,
    setDesignCanvasContextMenu,
    setDesignCanvasMode,
    setDesignSelectionIds,
  };
};
