import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Rect, Stage, Text } from 'react-konva';
import { usePreviewStore } from '../../store/previewStore';
import { CanvasElement } from '../../types';
import { MIN_MODULE_HEIGHT, MIN_MODULE_WIDTH, snapToGrid } from '../../utils/wireframe';

interface CanvasProps {
  width?: number;
  height?: number;
  frameType?: 'mobile' | 'browser';
}

interface ElementRendererProps {
  element: CanvasElement;
  isSelected: boolean;
  gridSize: number;
  scale: number;
  interactionMode: 'select' | 'pan';
  palette: CanvasPalette;
  onSelect: (id: string) => void;
  onDragEnd: (element: CanvasElement, x: number, y: number) => void;
  onResize: (element: CanvasElement, width: number, height: number) => void;
  onContextMenu: (element: CanvasElement, clientX: number, clientY: number) => void;
}

interface CanvasPalette {
  stageFill: string;
  frameShell: string;
  frameInner: string;
  frameStroke: string;
  frameShadow: string;
  boardFill: string;
  boardStroke: string;
  browserBar: string;
  browserAddress: string;
  browserRed: string;
  browserYellow: string;
  browserGreen: string;
  deviceNotch: string;
  moduleFill: string;
  moduleHeader: string;
  moduleText: string;
  moduleMuted: string;
  moduleStroke: string;
  moduleSelected: string;
  accent: string;
}

const GRID_SIZE = 4;

const readCssVariable = (styles: CSSStyleDeclaration, name: string, fallback: string) =>
  styles.getPropertyValue(name).trim() || fallback;

const getModuleLabel = (element: CanvasElement) =>
  String(element.props.name || element.props.title || element.props.text || '模块');

const getModuleContent = (element: CanvasElement) =>
  String(element.props.content || element.props.placeholder || element.props.text || '');

const getContentPreview = (content: string, width: number, height: number) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '双击右侧列表可继续补充内容';
  }

  const charsPerLine = Math.max(10, Math.floor(Math.max(width - 28, 40) / 7));
  const maxLines = Math.max(1, Math.floor(Math.max(height - 58, 16) / 16));
  const maxChars = Math.max(charsPerLine * maxLines, 24);

  return normalized.length > maxChars ? `${normalized.slice(0, Math.max(maxChars - 3, 1))}...` : normalized;
};

const getPointerClientPosition = (
  event: MouseEvent | TouchEvent | PointerEvent | undefined | null
): { x: number; y: number } | null => {
  if (!event) {
    return null;
  }

  if ('touches' in event && event.touches.length > 0) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }

  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }

  if ('clientX' in event && 'clientY' in event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return null;
};

const hasCanvasElementAncestor = (target: any): boolean => {
  let current = target;

  while (current) {
    if (typeof current.id === 'function' && String(current.id()).startsWith('node-')) {
      return true;
    }

    current = typeof current.getParent === 'function' ? current.getParent() : null;
  }

  return false;
};

const getFrameChrome = (frameType: 'mobile' | 'browser', width: number, height: number) => {
  if (frameType === 'mobile') {
    return {
      offsetX: 24,
      offsetY: 42,
      outerWidth: width + 48,
      outerHeight: height + 84,
      cornerRadius: 40,
      innerInset: 10,
      boardCornerRadius: 28,
      notchWidth: Math.min(132, Math.max(92, width * 0.32)),
    };
  }

  return {
    offsetX: 18,
    offsetY: 64,
    outerWidth: width + 36,
    outerHeight: height + 82,
    cornerRadius: 24,
    innerInset: 10,
    boardCornerRadius: 20,
    notchWidth: 0,
  };
};

