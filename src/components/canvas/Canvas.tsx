import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Group, Transformer, Line } from 'react-konva';
import { usePreviewStore } from '../../store/previewStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { CanvasElement } from '../../types';
import { scopeDetector } from '../../modules/scope-detector/ChangeScopeDetector';
import { KonvaEventObject } from 'konva/lib/Node';

interface CanvasProps {
  width?: number;
  height?: number;
  onElementChange?: (element: CanvasElement) => void;
}

const ELEMENT_COLORS: Record<string, string> = {
  button: '#007aff',
  input: '#ff2d55',
  text: '#30d158',
  image: '#ff9500',
  card: '#007aff',
  container: '#5856d6',
  list: '#00c7be',
  form: '#ff9500',
  table: '#32d3f4',
  modal: '#ff3b30',
  navbar: '#bf5af2',
  footer: '#8e8e93',
  sidebar: '#af52de',
  header: '#007aff',
  avatar: '#ff2d55',
  badge: '#30d158',
  checkbox: '#007aff',
  radio: '#ff9500',
  switch: '#5856d6',
  select: '#00c7be',
  textarea: '#ff9500',
  slider: '#32d3f4',
  progress: '#ff3b30',
  tooltip: '#bf5af2',
  alert: '#ff9500',
};

const ELEMENT_ICONS: Record<string, string> = {
  button: '🔘',
  input: '📝',
  text: '📃',
  image: '🖼️',
  card: '🃏',
  container: '📦',
  list: '📋',
  form: '📝',
  table: '📊',
  modal: '🪟',
  navbar: '🧭',
  footer: '📋',
  sidebar: '📐',
  header: '🏗️',
  avatar: '👤',
  badge: '🏷️',
  checkbox: '☑️',
  radio: '🔘',
  switch: '🔃',
  select: '📂',
  textarea: '📝',
  slider: '🎚️',
  progress: '📈',
  tooltip: '💬',
  alert: '⚠️',
};

interface ElementRendererProps {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (width: number, height: number) => void;
}

const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
}) => {
  const [, setIsDragging] = useState(false);
  const color = ELEMENT_COLORS[element.type] || '#6366F1';
  const icon = ELEMENT_ICONS[element.type] || '📦';

  const handleDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    setIsDragging(false);
    onDragEnd(e.target.x(), e.target.y());
  }, [onDragEnd]);

  const handleTransformEnd = useCallback((e: KonvaEventObject<Event>) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onTransformEnd(
      Math.max(20, node.width() * scaleX),
      Math.max(20, node.height() * scaleY)
    );
  }, [onTransformEnd]);

  const renderContent = () => {
    switch (element.type) {
      case 'button':
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill={color}
              cornerRadius={6}
              shadowColor="black"
              shadowBlur={isSelected ? 10 : 5}
              shadowOpacity={isSelected ? 0.3 : 0.1}
              shadowOffsetY={2}
            />
            <Text
              text={String(element.props.text || 'Button')}
              width={element.width}
              height={element.height}
              fontSize={14}
              fill="white"
              align="center"
              verticalAlign="middle"
              fontStyle="bold"
            />
          </>
        );

      case 'input':
      case 'textarea':
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill="white"
              stroke={color}
              strokeWidth={2}
              cornerRadius={4}
            />
            <Text
              text={String(element.props.placeholder || element.type === 'textarea' ? 'Enter text...' : 'Input...')}
              width={element.width}
              height={element.height}
              fontSize={12}
              fill="#9CA3AF"
              align="left"
              verticalAlign="middle"
              padding={10}
            />
          </>
        );

      case 'text':
        return (
          <Text
            text={String(element.props.text || 'Text')}
            width={element.width}
            height={element.height}
            fontSize={Number(element.props.fontSize) || 16}
            fill="#1F2937"
            verticalAlign="middle"
          />
        );

      case 'image':
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill="#F3F4F6"
              stroke={color}
              strokeWidth={2}
              cornerRadius={4}
            />
            <Text
              text="📷"
              width={element.width}
              height={element.height}
              fontSize={32}
              align="center"
              verticalAlign="middle"
            />
            <Text
              text="Upload Image"
              width={element.width}
              y={element.height - 30}
              fontSize={12}
              fill="#6B7280"
              align="center"
            />
          </>
        );

      case 'card':
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill="white"
              stroke={color}
              strokeWidth={2}
              cornerRadius={8}
              shadowColor="black"
              shadowBlur={10}
              shadowOpacity={0.1}
              shadowOffsetY={4}
            />
            <Rect
              width={element.width}
              height={40}
              fill={color}
              cornerRadius={[8, 8, 0, 0]}
            />
            <Text
              text={String(element.props.title || 'Card Title')}
              width={element.width}
              height={40}
              fontSize={14}
              fill="white"
              align="center"
              verticalAlign="middle"
              fontStyle="bold"
            />
            <Text
              text={String(element.props.content || 'Card content goes here')}
              width={element.width - 20}
              height={element.height - 60}
              x={10}
              y={50}
              fontSize={12}
              fill="#6B7280"
              verticalAlign="top"
            />
          </>
        );

      case 'navbar':
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill={color}
              shadowColor="black"
              shadowBlur={5}
              shadowOpacity={0.1}
              shadowOffsetY={2}
            />
            <Text
              text={String(element.props.title || 'Navigation')}
              width={element.width}
              height={element.height}
              fontSize={16}
              fill="white"
              align="left"
              verticalAlign="middle"
              padding={20}
              fontStyle="bold"
            />
          </>
        );

      default:
        return (
          <>
            <Rect
              width={element.width}
              height={element.height}
              fill={color}
              opacity={0.2}
              stroke={color}
              strokeWidth={2}
              cornerRadius={4}
            />
            <Text
              text={icon}
              width={element.width}
              height={element.height}
              fontSize={24}
              align="center"
              verticalAlign="middle"
            />
            <Text
              text={element.type}
              width={element.width}
              y={element.height - 20}
              fontSize={10}
              fill={color}
              align="center"
            />
          </>
        );
    }
  };

  return (
    <Group
      x={element.x}
      y={element.y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
    >
      {renderContent()}
    </Group>
  );
};

