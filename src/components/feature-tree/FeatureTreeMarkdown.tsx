import React from 'react';
import { FeatureTree, FeatureNode, FeatureStatus, FeaturePriority } from '../../types';

interface FeatureTreeMarkdownProps {
  tree: FeatureTree | null;
  onFeatureClick: (node: FeatureNode) => void;
  selectedId: string | null;
}

interface MarkdownNodeProps {
  node: FeatureNode;
  depth: number;
  onFeatureClick: (node: FeatureNode) => void;
  selectedId: string | null;
}

const STATUS_LABELS: Record<FeatureStatus, string> = {
  pending: '待开发',
  in_progress: '开发中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_ICONS: Record<FeatureStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '✓',
  failed: '✕',
};

const STATUS_COLORS: Record<FeatureStatus, string> = {
  pending: '#86868b',
  in_progress: '#ff9500',
  completed: '#30d158',
  failed: '#ff3b30',
};

const PRIORITY_COLORS: Record<FeaturePriority, string> = {
  critical: '#ff3b30',
  high: '#ff9500',
  medium: '#007aff',
  low: '#86868b',
};

const PriorityBadge: React.FC<{ priority: FeaturePriority }> = ({ priority }) => (
  <span
    style={{
      backgroundColor: PRIORITY_COLORS[priority],
      color: 'white',
      padding: '1px 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 600,
    }}
  >
    {priority === 'critical' ? '紧急' : priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}
  </span>
);

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const getColor = (p: number) => {
    if (p >= 100) return '#30d158';
    if (p >= 50) return '#007aff';
    if (p > 0) return '#ff9500';
    return '#e8e8ed';
  };

  return (
    <div style={{ width: '40px', height: '3px', backgroundColor: '#e8e8ed', borderRadius: '1.5px' }}>
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

const MarkdownNode: React.FC<MarkdownNodeProps> = ({
  node,
  depth,
  onFeatureClick,
  selectedId,
}) => {
  const level = Math.min(depth + 1, 6);
  const isSelected = selectedId === node.id;

  const handleClick = () => {
    onFeatureClick(node);
  };

  return (
    <div className="markdown-feature-node">
      <div
        className={`markdown-feature-title level-${level} ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
      >
        <div className="feature-title-row">
          <span className="feature-hash">{'#'.repeat(Math.min(level, 6))}</span>
          <span className="feature-name">{node.name}</span>
          {node.children.length > 0 && (
            <span className="child-count">({node.children.length})</span>
          )}
        </div>
        <div className="feature-meta-row">
          <span
            className="feature-status"
            style={{ color: STATUS_COLORS[node.status] }}
            title={STATUS_LABELS[node.status]}
          >
            {STATUS_ICONS[node.status]} {STATUS_LABELS[node.status]}
          </span>
          <PriorityBadge priority={node.priority} />
          <ProgressBar progress={node.progress} />
          <span className="feature-progress-text">{node.progress}%</span>
        </div>
        {node.linkedPrototypePageIds.length > 0 && (
          <div className="feature-page-count">
            📄 {node.linkedPrototypePageIds.length} 个页面
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="markdown-feature-children">
          {node.children.map((child) => (
            <MarkdownNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onFeatureClick={onFeatureClick}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FeatureTreeMarkdown: React.FC<FeatureTreeMarkdownProps> = ({
  tree,
  onFeatureClick,
  selectedId,
}) => {
  if (!tree) {
    return (
      <div className="markdown-feature-empty">
        <p>暂无功能清单</p>
        <small>请先生成规划产物</small>
      </div>
    );
  }

  return (
    <div className="markdown-feature-tree">
      <div className="markdown-feature-header">
        <h2>功能清单</h2>
        <span className="feature-count">{tree.children.length} 个功能</span>
      </div>
      <div className="markdown-feature-content">
        {tree.children.map((node) => (
          <MarkdownNode
            key={node.id}
            node={node}
            depth={0}
            onFeatureClick={onFeatureClick}
            selectedId={selectedId}
          />
        ))}
      </div>
    </div>
  );
};