const ElementRenderer = memo<ElementRendererProps>(({
  element,
  isSelected,
  gridSize,
  scale,
  interactionMode,
  palette,
  onSelect,
  onDragEnd,
  onResize,
  onContextMenu,
}) => {
  const elementWidth = Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH;
  const elementHeight = Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT;
  const label = getModuleLabel(element);
  const content = getContentPreview(getModuleContent(element), elementWidth, elementHeight);
  const handleSize = 12;
  const isSelectMode = interactionMode === 'select';
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  const handleMouseDown = (e: any) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    const container = stage.container();
    const stageLeft = container.getBoundingClientRect().left;
    const stageTop = container.getBoundingClientRect().top;

    const getStagePos = (clientX: number, clientY: number) => ({
      x: (clientX - stageLeft) / scale,
      y: (clientY - stageTop) / scale,
    });

    const startClientPos = getPointerClientPosition(e.evt);
    if (!startClientPos) {
      return;
    }

    const startPos = getStagePos(startClientPos.x, startClientPos.y);

    resizeRef.current = {
      startX: startPos.x,
      startY: startPos.y,
      startWidth: elementWidth,
      startHeight: elementHeight,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) {
        return;
      }

      const pos = getStagePos(moveEvent.clientX, moveEvent.clientY);
      const dx = pos.x - resizeRef.current.startX;
      const dy = pos.y - resizeRef.current.startY;
      const newWidth = Math.max(MIN_MODULE_WIDTH, Math.round(resizeRef.current.startWidth + dx));
      const newHeight = Math.max(MIN_MODULE_HEIGHT, Math.round(resizeRef.current.startHeight + dy));
      onResize(element, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <Group
      id={`node-${element.id}`}
      x={element.x}
      y={element.y}
      draggable={isSelectMode}
      dragBoundFunc={(pos) => ({
        x: snapToGrid(pos.x, gridSize),
        y: snapToGrid(pos.y, gridSize),
      })}
      onClick={() => {
        if (isSelectMode) {
          onSelect(element.id);
        }
      }}
      onTap={() => {
        if (isSelectMode) {
          onSelect(element.id);
        }
      }}
      onDragEnd={(event) => {
        if (isSelectMode) {
          onDragEnd(element, event.target.x(), event.target.y());
        }
      }}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        onContextMenu(element, e.evt.clientX, e.evt.clientY);
      }}
    >
      <Rect
        width={elementWidth}
        height={elementHeight}
        fill={palette.moduleFill}
        stroke={isSelected ? palette.moduleSelected : palette.moduleStroke}
        strokeWidth={isSelected ? 2 : 1.5}
        cornerRadius={16}
        shadowColor="rgba(0, 0, 0, 0.28)"
        shadowBlur={isSelected ? 18 : 10}
        shadowOpacity={isSelected ? 0.28 : 0.16}
        shadowOffsetY={isSelected ? 10 : 6}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
      <Rect
        width={elementWidth}
        height={36}
        fill={palette.moduleHeader}
        cornerRadius={[16, 16, 0, 0]}
        perfectDrawEnabled={false}
        listening={false}
      />
      <Text
        text={label}
        x={14}
        y={10}
        width={Math.max(elementWidth - 28, 24)}
        fontSize={13}
        fontStyle="bold"
        fill={palette.moduleText}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        text={content}
        x={14}
        y={48}
        width={Math.max(elementWidth - 28, 24)}
        height={Math.max(elementHeight - 60, 16)}
        fontSize={11}
        fill={palette.moduleMuted}
        lineHeight={1.45}
        listening={false}
        perfectDrawEnabled={false}
      />
      {isSelected && isSelectMode && (
        <Rect
          x={elementWidth - handleSize}
          y={elementHeight - handleSize}
          width={handleSize}
          height={handleSize}
          fill={palette.accent}
          cornerRadius={2}
          cursor="se-resize"
          onMouseDown={handleMouseDown}
        />
      )}
    </Group>
  );
});