export const Canvas: React.FC<CanvasProps> = ({
  width = 800,
  height = 600,
}) => {
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const {
    elements,
    selectedElementId,
    zoom,
    panX,
    panY,
    addElement,
    deleteElement,
    moveElement,
    resizeElement,
    selectElement,
    setZoom,
    setPan,
  } = usePreviewStore();

  const { generateForModule, isStreaming } = useGlobalAIStore();

  const [stageSize, setStageSize] = useState({ width, height });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleResize = () => {
      setStageSize({
        width: window.innerWidth - 320,
        height: window.innerHeight - 100,
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      const selectedNode = elements.find(el => el.id === selectedElementId);
      if (selectedNode) {
        const stage = stageRef.current;
        const selectedKonvaNode = stage.findOne(`Group`);
        if (selectedKonvaNode) {
          transformerRef.current.nodes([selectedKonvaNode]);
          transformerRef.current.getLayer().batchDraw();
        }
      } else {
        transformerRef.current.nodes([]);
      }
    }
  }, [selectedElementId, elements]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = zoom;
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - panX) / oldScale,
      y: (pointer.y - panY) / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.1, Math.min(3, newScale));
    setZoom(clampedScale);
    setPan(pointer.x - mousePointTo.x * clampedScale, pointer.y - mousePointTo.y * clampedScale);
  }, [zoom, panX, panY, setZoom, setPan]);

  const handleStageMouseDown = useCallback((e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      selectElement(null);
      setIsPanning(true);
      setLastPointer({ x: e.evt.clientX, y: e.evt.clientY });
    }
  }, [selectElement]);

  const handleStageMouseMove = useCallback((e: any) => {
    if (isPanning) {
      const dx = e.evt.clientX - lastPointer.x;
      const dy = e.evt.clientY - lastPointer.y;
      setPan(panX + dx, panY + dy);
      setLastPointer({ x: e.evt.clientX, y: e.evt.clientY });
    }
  }, [isPanning, lastPointer, panX, panY, setPan]);

  const handleStageMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleElementDragEnd = useCallback((id: string, x: number, y: number) => {
    moveElement(id, x, y);
  }, [moveElement]);

  const handleElementTransformEnd = useCallback((id: string, width: number, height: number) => {
    resizeElement(id, width, height);
  }, [resizeElement]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('componentType');
    if (type) {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      const adjustedX = (pointer.x - panX) / zoom;
      const adjustedY = (pointer.y - panY) / zoom;
      addElement(type, adjustedX, adjustedY);
    }
  }, [panX, panY, zoom, addElement]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleAIGenerate = useCallback(async () => {
    if (!selectedElementId) return;
    const element = elements.find(el => el.id === selectedElementId);
    if (!element) return;

    const scope = scopeDetector.detectElementChange(element, 'structure');
    await generateForModule(
      'canvas',
      'generate',
      scope,
      `根据这个 ${element.type} 组件生成完整的 React 代码。组件位置: (${element.x}, ${element.y})，尺寸: ${element.width}x${element.height}，属性: ${JSON.stringify(element.props)}`,
      { featureId: element.id, featureName: element.type }
    );
  }, [selectedElementId, elements, generateForModule]);

  const handleAIImprove = useCallback(async () => {
    if (elements.length === 0) return;

    const scope = {
      target: { type: 'page' as const, id: 'canvas', filePath: 'canvas/page.tsx' },
      change: { type: 'add' as const, after: '根据当前设计改进 UI 美观度和交互体验' },
      related: { files: [], elements: elements.map(e => e.id) },
    };

    await generateForModule(
      'canvas',
      'optimize',
      scope,
      `当前画布有 ${elements.length} 个组件，请根据整体设计风格生成优化建议和代码：${elements.map(e => `${e.type}(${e.props.text || ''})`).join(', ')}`,
      {}
    );
  }, [elements, generateForModule]);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#f5f5f7',
        overflow: 'hidden',
        position: 'relative',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          right: '10px',
          display: 'flex',
          gap: '8px',
          zIndex: 100,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            padding: '7px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '12px', color: '#86868b' }}>缩放: {Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(zoom * 1.2)}
            style={{
              padding: '3px 7px',
              border: '1px solid #d2d2d7',
              backgroundColor: '#ffffff',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#1d1d1f',
            }}
          >
            +
          </button>
          <button
            onClick={() => setZoom(zoom / 1.2)}
            style={{
              padding: '3px 7px',
              border: '1px solid #d2d2d7',
              backgroundColor: '#ffffff',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#1d1d1f',
            }}
          >
            −
          </button>
          <button
            onClick={() => { setZoom(1); setPan(0, 0); }}
            style={{
              padding: '3px 7px',
              border: '1px solid #d2d2d7',
              backgroundColor: '#ffffff',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#86868b',
            }}
          >
            重置
          </button>
        </div>

        {selectedElementId && (
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              padding: '7px 12px',
              borderRadius: '8px',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <button
              onClick={() => deleteElement(selectedElementId)}
              style={{
                padding: '3px 7px',
                border: 'none',
                backgroundColor: 'rgba(255, 59, 48, 0.1)',
                color: '#ff3b30',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              ⌫ 删除
            </button>
            <button
              onClick={() => selectElement(null)}
              style={{
                padding: '3px 7px',
                border: '1px solid #d2d2d7',
                backgroundColor: '#ffffff',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#86868b',
              }}
            >
              取消选择
            </button>
            <button
              onClick={handleAIGenerate}
              disabled={isStreaming}
              style={{
                padding: '3px 7px',
                border: 'none',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                color: '#007aff',
                borderRadius: '5px',
                cursor: isStreaming ? 'wait' : 'pointer',
                fontWeight: 500,
                fontSize: '11px',
              }}
              title="AI 生成此组件代码"
            >
              {isStreaming ? '◐' : '◎'} 生成
            </button>
          </div>
        )}

        {/* AI Improve Button (always visible when has elements) */}
        {elements.length > 0 && !selectedElementId && (
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              padding: '7px 12px',
              borderRadius: '8px',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <button
              onClick={handleAIImprove}
              disabled={isStreaming}
              style={{
                padding: '3px 7px',
                border: 'none',
                backgroundColor: 'rgba(48, 209, 88, 0.1)',
                color: '#30d158',
                borderRadius: '5px',
                cursor: isStreaming ? 'wait' : 'pointer',
                fontWeight: 500,
                fontSize: '11px',
              }}
              title="AI 改进整体设计"
            >
              {isStreaming ? '◐' : '◎'} 优化设计
            </button>
          </div>
        )}
      </div>

      {/* Canvas Stage */}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
      >
        <Layer>
          {/* Grid Background */}
          {Array.from({ length: Math.ceil(2000 / 20) }).map((_, i) => (
            <React.Fragment key={`grid-${i}`}>
              <Line
                points={[i * 20 - 1000, -1000, i * 20 - 1000, 2000]}
                stroke="#e8e8ed"
                strokeWidth={1}
              />
              <Line
                points={[-1000, i * 20 - 1000, 2000, i * 20 - 1000]}
                stroke="#e8e8ed"
                strokeWidth={1}
              />
            </React.Fragment>
          ))}

          {/* Canvas Border */}
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="white"
            stroke="#d2d2d7"
            strokeWidth={1}
          />

          {/* Elements */}
          {elements.map(element => (
            <ElementRenderer
              key={element.id}
              element={element}
              isSelected={element.id === selectedElementId}
              onSelect={() => selectElement(element.id)}
              onDragEnd={(x, y) => handleElementDragEnd(element.id, x, y)}
              onTransformEnd={(w, h) => handleElementTransformEnd(element.id, w, h)}
            />
          ))}

          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>

      {/* Empty State */}
      {elements.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#86868b',
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '14px', opacity: 0.7 }}>◎</div>
          <p style={{ fontSize: '15px', marginBottom: '7px', color: '#1d1d1f' }}>拖拽组件到画布开始设计</p>
          <p style={{ fontSize: '13px' }}>或者右键添加组件</p>
        </div>
      )}
    </div>
  );
};

