import type { MFlowEdge, MFlowState } from './model.ts';
import type { MFlowSearchAnchor } from './searchAnchors.ts';

type MFlowPathKind = 'direct_episode' | 'facet' | 'point' | 'entity' | 'facet_entity';

type MFlowBestPath = {
  kind: MFlowPathKind;
  supportId: string | null;
  facetId: string | null;
  pointId: string | null;
  entityId: string | null;
};

export type MFlowEpisodeBundle = {
  episodeId: string;
  score: number;
  bestPath: MFlowBestPath;
};

type RelationshipIndex = {
  facetsByEpisode: Map<string, Set<string>>;
  pointsByFacet: Map<string, Set<string>>;
  entitiesByEpisode: Map<string, Set<string>>;
  entitiesByFacet: Map<string, Set<string>>;
  episodeFacetEdges: Map<string, MFlowEdge>;
  facetPointEdges: Map<string, MFlowEdge>;
  episodeEntityEdges: Map<string, MFlowEdge>;
  facetEntityEdges: Map<string, MFlowEdge>;
};

const joinEdgeKey = (fromId: string, toId: string) => `${fromId}::${toId}`;

const buildRelationshipIndex = (state: MFlowState): RelationshipIndex => {
  const index: RelationshipIndex = {
    facetsByEpisode: new Map(),
    pointsByFacet: new Map(),
    entitiesByEpisode: new Map(),
    entitiesByFacet: new Map(),
    episodeFacetEdges: new Map(),
    facetPointEdges: new Map(),
    episodeEntityEdges: new Map(),
    facetEntityEdges: new Map(),
  };

  for (const edge of state.edges) {
    if (edge.relationshipName === 'has_facet' && edge.fromId.startsWith('episode:') && edge.toId.startsWith('facet:')) {
      const existing = index.facetsByEpisode.get(edge.fromId) || new Set<string>();
      existing.add(edge.toId);
      index.facetsByEpisode.set(edge.fromId, existing);
      index.episodeFacetEdges.set(joinEdgeKey(edge.fromId, edge.toId), edge);
    }

    if (edge.relationshipName === 'has_point' && edge.fromId.startsWith('facet:') && edge.toId.startsWith('point:')) {
      const existing = index.pointsByFacet.get(edge.fromId) || new Set<string>();
      existing.add(edge.toId);
      index.pointsByFacet.set(edge.fromId, existing);
      index.facetPointEdges.set(joinEdgeKey(edge.fromId, edge.toId), edge);
    }

    if (edge.relationshipName === 'involves_entity' && edge.fromId.startsWith('episode:') && edge.toId.startsWith('entity:')) {
      const existing = index.entitiesByEpisode.get(edge.fromId) || new Set<string>();
      existing.add(edge.toId);
      index.entitiesByEpisode.set(edge.fromId, existing);
      index.episodeEntityEdges.set(joinEdgeKey(edge.fromId, edge.toId), edge);
    }

    if (edge.relationshipName === 'involves_entity' && edge.fromId.startsWith('facet:') && edge.toId.startsWith('entity:')) {
      const existing = index.entitiesByFacet.get(edge.fromId) || new Set<string>();
      existing.add(edge.toId);
      index.entitiesByFacet.set(edge.fromId, existing);
      index.facetEntityEdges.set(joinEdgeKey(edge.fromId, edge.toId), edge);
    }
  }

  return index;
};

const buildBestScoreMap = (anchors: MFlowSearchAnchor[], kind: MFlowSearchAnchor['kind']) => {
  const map = new Map<string, number>();
  for (const anchor of anchors) {
    if (anchor.kind !== kind) {
      continue;
    }

    const existing = map.get(anchor.id);
    if (existing === undefined || anchor.score < existing) {
      map.set(anchor.id, anchor.score);
    }
  }
  return map;
};

