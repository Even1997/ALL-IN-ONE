import { useMemo } from 'react';
import type { KnowledgeNeighborhoodGraph, KnowledgeNote } from '../model/knowledge';

type LayoutedNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  radius: number;
  depth: number;
  isCenter: boolean;
  isSelected: boolean;
  docType?: KnowledgeNote['docType'];
  kind?: KnowledgeNote['kind'];
};

type PositionedEdge = {
  sourceId: string;
  targetId: string;
  edgeType: string;
  strength: number;
  opacity: number;
  width: number;
  sourceNode: LayoutedNode;
  targetNode: LayoutedNode;
};

type KnowledgeGraphCanvasProps = {
  graph: KnowledgeNeighborhoodGraph | null;
  selectedNoteId?: string | null;
  onSelectNode: (noteId: string) => void;
  mode?: 'focused' | 'global';
  compact?: boolean;
};

const VIEWBOX_WIDTH = 960;
const VIEWBOX_HEIGHT = 680;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const shortenTitle = (value: string, maxLength = 14) =>
  value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}...` : value;

const getNodeRadius = (
  node: KnowledgeNeighborhoodGraph['nodes'][number],
  isCenter: boolean
) => {
  if (isCenter) {
    return 46;
  }

  if (node.docType === 'wiki-index') {
    return 28;
  }

  if (node.docType === 'ai-summary') {
    return 24;
  }

  return node.kind === 'design' ? 24 : 22;
};

const getNodeClassName = (node: LayoutedNode) => {
  const classes = ['gn-graph-node'];
  if (node.isCenter) {
    classes.push('is-center');
  }
  if (node.isSelected) {
    classes.push('is-selected');
  }
  if (node.docType === 'wiki-index') {
    classes.push('is-wiki');
  } else if (node.docType === 'ai-summary') {
    classes.push('is-ai');
  } else if (node.kind === 'sketch') {
    classes.push('is-sketch');
  } else if (node.kind === 'design') {
    classes.push('is-design');
  }

  return classes.join(' ');
};

const layoutFocusedNodes = (
  graph: KnowledgeNeighborhoodGraph,
  selectedNoteId: string | null
): LayoutedNode[] => {
  const centerNode =
    graph.nodes.find((node) => node.id === graph.centerNoteId) || graph.nodes[0];
  const grouped = new Map<number, typeof graph.nodes>();
  graph.nodes.forEach((node) => {
    const bucket = grouped.get(node.depth) || [];
    bucket.push(node);
    grouped.set(node.depth, bucket);
  });

  const nextNodes: LayoutedNode[] = [
    {
      id: centerNode.id,
      title: centerNode.title,
      x: CENTER_X,
      y: CENTER_Y,
      radius: getNodeRadius(centerNode, true),
      depth: 0,
      isCenter: true,
      isSelected: selectedNoteId === centerNode.id,
      docType: centerNode.docType,
      kind: centerNode.kind,
    },
  ];

  const depths = Array.from(grouped.keys())
    .filter((depth) => depth > 0)
    .sort((left, right) => left - right);

  depths.forEach((depth) => {
    const bucket = (grouped.get(depth) || []).filter((node) => node.id !== centerNode.id);
    if (bucket.length === 0) {
      return;
    }

    const ringRadius = 150 + (depth - 1) * 116;
    const angleStep = (Math.PI * 2) / bucket.length;
    const angleOffset = depth % 2 === 0 ? Math.PI / bucket.length : -Math.PI / 2;

    bucket.forEach((node, index) => {
      const angle = angleOffset + angleStep * index;
      nextNodes.push({
        id: node.id,
        title: node.title,
        x: CENTER_X + Math.cos(angle) * ringRadius,
        y: CENTER_Y + Math.sin(angle) * ringRadius,
        radius: getNodeRadius(node, false),
        depth,
        isCenter: false,
        isSelected: selectedNoteId === node.id,
        docType: node.docType,
        kind: node.kind,
      });
    });
  });

  return nextNodes;
};

const layoutGlobalNodes = (
  graph: KnowledgeNeighborhoodGraph,
  selectedNoteId: string | null
): LayoutedNode[] => {
  const grouped = new Map<number, typeof graph.nodes>();
  graph.nodes.forEach((node) => {
    const bucket = grouped.get(node.depth) || [];
    bucket.push(node);
    grouped.set(node.depth, bucket);
  });

  const nextNodes: LayoutedNode[] = [];
  const depths = Array.from(grouped.keys()).sort((left, right) => left - right);

  depths.forEach((depth) => {
    const bucket = grouped.get(depth) || [];
    if (bucket.length === 0) {
      return;
    }

    const ringRadius = 110 + depth * 120;
    const angleStep = (Math.PI * 2) / bucket.length;
    const angleOffset = depth % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + angleStep / 2;

    bucket.forEach((node, index) => {
      const angle = angleOffset + angleStep * index;
      nextNodes.push({
        id: node.id,
        title: node.title,
        x: CENTER_X + Math.cos(angle) * ringRadius,
        y: CENTER_Y + Math.sin(angle) * ringRadius,
        radius: getNodeRadius(node, false),
        depth,
        isCenter: false,
        isSelected: selectedNoteId === node.id,
        docType: node.docType,
        kind: node.kind,
      });
    });
  });

  return nextNodes;
};

export const KnowledgeGraphCanvas = ({
  graph,
  selectedNoteId = null,
  onSelectNode,
  mode = 'focused',
  compact = false,
}: KnowledgeGraphCanvasProps) => {
  const layoutedNodes = useMemo(() => {
    if (!graph || graph.nodes.length === 0) {
      return [];
    }

    const hasCenter = mode === 'focused' && Boolean(graph.centerNoteId);
    return hasCenter
      ? layoutFocusedNodes(graph, selectedNoteId)
      : layoutGlobalNodes(graph, selectedNoteId);
  }, [graph, mode, selectedNoteId]);

  const positionedEdges = useMemo(() => {
    if (!graph) {
      return [];
    }

    const nodeMap = new Map(layoutedNodes.map((node) => [node.id, node]));
    return graph.edges.flatMap((edge): PositionedEdge[] => {
      const sourceNode = nodeMap.get(edge.sourceId);
      const targetNode = nodeMap.get(edge.targetId);
      if (!sourceNode || !targetNode) {
        return [];
      }

      return [{
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeType: edge.edgeType,
        strength: edge.strength,
        opacity: clamp(0.18 + edge.strength * 0.5, 0.18, 0.76),
        width: clamp(1 + edge.strength * 2.2, 1, 4),
        sourceNode,
        targetNode,
      }];
    });
  }, [graph, layoutedNodes]);

  if (!graph || graph.nodes.length === 0) {
    return null;
  }

  return (
    <svg className={`gn-graph-canvas${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} aria-label="Wiki graph canvas">
      <defs>
        <radialGradient id={compact ? 'gn-graph-glow-compact' : 'gn-graph-glow'} cx="50%" cy="50%" r="64%">
          <stop offset="0%" stopColor="rgba(20, 184, 166, 0.24)" />
          <stop offset="100%" stopColor="rgba(20, 184, 166, 0)" />
        </radialGradient>
      </defs>

      <circle
        cx={CENTER_X}
        cy={CENTER_Y}
        r={compact ? 188 : 228}
        fill={`url(#${compact ? 'gn-graph-glow-compact' : 'gn-graph-glow'})`}
      />

      {positionedEdges.map((edge) => (
        <line
          key={`${edge.sourceId}-${edge.targetId}-${edge.edgeType}`}
          className="gn-graph-edge"
          x1={edge.sourceNode.x}
          y1={edge.sourceNode.y}
          x2={edge.targetNode.x}
          y2={edge.targetNode.y}
          strokeWidth={edge.width}
          opacity={edge.opacity}
        />
      ))}

      {layoutedNodes.map((node) => (
        <g
          key={node.id}
          className={getNodeClassName(node)}
          role="button"
          tabIndex={0}
          onClick={() => onSelectNode(node.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectNode(node.id);
            }
          }}
        >
          <circle cx={node.x} cy={node.y} r={node.radius} />
          <text x={node.x} y={node.y + 4} textAnchor="middle">
            {node.isCenter ? 'Current' : `${node.depth}`}
          </text>
          <text className="gn-graph-node-label" x={node.x} y={node.y + node.radius + 18} textAnchor="middle">
            {shortenTitle(node.title)}
          </text>
        </g>
      ))}
    </svg>
  );
};
