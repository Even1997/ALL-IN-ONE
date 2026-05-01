import type { MFlowFacet, MFlowFacetPoint } from './model.ts';
import { splitIntoSentences, summarizeText, uniqueStrings } from './shared.ts';

export const buildFacetPoints = (facets: MFlowFacet[]): MFlowFacetPoint[] =>
  facets.flatMap((facet) => {
    const points = uniqueStrings(splitIntoSentences(facet.searchText));
    const pointCandidates = points.length > 0 ? points : [facet.anchorText || summarizeText(facet.searchText)];

    return pointCandidates.map((point, index) => ({
      id: `point:${facet.id.replace(/^facet:/, '')}:${index + 1}`,
      episodeId: facet.episodeId,
      facetId: facet.id,
      summary: summarizeText(point, 140),
      searchText: point,
    }));
  });