export const scoreEpisodeBundles = (options: {
  state: MFlowState;
  anchors: MFlowSearchAnchor[];
  hopCost: number;
  directEpisodePenalty: number;
  edgeMissCost: number;
}): MFlowEpisodeBundle[] => {
  const relationshipIndex = buildRelationshipIndex(options.state);
  const episodeDirect = buildBestScoreMap(options.anchors, 'episode');
  const facetDirect = buildBestScoreMap(options.anchors, 'facet');
  const pointDirect = buildBestScoreMap(options.anchors, 'point');
  const entityDirect = buildBestScoreMap(options.anchors, 'entity');
  const edgeDirect = buildBestScoreMap(options.anchors, 'edge');

  const edgeCost = (edge: MFlowEdge | undefined) =>
    edge ? edgeDirect.get(edge.id) ?? options.edgeMissCost : options.edgeMissCost;

  const applyTipDiscount = (baseScore: number, rawEdgeCost: number) => {
    if (baseScore < 0.2) {
      return {
        edgeCost: rawEdgeCost * 0.2,
        hopCost: options.hopCost * 0.2,
      };
    }

    return {
      edgeCost: rawEdgeCost,
      hopCost: options.hopCost,
    };
  };

  const facetCost = new Map<string, number>();
  const facetBestPath = new Map<string, MFlowBestPath>();

  for (const facet of options.state.facets) {
    let bestScore = facetDirect.get(facet.id) ?? Number.POSITIVE_INFINITY;
    let bestPath: MFlowBestPath = {
      kind: 'facet',
      supportId: Number.isFinite(bestScore) ? facet.id : null,
      facetId: facet.id,
      pointId: null,
      entityId: null,
    };

    for (const pointId of relationshipIndex.pointsByFacet.get(facet.id) || []) {
      const pointScore = pointDirect.get(pointId);
      if (pointScore === undefined || !Number.isFinite(pointScore)) {
        continue;
      }

      const rawEdgeCost = edgeCost(relationshipIndex.facetPointEdges.get(joinEdgeKey(facet.id, pointId)));
      const discounted = applyTipDiscount(pointScore, rawEdgeCost);
      const totalScore = pointScore + discounted.edgeCost + discounted.hopCost;
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestPath = {
          kind: 'point',
          supportId: pointId,
          facetId: facet.id,
          pointId,
          entityId: null,
        };
      }
    }

    for (const entityId of relationshipIndex.entitiesByFacet.get(facet.id) || []) {
      const entityScore = entityDirect.get(entityId);
      if (entityScore === undefined || !Number.isFinite(entityScore)) {
        continue;
      }

      const rawEdgeCost = edgeCost(relationshipIndex.facetEntityEdges.get(joinEdgeKey(facet.id, entityId)));
      const discounted = applyTipDiscount(entityScore, rawEdgeCost);
      const totalScore = entityScore + discounted.edgeCost + discounted.hopCost;
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestPath = {
          kind: 'facet_entity',
          supportId: entityId,
          facetId: facet.id,
          pointId: null,
          entityId,
        };
      }
    }

    facetCost.set(facet.id, bestScore);
    facetBestPath.set(facet.id, bestPath);
  }

  const bundles: MFlowEpisodeBundle[] = [];

  for (const episode of options.state.episodes) {
    const rawEpisodeScore = episodeDirect.get(episode.id);
    let bestScore =
      rawEpisodeScore !== undefined && Number.isFinite(rawEpisodeScore)
        ? rawEpisodeScore + options.directEpisodePenalty
        : Number.POSITIVE_INFINITY;
    let bestPath: MFlowBestPath = {
      kind: 'direct_episode',
      supportId: rawEpisodeScore !== undefined && Number.isFinite(rawEpisodeScore) ? episode.id : null,
      facetId: null,
      pointId: null,
      entityId: null,
    };

    for (const facetId of relationshipIndex.facetsByEpisode.get(episode.id) || []) {
      const currentFacetCost = facetCost.get(facetId) ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(currentFacetCost)) {
        continue;
      }

      const facetDirectScore = facetDirect.get(facetId) ?? Number.POSITIVE_INFINITY;
      const rawEdgeCost = edgeCost(relationshipIndex.episodeFacetEdges.get(joinEdgeKey(episode.id, facetId)));
      const effectiveEdgeCost = facetDirectScore < 0.2 ? rawEdgeCost * 0.3 : rawEdgeCost;
      const effectiveHopCost = facetDirectScore < 0.2 ? options.hopCost * 0.3 : options.hopCost;
      const totalScore = currentFacetCost + effectiveEdgeCost + effectiveHopCost;

      if (totalScore < bestScore) {
        const facetPath = facetBestPath.get(facetId) || {
          kind: 'facet' as const,
          supportId: facetId,
          facetId,
          pointId: null,
          entityId: null,
        };
        bestScore = totalScore;
        bestPath = facetPath;
      }
    }

    for (const entityId of relationshipIndex.entitiesByEpisode.get(episode.id) || []) {
      const entityScore = entityDirect.get(entityId);
      if (entityScore === undefined || !Number.isFinite(entityScore)) {
        continue;
      }

      const rawEdgeCost = edgeCost(relationshipIndex.episodeEntityEdges.get(joinEdgeKey(episode.id, entityId)));
      const discounted = applyTipDiscount(entityScore, rawEdgeCost);
      const totalScore = entityScore + discounted.edgeCost + discounted.hopCost;
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestPath = {
          kind: 'entity',
          supportId: entityId,
          facetId: null,
          pointId: null,
          entityId,
        };
      }
    }

    if (Number.isFinite(bestScore)) {
      bundles.push({
        episodeId: episode.id,
        score: bestScore,
        bestPath,
      });
    }
  }

  return bundles.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }
    return left.episodeId.localeCompare(right.episodeId, 'en');
  });
};
