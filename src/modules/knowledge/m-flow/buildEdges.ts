import type {
  MFlowEdge,
  MFlowEntity,
  MFlowEpisode,
  MFlowFacet,
  MFlowFacetPoint,
} from './model.ts';

const includesEntityName = (haystack: string, entityName: string) =>
  haystack.toLowerCase().includes(entityName.toLowerCase());

export const buildEdges = (options: {
  episodes: MFlowEpisode[];
  facets: MFlowFacet[];
  facetPoints: MFlowFacetPoint[];
  entities: MFlowEntity[];
}): MFlowEdge[] => {
  const edges: MFlowEdge[] = [];
  const facetsByEpisodeId = new Map<string, MFlowFacet[]>();
  const pointsByFacetId = new Map<string, MFlowFacetPoint[]>();

  for (const facet of options.facets) {
    const existing = facetsByEpisodeId.get(facet.episodeId) || [];
    existing.push(facet);
    facetsByEpisodeId.set(facet.episodeId, existing);
  }

  for (const point of options.facetPoints) {
    const existing = pointsByFacetId.get(point.facetId) || [];
    existing.push(point);
    pointsByFacetId.set(point.facetId, existing);
  }

  for (const episode of options.episodes) {
    for (const facet of facetsByEpisodeId.get(episode.id) || []) {
      edges.push({
        id: `edge:${episode.id}:${facet.id}`,
        fromId: episode.id,
        toId: facet.id,
        relationshipName: 'has_facet',
        edgeText: `${episode.title} -> ${facet.label}: ${facet.anchorText}`,
      });
    }
  }

  for (const facet of options.facets) {
    for (const point of pointsByFacetId.get(facet.id) || []) {
      edges.push({
        id: `edge:${facet.id}:${point.id}`,
        fromId: facet.id,
        toId: point.id,
        relationshipName: 'has_point',
        edgeText: `${facet.label} -> ${point.summary}`,
      });
    }
  }

  for (const entity of options.entities) {
    for (const episodeId of entity.episodeIds) {
      const episode = options.episodes.find((candidate) => candidate.id === episodeId);
      if (!episode) {
        continue;
      }

      edges.push({
        id: `edge:${episode.id}:${entity.id}`,
        fromId: episode.id,
        toId: entity.id,
        relationshipName: 'involves_entity',
        edgeText: `${episode.title} -> ${entity.name}`,
      });

      for (const facet of facetsByEpisodeId.get(episode.id) || []) {
        if (!includesEntityName(facet.searchText, entity.name)) {
          continue;
        }

        edges.push({
          id: `edge:${facet.id}:${entity.id}`,
          fromId: facet.id,
          toId: entity.id,
          relationshipName: 'involves_entity',
          edgeText: `${facet.label} -> ${entity.name}`,
        });
      }
    }
  }

  return edges;
};
