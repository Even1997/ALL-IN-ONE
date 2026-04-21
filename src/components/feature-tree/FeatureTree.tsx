import React, { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FeatureNode, FeatureStatus } from '../../types';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { scopeDetector } from '../../modules/scope-detector/ChangeScopeDetector';

const StatusIcon: React.FC<{ status: FeatureStatus }> = ({ status }) => {
  const icons: Record<FeatureStatus, string> = {
    pending: '○',
    in_progress: '◐',
    completed: '✓',
    failed: '✕',
  };
  const labels: Record<FeatureStatus, string> = {
    pending: '待开发',
    in_progress: '开发中',
    completed: '已完成',
    failed: '失败',
  };
  const colors: Record<FeatureStatus, string> = {
    pending: '#86868b',
    in_progress: '#ff9500',
    completed: '#30d158',
    failed: '#ff3b30',
  };

  return (
    <span title={labels[status]} style={{ color: colors[status], fontSize: '13px', fontWeight: 600 }}>
      {icons[status]}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: FeatureNode['priority'] }> = ({ priority }) => {
  const styles: Record<FeatureNode['priority'], React.CSSProperties> = {
    critical: { backgroundColor: '#ff3b30', color: 'white' },
    high: { backgroundColor: '#ff9500', color: 'white' },
    medium: { backgroundColor: '#007aff', color: 'white' },
    low: { backgroundColor: '#86868b', color: 'white' },
  };

  return (
    <span
      style={{
        ...styles[priority],
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
      }}
    >
      {priority}
    </span>
  );
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const getColor = (p: number) => {
    if (p >= 100) return '#30d158';
    if (p >= 50) return '#007aff';
    if (p > 0) return '#ff9500';
    return '#e8e8ed';
  };

  return (
    <div style={{ width: '50px', height: '3px', backgroundColor: '#e8e8ed', borderRadius: '1.5px' }}>
      <div
        style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: getColor(progress),
          borderRadius: '1.5px',
          transition: 'width 0.25s ease',
        }}
      />
    </div>
  );
};

interface SortableNodeProps {
  node: FeatureNode;
  depth: number;
  expandedNodeIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  updateFeatureStatus: (id: string, status: FeatureStatus) => void;
}

