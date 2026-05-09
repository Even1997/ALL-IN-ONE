import { useEffect, useState } from 'react';
import {
  loadDesignBoardStateFromDisk,
  saveDesignBoardStateToDisk,
  type PersistedDesignBoardState,
} from '../../utils/projectPersistence';
import type { PageStructureNode } from '../../types';

const DESIGN_BOARD_STORAGE_PREFIX = 'goodnight-design-board';

const collectDesignPages = (nodes: PageStructureNode[]): PageStructureNode[] =>
  nodes.flatMap((node) => [...(node.kind === 'page' ? [node] : []), ...collectDesignPages(node.children)]);

const getDesignBoardStorageKey = (projectId: string) => `${DESIGN_BOARD_STORAGE_PREFIX}:${projectId}`;

const createEmptyPersistedDesignBoardState = (): PersistedDesignBoardState => ({
  pageNodes: [],
  flowNodes: [],
  textNodes: [],
  aiNodes: [],
  styleNodes: [],
  edges: [],
});

const safeLocalStorageSetItem = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const readPersistedDesignBoardState = (projectId: string): PersistedDesignBoardState => {
  if (typeof window === 'undefined') {
    return createEmptyPersistedDesignBoardState();
  }

  try {
    const raw = window.localStorage.getItem(getDesignBoardStorageKey(projectId));
    if (!raw) {
      return createEmptyPersistedDesignBoardState();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDesignBoardState>;

    return {
      pageNodes: Array.isArray(parsed.pageNodes) ? parsed.pageNodes : [],
      flowNodes: Array.isArray(parsed.flowNodes) ? parsed.flowNodes : [],
      textNodes: Array.isArray(parsed.textNodes) ? parsed.textNodes : [],
      aiNodes: Array.isArray(parsed.aiNodes) ? parsed.aiNodes : [],
      styleNodes: Array.isArray(parsed.styleNodes) ? parsed.styleNodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    return createEmptyPersistedDesignBoardState();
  }
};

type DesignFlowEdge = { id: string; from: string; to: string };

export const useDesignBoardState = (
  currentProjectId: string | null,
  pageStructure: PageStructureNode[]
) => {
  const [designPageNodes, setDesignPageNodes] = useState<any[]>([]);
  const [designFlowNodes, setDesignFlowNodes] = useState<any[]>([]);
  const [designTextNodes, setDesignTextNodes] = useState<any[]>([]);
  const [designAINodes, setDesignAINodes] = useState<any[]>([]);
  const [designStyleNodes, setDesignStyleNodes] = useState<any[]>([]);
  const [designFlowEdges, setDesignFlowEdges] = useState<DesignFlowEdge[]>([]);

  useEffect(() => {
    if (!currentProjectId) {
      setDesignPageNodes([]);
      setDesignFlowNodes([]);
      setDesignTextNodes([]);
      setDesignAINodes([]);
      setDesignStyleNodes([]);
      setDesignFlowEdges([]);
      return;
    }

    let isMounted = true;

    const applyPersistedDesignBoard = (persisted: PersistedDesignBoardState) => {
      setDesignPageNodes(Array.isArray(persisted.pageNodes) ? persisted.pageNodes : []);
      setDesignFlowNodes(Array.isArray(persisted.flowNodes) ? persisted.flowNodes : []);
      setDesignTextNodes(Array.isArray(persisted.textNodes) ? persisted.textNodes : []);
      setDesignAINodes(Array.isArray(persisted.aiNodes) ? persisted.aiNodes : []);
      setDesignStyleNodes(Array.isArray(persisted.styleNodes) ? persisted.styleNodes : []);
      setDesignFlowEdges(Array.isArray(persisted.edges) ? (persisted.edges as DesignFlowEdge[]) : []);
    };

    applyPersistedDesignBoard(readPersistedDesignBoardState(currentProjectId));

    void loadDesignBoardStateFromDisk(currentProjectId)
      .then((persisted) => {
        if (!isMounted || !persisted) {
          return;
        }

        applyPersistedDesignBoard({
          pageNodes: Array.isArray(persisted.pageNodes) ? persisted.pageNodes : [],
          flowNodes: Array.isArray(persisted.flowNodes) ? persisted.flowNodes : [],
          textNodes: Array.isArray(persisted.textNodes) ? persisted.textNodes : [],
          aiNodes: Array.isArray(persisted.aiNodes) ? persisted.aiNodes : [],
          styleNodes: Array.isArray(persisted.styleNodes) ? persisted.styleNodes : [],
          edges: Array.isArray(persisted.edges) ? (persisted.edges as DesignFlowEdge[]) : [],
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    setDesignFlowEdges((current) =>
      current.filter((edge) => {
        const hasFrom =
          designPageNodes.some((page) => page.id === edge.from) ||
          designFlowNodes.some((node) => node.id === edge.from) ||
          designTextNodes.some((node) => node.id === edge.from) ||
          designAINodes.some((node) => node.id === edge.from) ||
          designStyleNodes.some((node) => node.id === edge.from);
        const hasTo =
          designPageNodes.some((page) => page.id === edge.to) ||
          designFlowNodes.some((node) => node.id === edge.to) ||
          designTextNodes.some((node) => node.id === edge.to) ||
          designAINodes.some((node) => node.id === edge.to) ||
          designStyleNodes.some((node) => node.id === edge.to);

        return hasFrom && hasTo;
      })
    );

    setDesignPageNodes((current) => {
      const availableDesignPages = collectDesignPages(pageStructure);
      const next = current.filter((node) => availableDesignPages.some((page) => page.id === node.pageId));
      return next.length === current.length ? current : next;
    });
  }, [
    currentProjectId,
    designAINodes,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
    pageStructure,
  ]);

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    const persistedState = {
      pageNodes: designPageNodes,
      flowNodes: designFlowNodes,
      textNodes: designTextNodes,
      aiNodes: designAINodes,
      styleNodes: designStyleNodes,
      edges: designFlowEdges,
    } satisfies PersistedDesignBoardState;

    safeLocalStorageSetItem(getDesignBoardStorageKey(currentProjectId), JSON.stringify(persistedState));
    void saveDesignBoardStateToDisk(currentProjectId, persistedState).catch(() => undefined);
  }, [
    currentProjectId,
    designAINodes,
    designFlowEdges,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
  ]);

  return {
    designAINodes,
    designFlowEdges,
    designFlowNodes,
    designPageNodes,
    designStyleNodes,
    designTextNodes,
    setDesignAINodes,
    setDesignFlowEdges,
    setDesignFlowNodes,
    setDesignPageNodes,
    setDesignStyleNodes,
    setDesignTextNodes,
  };
};
