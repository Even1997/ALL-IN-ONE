import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage, Text } from 'react-konva';
import { usePreviewStore } from '../../store/previewStore';
import { CanvasElement } from '../../types';
import { MIN_MODULE_HEIGHT, MIN_MODULE_WIDTH, snapToGrid } from '../../utils/wireframe';

interface CanvasProps {
  width?: number;
  height?: number;
  frameType?: 'mobile' | 'browser';
  frameLabel?: string;
  onAddModuleAt?: (position: { x: number; y: number }) => void;
}

interface ElementRendererProps {
  element: CanvasElement;
  isSelected: boolean;
  gridSize: number;
  scale: number;
  onSelect: (id: string) => void;
  onDragEnd: (element: CanvasElement, x: number, y: number) => void;
  onResize: (element: CanvasElement, width: number, height: number) => void;
}

const GRID_SIZE = 8;
const CANVAS_HEADER_HEIGHT = 60;

const isElementVisible = (
  element: CanvasElement,
  frameX: number,
  frameY: number,
  scrollX: number,
  scrollY: number,
  viewportWidth: number,
  viewportHeight: number
) => {
  const MARGIN = 100;
  const elemLeft = frameX + element.x;
  const elemRight = elemLeft + element.width;
  const elemTop = frameY + element.y;
  const elemBottom = elemTop + element.height;
  const viewLeft = scrollX - MARGIN;
  const viewTop = scrollY - MARGIN;
  const viewRight = scrollX + viewportWidth + MARGIN;
  const viewBottom = scrollY + viewportHeight + MARGIN;
  return !(elemRight < viewLeft || elemLeft > viewRight || elemBottom < viewTop || elemTop > viewBottom);
};

const getModuleLabel = (element: CanvasElement) =>
  String(element.props.name || element.props.title || element.props.text || '模块');

const getModuleContent = (element: CanvasElement) =>
  String(element.props.content || element.props.placeholder || element.props.text || '');

const getContentPreview = (content: string, width: number, height: number) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '双击右侧列表可继续补内容';
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

