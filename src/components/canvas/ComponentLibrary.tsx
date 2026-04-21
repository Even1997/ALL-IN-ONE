import React, { useState } from 'react';

interface ComponentItem {
  type: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

const COMPONENT_LIBRARY: ComponentItem[] = [
  // Basic
  { type: 'button', name: '按钮', icon: '🔘', description: '点击触发操作', category: '基础' },
  { type: 'text', name: '文本', icon: '📃', description: '展示文字信息', category: '基础' },
  { type: 'image', name: '图片', icon: '🖼️', description: '展示图片内容', category: '基础' },
  { type: 'input', name: '输入框', icon: '📝', description: '用户输入文本', category: '基础' },
  { type: 'textarea', name: '多行文本', icon: '📝', description: '多行文本输入', category: '基础' },

  // Form
  { type: 'select', name: '下拉选择', icon: '📂', description: '下拉选择框', category: '表单' },
  { type: 'checkbox', name: '复选框', icon: '☑️', description: '多选选项', category: '表单' },
  { type: 'radio', name: '单选框', icon: '🔘', description: '单选选项', category: '表单' },
  { type: 'switch', name: '开关', icon: '🔃', description: '切换开关', category: '表单' },
  { type: 'slider', name: '滑块', icon: '🎚️', description: '范围选择', category: '表单' },
  { type: 'progress', name: '进度条', icon: '📈', description: '展示进度', category: '表单' },

  // Layout
  { type: 'container', name: '容器', icon: '📦', description: '分组容器', category: '布局' },
  { type: 'card', name: '卡片', icon: '🃏', description: '卡片容器', category: '布局' },
  { type: 'form', name: '表单', icon: '📝', description: '表单容器', category: '布局' },
  { type: 'table', name: '表格', icon: '📊', description: '数据表格', category: '布局' },
  { type: 'list', name: '列表', icon: '📋', description: '列表视图', category: '布局' },

  // Navigation
  { type: 'navbar', name: '导航栏', icon: '🧭', description: '顶部导航', category: '导航' },
  { type: 'sidebar', name: '侧边栏', icon: '📐', description: '侧边导航', category: '导航' },
  { type: 'header', name: '头部', icon: '🏗️', description: '页面头部', category: '导航' },
  { type: 'footer', name: '底部', icon: '📋', description: '页面底部', category: '导航' },

  // Feedback
  { type: 'modal', name: '弹窗', icon: '🪟', description: '模态弹窗', category: '反馈' },
  { type: 'alert', name: '提示', icon: '⚠️', description: '警告提示', category: '反馈' },
  { type: 'badge', name: '徽章', icon: '🏷️', description: '角标徽章', category: '反馈' },
  { type: 'tooltip', name: '气泡', icon: '💬', description: '悬浮提示', category: '反馈' },

  // Data Display
  { type: 'avatar', name: '头像', icon: '👤', description: '用户头像', category: '数据' },
];

const CATEGORIES = ['基础', '表单', '布局', '导航', '反馈', '数据'];

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
        width: '220px',
        height: '100%',
        backgroundColor: '#ffffff',
        borderRight: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#1d1d1f' }}>
          组件库
        </h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索组件..."
          style={{
            width: '100%',
            padding: '7px 10px',
            border: '1px solid #d2d2d7',
            borderRadius: '7px',
            fontSize: '12px',
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
          padding: '8px 10px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <button
          onClick={() => setActiveCategory(null)}
          style={{
            padding: '4px 8px',
            fontSize: '10px',
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
              padding: '4px 8px',
              fontSize: '10px',
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
          padding: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '7px',
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
              padding: '10px 6px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '8px',
              cursor: 'grab',
              textAlign: 'center',
              backgroundColor: draggedType === comp.type ? 'rgba(0, 122, 255, 0.06)' : '#ffffff',
              transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              opacity: draggedType && draggedType !== comp.type ? 0.5 : 1,
            }}
            title={comp.description}
          >
            <div style={{ fontSize: '22px', marginBottom: '3px' }}>{comp.icon}</div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#1d1d1f' }}>{comp.name}</div>
            <div style={{ fontSize: '9px', color: '#86868b', marginTop: '2px' }}>{comp.type}</div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(0, 0, 0, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.01)',
          fontSize: '10px',
          color: '#86868b',
          textAlign: 'center',
        }}
      >
        拖拽组件到画布添加
      </div>
    </div>
  );
};