const SortableNode: React.FC<SortableNodeProps> = ({
  node,
  depth,
  expandedNodeIds,
  onToggleExpand,
  onAddChild,
  onEdit,
  onDelete,
  selectedId,
  onSelect,
  updateFeatureStatus,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const { generateForModule, isStreaming } = useGlobalAIStore();

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${depth * 20 + 8}px`,
    cursor: 'grab',
  };

  const isExpanded = expandedNodeIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const handleStatusClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const statusOrder: FeatureStatus[] = ['pending', 'in_progress', 'completed', 'failed'];
      const currentIndex = statusOrder.indexOf(node.status);
      const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
      updateFeatureStatus(node.id, nextStatus);
    },
    [node.id, node.status, updateFeatureStatus]
  );

  const handleAIGenerate = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const scope = scopeDetector.detectStructureChange(node.id, 'add');
      await generateForModule(
        'feature-tree',
        'generate',
        scope,
        `为功能"${node.name}"生成完整的代码实现，包括组件、样式和业务逻辑。`,
        { featureId: node.id, featureName: node.name }
      );
    },
    [node.id, node.name, generateForModule]
  );

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 10px',
          marginBottom: '3px',
          borderRadius: '8px',
          backgroundColor: isSelected ? 'rgba(0, 122, 255, 0.08)' : 'rgba(0, 0, 0, 0.01)',
          border: isSelected ? '1.5px solid #007aff' : '1.5px solid transparent',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
          disabled={!hasChildren}
          style={{
            width: '18px',
            height: '18px',
            border: 'none',
            background: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            fontSize: '10px',
            color: hasChildren ? '#86868b' : '#d2d2d7',
          }}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '•'}
        </button>

        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#d2d2d7', fontSize: '10px' }}>
          ⋮⋮
        </span>

        <button
          onClick={handleStatusClick}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        >
          <StatusIcon status={node.status} />
        </button>

        <span style={{ flex: 1, fontWeight: 500, color: '#1d1d1f', fontSize: '13px' }}>{node.name}</span>

        <PriorityBadge priority={node.priority} />

        <ProgressBar progress={node.progress} />

        <span style={{ fontSize: '11px', color: '#86868b', minWidth: '36px', textAlign: 'right' }}>
          {node.progress}%
        </span>

        {/* AI Generate Button */}
        <button
          onClick={handleAIGenerate}
          disabled={isStreaming}
          title="AI 生成代码"
          style={{
            width: '26px',
            height: '26px',
            border: 'none',
            background: node.status === 'completed' ? 'rgba(48, 209, 88, 0.1)' : 'rgba(0, 122, 255, 0.1)',
            borderRadius: '6px',
            cursor: isStreaming ? 'wait' : 'pointer',
            fontSize: '13px',
          }}
        >
          {isStreaming ? '◐' : '◎'}
        </button>

        <div style={{ display: 'flex', gap: '3px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.id);
            }}
            title="添加子功能"
            style={{
              width: '22px',
              height: '22px',
              border: 'none',
              background: '#f5f5f7',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#86868b',
            }}
          >
            +
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node.id);
            }}
            title="编辑"
            style={{
              width: '22px',
              height: '22px',
              border: 'none',
              background: '#f5f5f7',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '11px',
              color: '#86868b',
            }}
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            title="删除"
            style={{
              width: '22px',
              height: '22px',
              border: 'none',
              background: 'rgba(255, 59, 48, 0.08)',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '11px',
              color: '#ff3b30',
            }}
          >
            ⌫
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <SortableNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              onToggleExpand={onToggleExpand}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              selectedId={selectedId}
              onSelect={onSelect}
              updateFeatureStatus={updateFeatureStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FeatureTreeProps {
  onFeatureSelect?: (node: FeatureNode) => void;
}

export const FeatureTree: React.FC<FeatureTreeProps> = ({ onFeatureSelect }) => {
  const { tree, selectedFeatureId, expandedNodeIds, selectFeature, toggleExpand, addFeature, deleteFeature, updateFeatureStatus } =
    useFeatureTreeStore();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<{ parentId: string | null; isChild: boolean } | null>(null);
  const [newFeatureName, setNewFeatureName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!tree) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#86868b' }}>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>暂无功能清单</p>
        <button
          onClick={() => setShowAddModal({ parentId: null, isChild: false })}
          style={{
            padding: '9px 18px',
            backgroundColor: '#007aff',
            color: 'white',
            border: 'none',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          创建功能清单
        </button>
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      useFeatureTreeStore.getState().moveFeature(active.id as string, over.id as string, 'after');
    }
  };

  const handleAddFeature = () => {
    if (newFeatureName.trim() && showAddModal) {
      addFeature(showAddModal.parentId, newFeatureName.trim());
      setNewFeatureName('');
      setShowAddModal(null);
    }
  };

  const activeNode = activeId ? tree.children.find((n) => n.id === activeId) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.01)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.3px' }}>功能清单</h2>
          <button
            onClick={() => setShowAddModal({ parentId: null, isChild: false })}
            style={{
              padding: '6px 14px',
              backgroundColor: '#007aff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            + 添加
          </button>
        </div>

        <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
          {(['pending', 'in_progress', 'completed', 'failed'] as FeatureStatus[]).map((status) => {
            const count = tree.children.filter((n) => n.status === status).length;
            return (
              <span key={status} style={{ fontSize: '12px', color: '#86868b' }}>
                <StatusIcon status={status} /> {count}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tree.children.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {tree.children.map((node) => (
              <SortableNode
                key={node.id}
                node={node}
                depth={0}
                expandedNodeIds={expandedNodeIds}
                onToggleExpand={toggleExpand}
                onAddChild={(parentId) => setShowAddModal({ parentId, isChild: true })}
                onEdit={(id) => {
                  const n = tree.children.find((x) => x.id === id);
                  if (n) onFeatureSelect?.(n);
                }}
                onDelete={(id) => {
                  if (confirm('确定删除此功能?')) {
                    deleteFeature(id);
                  }
                }}
                selectedId={selectedFeatureId}
                onSelect={(id) => {
                  selectFeature(id);
                  const n = tree.children.find((x) => x.id === id);
                  if (n) onFeatureSelect?.(n);
                }}
                updateFeatureStatus={updateFeatureStatus}
              />
            ))}
          </SortableContext>

          <DragOverlay>
            {activeNode ? (
              <div
                style={{
                  padding: '7px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                  opacity: 0.95,
                }}
              >
                <StatusIcon status={activeNode.status} />
                <span style={{ marginLeft: '8px', fontWeight: 500, color: '#1d1d1f', fontSize: '13px' }}>{activeNode.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(null)}
        >
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              padding: '22px',
              borderRadius: '14px',
              width: '360px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: 600, color: '#1d1d1f' }}>
              {showAddModal.isChild ? '添加子功能' : '添加功能'}
            </h3>
            <input
              type="text"
              value={newFeatureName}
              onChange={(e) => setNewFeatureName(e.target.value)}
              placeholder="输入功能名称..."
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddFeature()}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d2d2d7',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
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
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddModal(null)}
                style={{
                  padding: '8px 14px',
                  border: '1px solid #d2d2d7',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#1d1d1f',
                }}
              >
                取消
              </button>
              <button
                onClick={handleAddFeature}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#007aff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
