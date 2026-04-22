import React, { useState } from 'react';

interface ComponentItem {
  type: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

const COMPONENT_LIBRARY: ComponentItem[] = [
  { type: 'header', name: '页头', icon: '▭', description: '页面顶部标题区', category: '结构' },
  { type: 'sidebar', name: '侧栏', icon: '▥', description: '侧边导航区', category: '结构' },
  { type: 'card', name: '卡片', icon: '▣', description: '摘要或信息块', category: '结构' },
  { type: 'list', name: '列表', icon: '☰', description: '列表或表格主内容', category: '结构' },
  { type: 'container', name: '容器', icon: '⬚', description: '大区块占位', category: '结构' },
  { type: 'text', name: '文本', icon: 'T', description: '标题或说明文本', category: '内容' },
  { type: 'image', name: '图片', icon: '✕', description: '图片或插图占位', category: '内容' },
  { type: 'input', name: '输入框', icon: '⌸', description: '输入或搜索框', category: '表单' },
  { type: 'textarea', name: '多行输入', icon: '≣', description: '多行文本区域', category: '表单' },
  { type: 'select', name: '选择框', icon: '∨', description: '下拉选择器', category: '表单' },
  { type: 'button', name: '按钮', icon: '◫', description: '主操作或次操作按钮', category: '表单' },
  { type: 'modal', name: '弹层', icon: '□', description: '弹窗或二次确认层', category: '反馈' },
  { type: 'alert', name: '提示条', icon: '!', description: '状态反馈或提示信息', category: '反馈' },
];

const CATEGORIES = ['结构', '内容', '表单', '反馈'];

interface ComponentLibraryProps {
  onComponentSelect?: (type: string) => void;
}

export const ComponentLibrary: React.FC<ComponentLibraryProps> = ({ onComponentSelect }) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedType, setDraggedType] = useState<string | null>(null);

  const filteredComponents = COMPONENT_LIBRARY.filter(c => {
    const matchesCategory = !activeCategory || c.category === activeCategory;
    const matchesSearch = !searchQuery ||
      c.name.includes(searchQuery) ||
      c.type.includes(searchQuery) ||
      c.description.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('componentType', type);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggedType(type);
  };

  const handleDragEnd = () => {
    setDraggedType(null);
  };

  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        height: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 600, color: '#1d1d1f' }}>
          线框组件
        </h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索线框块..."
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #d2d2d7',
            borderRadius: '6px',
            fontSize: '11px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            background: '#ffffff',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#007aff';
            e.target.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.12)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d2d2d7';
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Categories */}
      <div
        style={{
          padding: '6px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <button
          onClick={() => setActiveCategory(null)}
          style={{
            padding: '3px 7px',
            fontSize: '9px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            backgroundColor: !activeCategory ? '#007aff' : 'rgba(0, 0, 0, 0.04)',
            color: !activeCategory ? 'white' : '#86868b',
            fontWeight: 500,
          }}
        >
          全部
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '3px 7px',
              fontSize: '9px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              backgroundColor: activeCategory === cat ? '#007aff' : 'rgba(0, 0, 0, 0.04)',
              color: activeCategory === cat ? 'white' : '#86868b',
              fontWeight: 500,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Components Grid */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '6px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px',
          alignContent: 'start',
        }}
      >
        {filteredComponents.map(comp => (
          <div
            key={comp.type}
            draggable
            onDragStart={(e) => handleDragStart(e, comp.type)}
            onDragEnd={handleDragEnd}
            onClick={() => onComponentSelect?.(comp.type)}
            style={{
              padding: '8px 5px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '7px',
              cursor: 'grab',
              textAlign: 'center',
              backgroundColor: draggedType === comp.type ? 'rgba(0, 122, 255, 0.06)' : '#ffffff',
              transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              opacity: draggedType && draggedType !== comp.type ? 0.5 : 1,
            }}
            title={comp.description}
          >
            <div style={{ fontSize: '18px', marginBottom: '2px' }}>{comp.icon}</div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#1d1d1f' }}>{comp.name}</div>
            <div style={{ fontSize: '8px', color: '#86868b', marginTop: '1px' }}>{comp.type}</div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: '1px solid rgba(0, 0, 0, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.01)',
          fontSize: '9px',
          color: '#86868b',
          textAlign: 'center',
        }}
      >
        点击或拖拽到画布，生成低保真线框
      </div>
    </div>
  );
};