const ElementRenderer = memo<ElementRendererProps>(({
  element,
  isSelected,
  gridSize,
  scale,
  onSelect,
  onDragEnd,
  onResize,
}) => {
  const elementWidth = Number.isFinite(element.width) ? Math.max(MIN_MODULE_WIDTH, Math.round(element.width)) : MIN_MODULE_WIDTH;
  const elementHeight = Number.isFinite(element.height) ? Math.max(MIN_MODULE_HEIGHT, Math.round(element.height)) : MIN_MODULE_HEIGHT;
  const label = getModuleLabel(element);
  const content = getContentPreview(getModuleContent(element), elementWidth, elementHeight);
  const handleSize = 12;
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
      if (!resizeRef.current) return;
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
      draggable
      dragBoundFunc={(pos) => ({
        x: snapToGrid(pos.x, gridSize),
        y: snapToGrid(pos.y, gridSize),
      })}
      onClick={() => onSelect(element.id)}
      onTap={() => onSelect(element.id)}
      onDragEnd={(event) => onDragEnd(element, event.target.x(), event.target.y())}
    >
      <Rect
        width={elementWidth}
        height={elementHeight}
        fill="var(--canvas-module-fill)"
        stroke={isSelected ? 'var(--canvas-module-selected)' : 'var(--canvas-module-stroke)'}
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
        fill="var(--canvas-module-header)"
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
        fill="var(--canvas-module-text)"
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
        fill="var(--canvas-module-muted)"
        lineHeight={1.45}
        listening={false}
        perfectDrawEnabled={false}
      />
      {isSelected && (
        <Rect
          x={elementWidth - handleSize}
          y={elementHeight - handleSize}
          width={handleSize}
          height={handleSize}
          fill="var(--canvas-accent)"
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
  frameLabel = '线框画布',
  onAddModuleAt,
}) => {
  void frameType;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elements = usePreviewStore((state) => state.elements);
  const selectedElementId = usePreviewStore((state) => state.selectedElementId);
  const deleteElement = usePreviewStore((state) => state.deleteElement);
  const moveElement = usePreviewStore((state) => state.moveElement);
  const selectElement = usePreviewStore((state) => state.selectElement);
  const updateElement = usePreviewStore((state) => state.updateElement);
  const [viewportSize, setViewportSize] = useState({ width, height });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCenteredRef = useRef(false);
  const panStateRef = useRef<{ pointerX: number; pointerY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const stageMetrics = useMemo(() => {
    const sidePadding = Math.max(720, Math.round(viewportSize.width * 0.72));
    const topPadding = Math.max(220, Math.round(viewportSize.height * 0.28));
    const bottomPadding = Math.max(480, Math.round(viewportSize.height * 0.52));
    const stageWidth = Math.max(viewportSize.width + sidePadding * 2, width + sidePadding * 2);
    const stageHeight = Math.max(viewportSize.height + topPadding + bottomPadding, height + topPadding + bottomPadding);

    return {
      stageWidth,
      stageHeight,
      frameX: Math.max(sidePadding, Math.round((stageWidth - width) / 2)),
      frameY: Math.max(topPadding, 180),
    };
  }, [height, viewportSize.height, viewportSize.width, width]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasCenteredRef.current) {
      return;
    }

    const nextScrollLeft = Math.max(0, stageMetrics.frameX * scale - Math.max((viewportSize.width - width * scale) / 2, 0));
    const nextScrollTop = Math.max(0, stageMetrics.frameY * scale - Math.max((viewportSize.height - height * scale) / 2, 0) - 32);
    container.scrollLeft = nextScrollLeft;
    container.scrollTop = nextScrollTop;
    setScrollPos({ x: nextScrollLeft, y: nextScrollTop });
    hasCenteredRef.current = true;
  }, [height, scale, stageMetrics.frameX, stageMetrics.frameY, viewportSize.height, viewportSize.width, width]);

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
    const handlePointerMove = (event: MouseEvent) => {
      const container = containerRef.current;
      const panState = panStateRef.current;
      if (!container || !panState) {
        return;
      }

      const deltaX = event.clientX - panState.pointerX;
      const deltaY = event.clientY - panState.pointerY;
      container.scrollLeft = panState.scrollLeft - deltaX;
      container.scrollTop = panState.scrollTop - deltaY;
      setScrollPos({
        x: container.scrollLeft,
        y: container.scrollTop,
      });
    };

    const stopPanning = () => {
      const container = containerRef.current;
      if (!container || !panStateRef.current) {
        return;
      }

      panStateRef.current = null;
      container.style.cursor = 'grab';
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopPanning);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopPanning);
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (scrollTimerRef.current) return;

    scrollTimerRef.current = setTimeout(() => {
      setScrollPos({
        x: containerRef.current?.scrollLeft ?? 0,
        y: containerRef.current?.scrollTop ?? 0,
      });
      scrollTimerRef.current = null;
    }, 50);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.25), 3));
  }, []);

  const resetViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const nextScale = 1;
    const nextScrollLeft = Math.max(0, stageMetrics.frameX * nextScale - Math.max((viewportSize.width - width * nextScale) / 2, 0));
    const nextScrollTop = Math.max(0, stageMetrics.frameY * nextScale - Math.max((viewportSize.height - height * nextScale) / 2, 0) - 32);

    setScale(nextScale);
    container.scrollLeft = nextScrollLeft;
    container.scrollTop = nextScrollTop;
    setScrollPos({
      x: nextScrollLeft,
      y: nextScrollTop,
    });
  }, [height, stageMetrics.frameX, stageMetrics.frameY, viewportSize.height, viewportSize.width, width]);

  const visibleElements = useMemo(
    () => elements.filter((element) =>
      isElementVisible(
        element,
        stageMetrics.frameX,
        stageMetrics.frameY,
        scrollPos.x / scale,
        scrollPos.y / scale,
        viewportSize.width / scale,
        viewportSize.height / scale
      )
    ),
    [elements, scale, scrollPos.x, scrollPos.y, stageMetrics.frameX, stageMetrics.frameY, viewportSize.width, viewportSize.height]
  );

  const handleElementSelect = useCallback((id: string) => {
    selectElement(id);
  }, [selectElement]);

  const handleElementDragEnd = useCallback((element: CanvasElement, nextX: number, nextY: number) => {
    moveElement(
      element.id,
      snapToGrid(nextX, GRID_SIZE),
      snapToGrid(nextY, GRID_SIZE)
    );
  }, [moveElement]);

  const handleElementResize = useCallback((element: CanvasElement, width: number, height: number) => {
    updateElement(
      element.id,
      { ...element, width, height }
    );
  }, [updateElement]);

  const scaledStageWidth = Math.max(viewportSize.width, Math.ceil(stageMetrics.stageWidth * scale));
  const scaledStageHeight = Math.max(
    Math.max(viewportSize.height - CANVAS_HEADER_HEIGHT, 0),
    Math.ceil(stageMetrics.stageHeight * scale)
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        cursor: panStateRef.current ? 'grabbing' : 'grab',
        backgroundColor: 'var(--canvas-bg)',
        backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 20,
          zIndex: 10,
          padding: '10px 12px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderRadius: '18px',
          border: '1px solid var(--canvas-toolbar-border)',
          background: 'var(--canvas-toolbar-bg)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong style={{ color: 'var(--canvas-toolbar-text)', fontSize: '13px', letterSpacing: '-0.02em' }}>{frameLabel}</strong>
          <span style={{ color: 'var(--canvas-toolbar-muted)', fontSize: '11px' }}>
            拖动画布平移视角，右键空白快速加模块，Ctrl/Command + 滚轮缩放
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px',
          borderRadius: '18px',
          border: '1px solid var(--canvas-toolbar-border)',
          background: 'var(--canvas-toolbar-bg)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--canvas-toolbar-text)', fontSize: '11px' }}>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={resetViewport}
            style={{
              border: '1px solid var(--canvas-toolbar-border)',
              borderRadius: '999px',
              background: 'var(--canvas-chip-bg)',
              color: 'var(--canvas-toolbar-text)',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            回到中心
          </button>
        </div>
        {selectedElementId && (
          <button
            type="button"
            onClick={() => deleteElement(selectedElementId)}
            style={{
              border: 'none',
              borderRadius: '999px',
              background: 'var(--canvas-danger-bg)',
              color: 'var(--canvas-danger-text)',
              padding: '7px 12px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            删除选中模块
          </button>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          flex: '0 0 auto',
          width: scaledStageWidth,
          height: scaledStageHeight,
        }}
      >
        <div
          style={{
            width: stageMetrics.stageWidth,
            height: stageMetrics.stageHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <Stage
            width={stageMetrics.stageWidth}
            height={stageMetrics.stageHeight}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) {
                selectElement(null);
                if (event.evt.button === 0 && containerRef.current) {
                  panStateRef.current = {
                    pointerX: event.evt.clientX,
                    pointerY: event.evt.clientY,
                    scrollLeft: containerRef.current.scrollLeft,
                    scrollTop: containerRef.current.scrollTop,
                  };
                  containerRef.current.style.cursor = 'grabbing';
                }
              }
            }}
            onContextMenu={(event) => {
              if (!onAddModuleAt) {
                return;
              }

              event.evt.preventDefault();
              if (event.target !== event.target.getStage()) {
                return;
              }

              const stage = event.target.getStage();
              if (!stage) {
                return;
              }

              const rect = stage.container().getBoundingClientRect();
              const stageX = (event.evt.clientX - rect.left) / scale;
              const stageY = (event.evt.clientY - rect.top) / scale;
              const localX = snapToGrid(stageX - stageMetrics.frameX, GRID_SIZE);
              const localY = snapToGrid(stageY - stageMetrics.frameY, GRID_SIZE);

              onAddModuleAt({ x: localX, y: localY });
            }}
          >
            <Layer>
              <Rect width={stageMetrics.stageWidth} height={stageMetrics.stageHeight} fill="var(--canvas-bg)" listening={false} />
              <Group x={stageMetrics.frameX} y={stageMetrics.frameY}>
                {visibleElements.map((element) => (
                  <ElementRenderer
                    key={element.id}
                    element={element}
                    isSelected={element.id === selectedElementId}
                    gridSize={GRID_SIZE}
                    scale={scale}
                    onSelect={handleElementSelect}
                    onDragEnd={handleElementDragEnd}
                    onResize={handleElementResize}
                  />
                ))}
              </Group>
            </Layer>
          </Stage>

        </div>
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
            <div style={{ fontSize: '12px' }}>右键画布空白处可快速添加模块，或者先生成一份示例线框。</div>
          </div>
        </div>
      )}
    </div>
  );
});
