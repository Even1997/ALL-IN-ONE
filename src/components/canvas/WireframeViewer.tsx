import React from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import { useProjectStore } from '../../store/projectStore';
import { CanvasElement } from '../../types';

interface WireframeViewerProps {
  pageId: string | null;
  width?: number;
  height?: number;
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
}

const WireframeElementRenderer: React.FC<ElementRendererProps> = ({ element }) => {
  const color = ELEMENT_COLORS[element.type] || '#6366F1';
  const icon = ELEMENT_ICONS[element.type] || '📦';

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
              shadowBlur={5}
              shadowOpacity={0.1}
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
    <React.Fragment key={element.id}>
      {renderContent()}
    </React.Fragment>
  );
};

export const WireframeViewer: React.FC<WireframeViewerProps> = ({
  pageId,
  width = 800,
  height = 600,
}) => {
  const wireframes = useProjectStore((s) => s.wireframes);

  if (!pageId) {
    return (
      <div className="wireframe-viewer-empty">
        <div className="empty-state">
          <span style={{ fontSize: '48px' }}>📐</span>
          <p>选择功能以查看线稿图</p>
        </div>
      </div>
    );
  }

  const wireframe = wireframes[pageId];

  if (!wireframe) {
    return (
      <div className="wireframe-viewer-empty">
        <div className="empty-state">
          <span style={{ fontSize: '48px' }}>📝</span>
          <p>暂无线稿图</p>
        </div>
      </div>
    );
  }

  if (wireframe.elements.length === 0) {
    return (
      <div className="wireframe-viewer-empty">
        <div className="empty-state">
          <span style={{ fontSize: '48px' }}>🖼️</span>
          <p>线稿图为空</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wireframe-viewer">
      <Stage width={width} height={height}>
        <Layer>
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="white"
          />
          {wireframe.elements.map((element) => (
            <WireframeElementRenderer key={element.id} element={element} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
