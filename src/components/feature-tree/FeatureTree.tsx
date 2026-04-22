import React, { useState, useCallback } from 'react';
import { FeatureNode } from '../../types';
import { useFeatureTreeStore } from '../../store/featureTreeStore';

interface TreeNodeProps {
  node: FeatureNode;
  depth: number;
  expandedNodeIds: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  expandedNodeIds,
  onToggleExpand,
  selectedId,
  onSelect,
  onDelete,
}) => {
  const isExpanded = expandedNodeIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const [showChildInput, setShowChildInput] = useState(false);
  const [childName, setChildName] = useState('');

  const handleAddChild = useCallback(() => {
    if (childName.trim()) {
      useFeatureTreeStore.getState().addFeature(node.id, childName.trim());
      setChildName('');
      setShowChildInput(false);
      if (!expandedNodeIds.has(node.id)) {
        onToggleExpand(node.id);
      }
    }
  }, [childName, node.id, expandedNodeIds, onToggleExpand]);

  const depthIndent = depth === 0 ? 0 : depth === 1 ? 4 : depth === 2 ? 8 : 12;

  return (
    <div>
      <div
        style={{
          paddingLeft: `${depth * 16 + 8 + depthIndent}px`,
          padding: '6px 8px',
          cursor: 'pointer',
          background: isSelected ? '#e0f2fe' : 'transparent',
          borderRadius: '6px',
          fontSize: '13px',
          color: isSelected ? '#0f766e' : '#1d1d1f',
          fontWeight: isSelected ? 600 : 400,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginBottom: '2px',
        }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: '10px',
              color: '#64748b',
              width: '14px',
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: '14px', display: 'inline-block' }} />
        )}
        <span style={{ flex: 1 }}>{node.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowChildInput(!showChildInput);
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '12px',
            color: '#0f766e',
            opacity: 0.7,
          }}
          title="添加子功能"
        >
          +
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '11px',
            color: '#dc2626',
            opacity: 0.6,
          }}
          title="删除"
        >
          ×
        </button>
      </div>

      {showChildInput && (
        <div style={{ paddingLeft: `${(depth + 1) * 16 + 8 + depthIndent}px`, padding: '4px 8px', display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddChild()}
            placeholder="子功能名称..."
            style={{
              flex: 1,
              padding: '4px 8px',
              border: '1px solid #d2d2d7',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          />
          <button
            onClick={handleAddChild}
            style={{
              padding: '4px 8px',
              backgroundColor: '#0f766e',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            添加
          </button>
          <button
            onClick={() => setShowChildInput(false)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              onToggleExpand={onToggleExpand}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
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
  const { tree, selectedFeatureId, expandedNodeIds, selectFeature, toggleExpand, addFeature, deleteFeature } =
    useFeatureTreeStore();

  const [newFeatureName, setNewFeatureName] = useState('');

  const findNode = useCallback((nodes: FeatureNode[], targetId: string): FeatureNode | null => {
    for (const n of nodes) {
      if (n.id === targetId) return n;
      const found = findNode(n.children, targetId);
      if (found) return found;
    }
    return null;
  }, []);

  const handleAddFeature = useCallback(() => {
    if (newFeatureName.trim()) {
      addFeature(null, newFeatureName.trim());
      setNewFeatureName('');
    }
  }, [newFeatureName, addFeature]);

  if (!tree) {
    return (
      <div style={{ padding: '16px', color: '#86868b', fontSize: '13px' }}>
        <p style={{ margin: '0 0 12px 0' }}>暂无功能清单</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newFeatureName}
            onChange={(e) => setNewFeatureName(e.target.value)}
            placeholder="输入功能名称..."
            onKeyDown={(e) => e.key === 'Enter' && handleAddFeature()}
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #d2d2d7',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <button
            onClick={handleAddFeature}
            style={{
              padding: '6px 12px',
              backgroundColor: '#007aff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            创建
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={newFeatureName}
          onChange={(e) => setNewFeatureName(e.target.value)}
          placeholder="添加功能..."
          onKeyDown={(e) => e.key === 'Enter' && handleAddFeature()}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid #d2d2d7',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        />
        <button
          onClick={handleAddFeature}
          style={{
            padding: '6px 12px',
            backgroundColor: '#0f766e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          +
        </button>
      </div>
      <div>
        {tree.children.map((node) => (
          <div key={node.id} style={{ position: 'relative' }}>
            <TreeNode
              node={node}
              depth={0}
              expandedNodeIds={expandedNodeIds}
              onToggleExpand={toggleExpand}
              selectedId={selectedFeatureId}
              onSelect={(id) => {
                selectFeature(id);
                const n = findNode(tree.children, id);
                if (n) onFeatureSelect?.(n);
              }}
              onDelete={(id) => deleteFeature(id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