export const Canvas = memo<CanvasProps>(({
  width = 800,
  height = 600,
  frameType = 'browser',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const deleteElement = usePreviewStore((state) => state.deleteElement);
  const moveElement = usePreviewStore((state) => state.moveElement);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const updateElement = usePreviewStore((state) => state.updateElement);
  const [viewportSize, setViewportSize] = useState({ width, height });
  const [scale, setScale] = useState(0.92);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletePopup, setDeletePopup] = useState<{ visible: boolean; x: number; y: number; elementIds: string[] }>({
    visible: false,
    x: 0,
    y: 0,
    elementIds: [],
  });
  const deletePopupRef = useRef<{ elementIds: string[] }>({ elementIds: [] });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panSessionRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const hasManualViewportRef = useRef(false);
  const skipStoreSelectionSyncRef = useRef(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const boardHeight = height;
  const canvasViewportHeight = useMemo(
    () => Math.max(680, Math.ceil(boardHeight * scale + (frameType === 'mobile' ? 140 : 120))),
    [boardHeight, frameType, scale]
  );
  const frameChrome = useMemo(
    () => getFrameChrome(frameType, width, boardHeight),
    [boardHeight, frameType, width]
  );
  const fitScale = useMemo(() => {
    const safeWidth = Math.max(320, viewportSize.width - (frameType === 'mobile' ? 120 : 88));
    const safeHeight = Math.max(320, viewportSize.height - (frameType === 'mobile' ? 132 : 104));
    const nextScale = Math.min(safeWidth / frameChrome.outerWidth, safeHeight / frameChrome.outerHeight);

    return Math.min(Math.max(nextScale, 0.72), frameType === 'mobile' ? 0.96 : 1.06);
  }, [frameChrome.outerHeight, frameChrome.outerWidth, frameType, viewportSize.height, viewportSize.width]);
  const palette = useMemo<CanvasPalette>(() => {
    if (typeof window === 'undefined') {
      return {
        stageFill: '#15171c',
        frameShell: '#22252c',
        frameInner: '#101318',
        frameStroke: 'rgba(255, 255, 255, 0.08)',
        frameShadow: 'rgba(0, 0, 0, 0.42)',
        boardFill: '#f8fafc',
        boardStroke: 'rgba(148, 163, 184, 0.28)',
        browserBar: '#14181f',
        browserAddress: 'rgba(255, 255, 255, 0.08)',
        browserRed: '#ff6b6b',
        browserYellow: '#ffd166',
        browserGreen: '#06d6a0',
        deviceNotch: '#05070b',
        moduleFill: '#f7f7f6',
        moduleHeader: '#efefec',
        moduleText: '#14171b',
        moduleMuted: '#475d69',
        moduleStroke: '#76808d',
        moduleSelected: '#8be9d6',
        accent: '#8be9d6',
      };
    }

    const styles = window.getComputedStyle(document.documentElement);

    return {
      stageFill: readCssVariable(styles, '--canvas-stage-fill', '#15171c'),
      frameShell: readCssVariable(styles, '--canvas-frame-shell', '#22252c'),
      frameInner: readCssVariable(styles, '--canvas-frame-inner', '#101318'),
      frameStroke: readCssVariable(styles, '--canvas-frame-stroke', 'rgba(255, 255, 255, 0.08)'),
      frameShadow: readCssVariable(styles, '--canvas-frame-shadow', 'rgba(0, 0, 0, 0.42)'),
      boardFill: readCssVariable(styles, '--canvas-board-fill', '#f8fafc'),
      boardStroke: readCssVariable(styles, '--canvas-board-stroke', 'rgba(148, 163, 184, 0.28)'),
      browserBar: readCssVariable(styles, '--canvas-browser-bar', '#14181f'),
      browserAddress: readCssVariable(styles, '--canvas-browser-address', 'rgba(255, 255, 255, 0.08)'),
      browserRed: readCssVariable(styles, '--canvas-browser-red', '#ff6b6b'),
      browserYellow: readCssVariable(styles, '--canvas-browser-yellow', '#ffd166'),
      browserGreen: readCssVariable(styles, '--canvas-browser-green', '#06d6a0'),
      deviceNotch: readCssVariable(styles, '--canvas-device-notch', '#05070b'),
      moduleFill: readCssVariable(styles, '--canvas-module-fill', '#f7f7f6'),
      moduleHeader: readCssVariable(styles, '--canvas-module-header', '#efefec'),
      moduleText: readCssVariable(styles, '--canvas-module-text', '#14171b'),
      moduleMuted: readCssVariable(styles, '--canvas-module-muted', '#475d69'),
      moduleStroke: readCssVariable(styles, '--canvas-module-stroke', '#76808d'),
      moduleSelected: readCssVariable(styles, '--canvas-module-selected', '#8be9d6'),
      accent: readCssVariable(styles, '--mode-accent', '#8be9d6'),
    };
  }, [themeVersion]);

  const stageMetrics = useMemo(() => {
    // Stage needs to be large enough to contain scaled content without clipping
    const scaledWidth = Math.max(viewportSize.width, width * scale);
    const scaledHeight = Math.max(viewportSize.height, boardHeight * scale);
    return {
      stageWidth: scaledWidth,
      stageHeight: scaledHeight,
      frameX: (scaledWidth - width) / 2,
      frameY: (scaledHeight - boardHeight) / 2,
    };
  }, [boardHeight, scale, viewportSize.height, viewportSize.width, width]);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setThemeVersion((current) => current + 1);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) {
        return;
      }

      const bounds = containerRef.current.getBoundingClientRect();
      setViewportSize({
        width: Math.max(420, Math.floor(bounds.width)),
        height: Math.max(560, Math.floor(bounds.height)),
      });
    };

    updateSize();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = setTimeout(updateSize, 100);
    }) : null;

    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    } else {
      window.addEventListener('resize', updateSize);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      hasManualViewportRef.current = true;
      setScale((previous) => Math.min(Math.max(previous + delta, 0.25), 3));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (skipStoreSelectionSyncRef.current) {
      skipStoreSelectionSyncRef.current = false;
      return;
    }

    setSelectedIds(selectedElementId ? [selectedElementId] : []);
  }, [selectedElementId]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => elements.some((element) => element.id === id)));
  }, [elements]);

  useEffect(() => {
    if (selectedIds.length === 0 && deletePopup.visible) {
      setDeletePopup((current) => ({ ...current, visible: false, elementIds: [] }));
    }
  }, [selectedIds, deletePopup.visible]);

  useEffect(() => {
    if (hasManualViewportRef.current) {
      return;
    }

    setViewportOffset({
      x: viewportSize.width * (1 - scale) / 2,
      y: viewportSize.height * (1 - scale) / 2,
    });
  }, [scale, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (hasManualViewportRef.current) {
      return;
    }

    setScale(fitScale);
  }, [fitScale]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      setIsSpacePressed(false);
      setIsPanning(false);
      panSessionRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, []);

  useEffect(() => {
    if (!isPanning) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!panSessionRef.current) {
        return;
      }

      setViewportOffset({
        x: panSessionRef.current.originX + event.clientX - panSessionRef.current.startX,
        y: panSessionRef.current.originY + event.clientY - panSessionRef.current.startY,
      });
    };

    const handleMouseUp = () => {
      panSessionRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  useEffect(() => {
    const handleMouseUp = () => {
      panSessionRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const applyCanvasSelection = useCallback((nextIds: string[], primaryId?: string | null) => {
    setSelectedIds(nextIds);
    skipStoreSelectionSyncRef.current = true;
    selectElement(primaryId ?? nextIds[0] ?? null);
  }, [selectElement]);

  const openDeletePopup = useCallback((clientX: number, clientY: number, elementIds: string[]) => {
    const container = containerRef.current;
    if (!container || elementIds.length === 0) {
      return;
    }

    const rect = container.getBoundingClientRect();
    deletePopupRef.current = { elementIds };
    setDeletePopup({
      visible: true,
      x: clientX - rect.left,
      y: clientY - rect.top,
      elementIds,
    });
  }, []);

  const clearDeletePopup = useCallback(() => {
    setDeletePopup((current) => ({ ...current, visible: false, elementIds: [] }));
  }, []);

  const handleElementSelect = useCallback((id: string) => {
    clearDeletePopup();
    applyCanvasSelection([id], id);
  }, [applyCanvasSelection, clearDeletePopup]);

  const handleElementDragEnd = useCallback((element: CanvasElement, nextX: number, nextY: number) => {
    const snappedX = snapToGrid(nextX, GRID_SIZE);
    const snappedY = snapToGrid(nextY, GRID_SIZE);

    if (selectedIds.length > 1 && selectedIds.includes(element.id)) {
      const deltaX = snappedX - element.x;
      const deltaY = snappedY - element.y;

      elements
        .filter((item) => selectedIds.includes(item.id))
        .forEach((item) => {
          moveElement(
            item.id,
            snapToGrid(item.x + deltaX, GRID_SIZE),
            snapToGrid(item.y + deltaY, GRID_SIZE)
          );
        });
      return;
    }

    moveElement(element.id, snappedX, snappedY);
  }, [elements, moveElement, selectedIds]);

  const handleElementResize = useCallback((element: CanvasElement, nextWidth: number, nextHeight: number) => {
    updateElement(
      element.id,
      {
        ...element,
        width: Math.max(MIN_MODULE_WIDTH, Math.round(nextWidth)),
        height: Math.max(MIN_MODULE_HEIGHT, Math.round(nextHeight)),
      }
    );
  }, [updateElement]);

  const handleElementContextMenu = useCallback((element: CanvasElement, clientX: number, clientY: number) => {
    const nextSelectedIds = selectedIds.includes(element.id) ? selectedIds : [element.id];
    if (!selectedIds.includes(element.id)) {
      applyCanvasSelection(nextSelectedIds, element.id);
    }
    openDeletePopup(clientX, clientY, nextSelectedIds);
  }, [applyCanvasSelection, openDeletePopup, selectedIds]);

  const getBoardPoint = useCallback((clientX: number, clientY: number, clampToBoard = false) => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    const stageX = (clientX - rect.left - viewportOffset.x) / scale;
    const stageY = (clientY - rect.top - viewportOffset.y) / scale;
    const localX = stageX - stageMetrics.frameX;
    const localY = stageY - stageMetrics.frameY;

    if (clampToBoard) {
      return {
        x: Math.max(0, Math.min(width, localX)),
        y: Math.max(0, Math.min(boardHeight, localY)),
      };
    }

    return { x: localX, y: localY };
  }, [boardHeight, scale, stageMetrics.frameX, stageMetrics.frameY, viewportOffset.x, viewportOffset.y, width]);

  const deleteSelectedElements = useCallback(() => {
    const idsToDelete = deletePopupRef.current?.elementIds ?? [];
    setDeletePopup({ visible: false, x: 0, y: 0, elementIds: [] });
    idsToDelete.forEach((id) => deleteElement(id));
    applyCanvasSelection([]);
  }, [applyCanvasSelection, deleteElement]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      selectedIds.forEach((id) => deleteElement(id));
      applyCanvasSelection([]);
      clearDeletePopup();
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [applyCanvasSelection, clearDeletePopup, deleteElement, selectedIds]);

  const selectionRect = useMemo(() => {
    if (!selectionBox) {
      return null;
    }

    return {
      x: Math.min(selectionBox.startX, selectionBox.currentX),
      y: Math.min(selectionBox.startY, selectionBox.currentY),
      width: Math.abs(selectionBox.currentX - selectionBox.startX),
      height: Math.abs(selectionBox.currentY - selectionBox.startY),
    };
  }, [selectionBox]);

  return (
    <div
      ref={containerRef}
      onMouseDownCapture={(event) => {
        if ((event.target as HTMLElement | null)?.closest?.('[data-canvas-delete-popup="true"]')) {
          return;
        }

        clearDeletePopup();

        const canStartPan = event.button === 1 || (isSpacePressed && event.button === 0);
        if (!canStartPan) {
          return;
        }

        event.preventDefault();
        hasManualViewportRef.current = true;
        setIsPanning(true);
        panSessionRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          originX: viewportOffset.x,
          originY: viewportOffset.y,
        };
      }}
      style={{
        flex: 1,
        minHeight: `${canvasViewportHeight}px`,
        height: `${canvasViewportHeight}px`,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default',
      }}
    >
      {deletePopup.visible && (
        <div
          data-canvas-delete-popup="true"
          style={{
            position: 'absolute',
            top: deletePopup.y,
            left: deletePopup.x,
            zIndex: 9999,
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--canvas-toolbar-border)',
            background: 'var(--canvas-toolbar-bg)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ color: 'var(--canvas-toolbar-text)', fontSize: '13px', marginBottom: '8px' }}>
            {deletePopup.elementIds.length > 1 ? `确定删除所选 ${deletePopup.elementIds.length} 个模块？` : '确定删除此模块？'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
            onClick={deleteSelectedElements}
              style={{
                border: 'none',
                borderRadius: '8px',
                background: 'var(--canvas-danger-bg)',
                color: 'var(--canvas-danger-text)',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              删除
            </button>
            <button
              type="button"
              onClick={clearDeletePopup}
              style={{
                border: '1px solid var(--canvas-toolbar-border)',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--canvas-toolbar-text)',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div
        className={`design-board-scroll page-canvas-board ${isSpacePressed ? 'is-space-panning' : ''} ${isPanning ? 'is-panning' : ''} is-select-mode`}
        style={{
          borderRadius: '28px',
          border: '1px solid rgba(148, 163, 184, 0.16)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 18px 44px rgba(2, 8, 23, 0.18)',
        }}
      >
        <Stage
          width={viewportSize.width}
          height={viewportSize.height}
          onMouseDown={(event) => {
              const target = event.target;
              const stage = target.getStage();

              clearDeletePopup();

              if (
                !stage ||
                event.evt.button !== 0 ||
                isSpacePressed ||
                hasCanvasElementAncestor(target)
              ) {
                return;
              }

              const point = getBoardPoint(event.evt.clientX, event.evt.clientY, true);
              if (!point) {
                applyCanvasSelection([]);
                return;
              }

              setSelectionBox({
                startX: point.x,
                startY: point.y,
                currentX: point.x,
                currentY: point.y,
              });
            }}
            onMouseMove={(event) => {
              if (!selectionBox) {
                return;
              }

              const point = getBoardPoint(event.evt.clientX, event.evt.clientY, true);
              if (!point) {
                return;
              }

              setSelectionBox((current) => current ? { ...current, currentX: point.x, currentY: point.y } : current);
            }}
            onMouseUp={() => {
              if (!selectionBox) {
                return;
              }

              const nextRect = {
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                right: Math.max(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                bottom: Math.max(selectionBox.startY, selectionBox.currentY),
              };

              if (nextRect.right - nextRect.left < 4 && nextRect.bottom - nextRect.top < 4) {
                applyCanvasSelection([]);
                setSelectionBox(null);
                return;
              }

              const nextSelectedIds = elements
                .filter((element) => {
                  const left = element.x;
                  const right = element.x + element.width;
                  const top = element.y;
                  const bottom = element.y + element.height;

                  return !(right < nextRect.left || left > nextRect.right || bottom < nextRect.top || top > nextRect.bottom);
                })
                .map((element) => element.id);

              applyCanvasSelection(nextSelectedIds);
              setSelectionBox(null);
            }}
            onContextMenu={(event) => {
              event.evt.preventDefault();

              if (!hasCanvasElementAncestor(event.target)) {
                if (selectedIds.length > 0) {
                  openDeletePopup(event.evt.clientX, event.evt.clientY, selectedIds);
                } else {
                  clearDeletePopup();
                }
              }
            }}
          >
            <Layer>
              <Rect id="stage-bg" width={stageMetrics.stageWidth} height={stageMetrics.stageHeight} fill={palette.stageFill} listening={false} />
              <Group x={viewportOffset.x} y={viewportOffset.y} scaleX={scale} scaleY={scale}>
                <Group x={stageMetrics.frameX} y={stageMetrics.frameY}>
                  {frameType === 'mobile' ? (
                    <>
                      <Rect
                        x={-frameChrome.offsetX}
                        y={-frameChrome.offsetY}
                        width={frameChrome.outerWidth}
                        height={frameChrome.outerHeight}
                        cornerRadius={frameChrome.cornerRadius}
                        fill={palette.frameShell}
                        stroke={palette.frameStroke}
                        strokeWidth={1.2}
                        shadowColor={palette.frameShadow}
                        shadowBlur={28}
                        shadowOpacity={0.28}
                        shadowOffsetY={18}
                        listening={false}
                      />
                      <Rect
                        x={-frameChrome.offsetX + frameChrome.innerInset}
                        y={-frameChrome.offsetY + frameChrome.innerInset}
                        width={frameChrome.outerWidth - frameChrome.innerInset * 2}
                        height={frameChrome.outerHeight - frameChrome.innerInset * 2}
                        cornerRadius={frameChrome.cornerRadius - 10}
                        fill={palette.frameInner}
                        listening={false}
                      />
                      <Rect
                        x={width / 2 - frameChrome.notchWidth / 2}
                        y={-frameChrome.offsetY + 14}
                        width={frameChrome.notchWidth}
                        height={18}
                        cornerRadius={999}
                        fill={palette.deviceNotch}
                        listening={false}
                      />
                    </>
                  ) : (
                    <>
                      <Rect
                        x={-frameChrome.offsetX}
                        y={-frameChrome.offsetY}
                        width={frameChrome.outerWidth}
                        height={frameChrome.outerHeight}
                        cornerRadius={frameChrome.cornerRadius}
                        fill={palette.frameShell}
                        stroke={palette.frameStroke}
                        strokeWidth={1.2}
                        shadowColor={palette.frameShadow}
                        shadowBlur={24}
                        shadowOpacity={0.22}
                        shadowOffsetY={16}
                        listening={false}
                      />
                      <Rect
                        x={-frameChrome.offsetX + frameChrome.innerInset}
                        y={-frameChrome.offsetY + frameChrome.innerInset}
                        width={frameChrome.outerWidth - frameChrome.innerInset * 2}
                        height={48}
                        cornerRadius={[frameChrome.cornerRadius - 8, frameChrome.cornerRadius - 8, 16, 16]}
                        fill={palette.browserBar}
                        listening={false}
                      />
                      <Circle x={-frameChrome.offsetX + 26} y={-frameChrome.offsetY + 34} radius={5} fill={palette.browserRed} listening={false} />
                      <Circle x={-frameChrome.offsetX + 44} y={-frameChrome.offsetY + 34} radius={5} fill={palette.browserYellow} listening={false} />
                      <Circle x={-frameChrome.offsetX + 62} y={-frameChrome.offsetY + 34} radius={5} fill={palette.browserGreen} listening={false} />
                      <Rect
                        x={Math.max(width * 0.22, 96)}
                        y={-frameChrome.offsetY + 23}
                        width={Math.min(width * 0.48, 420)}
                        height={22}
                        cornerRadius={999}
                        fill={palette.browserAddress}
                        listening={false}
                      />
                    </>
                  )}
                  <Rect
                    width={width}
                    height={boardHeight}
                    fill={palette.boardFill}
                    stroke={palette.boardStroke}
                    strokeWidth={1}
                    cornerRadius={frameChrome.boardCornerRadius}
                    listening={false}
                  />
                  {elements.map((element) => (
                    <ElementRenderer
                      key={element.id}
                      element={element}
                      isSelected={selectedIds.includes(element.id)}
                      gridSize={GRID_SIZE}
                      scale={scale}
                      interactionMode={isSpacePressed || isPanning ? 'pan' : 'select'}
                      palette={palette}
                      onSelect={handleElementSelect}
                      onDragEnd={handleElementDragEnd}
                      onResize={handleElementResize}
                      onContextMenu={handleElementContextMenu}
                    />
                  ))}
                  {selectionRect && (
                    <Rect
                      x={selectionRect.x}
                      y={selectionRect.y}
                      width={selectionRect.width}
                      height={selectionRect.height}
                      fill="rgba(139, 233, 214, 0.18)"
                      stroke={palette.accent}
                      dash={[6, 4]}
                      strokeWidth={1}
                      listening={false}
                    />
                  )}
                </Group>
              </Group>
            </Layer>
          </Stage>
        </div>

      {elements.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: '76px 24px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '18px 22px',
              borderRadius: '16px',
              background: 'var(--canvas-toolbar-bg)',
              border: '1px solid var(--canvas-toolbar-border)',
              color: 'var(--canvas-toolbar-muted)',
              textAlign: 'center',
              maxWidth: '320px',
            }}
          >
            <div style={{ fontSize: '14px', color: 'var(--canvas-toolbar-text)', marginBottom: '6px' }}>当前还没有模块</div>
            <div style={{ fontSize: '12px' }}>从顶部添加模块开始，空格可拖动画布，空白处可拉框多选。</div>
          </div>
        </div>
      )}
    </div>
  );
});
