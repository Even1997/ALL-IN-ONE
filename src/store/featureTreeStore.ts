import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { FeatureNode, FeatureTree, FeatureStatus } from '../types';

interface FeatureTreeState {
  tree: FeatureTree | null;
  selectedFeatureId: string | null;
  expandedNodeIds: Set<string>;

  // Actions
  setTree: (tree: FeatureTree) => void;
  clearTree: () => void;
  selectFeature: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  addFeature: (parentId: string | null, name: string) => void;
  updateFeature: (id: string, updates: Partial<FeatureNode>) => void;
  deleteFeature: (id: string) => void;
  moveFeature: (fromId: string, toId: string, position: 'before' | 'after' | 'inside') => void;
  updateFeatureStatus: (id: string, status: FeatureStatus) => void;

  // Selectors
  getSelectedFeature: () => FeatureNode | null;
  getFeaturePath: (id: string) => FeatureNode[];
  getAllFeatures: () => FeatureNode[];
}

const findNode = (nodes: FeatureNode[], id: string): FeatureNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
};

const updateNode = (nodes: FeatureNode[], id: string, updates: Partial<FeatureNode>): FeatureNode[] => {
  return nodes.map(node => {
    if (node.id === id) {
      return { ...node, ...updates };
    }
    return { ...node, children: updateNode(node.children, id, updates) };
  });
};

const deleteNode = (nodes: FeatureNode[], id: string): FeatureNode[] => {
  return nodes.filter(node => node.id !== id).map(node => ({
    ...node,
    children: deleteNode(node.children, id)
  }));
};

const insertNode = (
  nodes: FeatureNode[],
  targetId: string,
  newNode: FeatureNode,
  position: 'before' | 'after' | 'inside'
): FeatureNode[] => {
  return nodes.flatMap(node => {
    if (node.id === targetId) {
      if (position === 'inside') {
        return [{ ...node, children: [...node.children, newNode] }];
      }
      const newNodes: FeatureNode[] = [];
      if (position === 'before') {
        newNodes.push(newNode);
      }
      newNodes.push(node);
      if (position === 'after') {
        newNodes.push(newNode);
      }
      return newNodes;
    }
    return [{ ...node, children: insertNode(node.children, targetId, newNode, position) }];
  });
};

const getNodePath = (nodes: FeatureNode[], id: string, path: FeatureNode[] = []): FeatureNode[] => {
  for (const node of nodes) {
    if (node.id === id) return [...path, node];
    const found = getNodePath(node.children, id, [...path, node]);
    if (found.length > 0) return found;
  }
  return [];
};

const collectAllNodes = (nodes: FeatureNode[]): FeatureNode[] => {
  const result: FeatureNode[] = [...nodes];
  for (const node of nodes) {
    result.push(...collectAllNodes(node.children));
  }
  return result;
};

export const useFeatureTreeStore = create<FeatureTreeState>()(
  persist(
    (set, get) => ({
      tree: null,
      selectedFeatureId: null,
      expandedNodeIds: new Set<string>(),

      setTree: (tree) => set({ tree }),

      clearTree: () => set({ tree: null, selectedFeatureId: null, expandedNodeIds: new Set<string>() }),

      selectFeature: (id) => set({ selectedFeatureId: id }),

      toggleExpand: (id) => set(state => {
        const newExpanded = new Set(state.expandedNodeIds);
        if (newExpanded.has(id)) {
          newExpanded.delete(id);
        } else {
          newExpanded.add(id);
        }
        return { expandedNodeIds: newExpanded };
      }),

      addFeature: (parentId, name) => set(state => {
        if (!state.tree) return state;

        const newNode: FeatureNode = {
          id: uuidv4(),
          name,
          status: 'pending',
          priority: 'medium',
          progress: 0,
          linkedPrototypePageIds: [],
          linkedCodeFiles: [],
          children: [],
        };

        if (!parentId) {
          return { tree: { ...state.tree, children: [...state.tree.children, newNode] } };
        }

        const newChildren = insertNode(
          state.tree.children,
          parentId,
          newNode,
          'inside'
        );

        return { tree: { ...state.tree, children: newChildren } };
      }),

      updateFeature: (id, updates) => set(state => {
        if (!state.tree) return state;
        return { tree: { ...state.tree, children: updateNode(state.tree.children, id, updates) } };
      }),

      deleteFeature: (id) => set(state => {
        if (!state.tree) return state;
        return { tree: { ...state.tree, children: deleteNode(state.tree.children, id) } };
      }),

      moveFeature: (fromId, toId, position) => set(state => {
        if (!state.tree || fromId === toId) return state;

        const nodeToMove = findNode(state.tree.children, fromId);
        if (!nodeToMove) return state;

        const treeWithoutNode = deleteNode(state.tree.children, fromId);
        const treeWithMovedNode = insertNode(treeWithoutNode, toId, nodeToMove, position);

        return { tree: { ...state.tree, children: treeWithMovedNode } };
      }),

      updateFeatureStatus: (id, status) => set(state => {
        if (!state.tree) return state;
        const progress = status === 'completed' ? 100 : status === 'in_progress' ? 50 : status === 'failed' ? 0 : 0;
        return {
          tree: {
            ...state.tree,
            children: updateNode(state.tree.children, id, { status, progress }),
          },
        };
      }),

      getSelectedFeature: () => {
        const { tree, selectedFeatureId } = get();
        if (!tree || !selectedFeatureId) return null;
        return findNode(tree.children, selectedFeatureId);
      },

      getFeaturePath: (id) => {
        const { tree } = get();
        if (!tree) return [];
        return getNodePath(tree.children, id);
      },

      getAllFeatures: () => {
        const { tree } = get();
        if (!tree) return [];
        return collectAllNodes(tree.children);
      },
    }),
    {
      name: 'devflow-feature-tree-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tree: state.tree,
        selectedFeatureId: state.selectedFeatureId,
        expandedNodeIds: Array.from(state.expandedNodeIds),
      }),
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<FeatureTreeState> & { expandedNodeIds?: string[] };

        return {
          ...currentState,
          ...typedState,
          expandedNodeIds: new Set(typedState.expandedNodeIds || []),
        };
      },
    }
  )
);
