import type { MFlowEdge, MFlowEntity, MFlowEpisode, MFlowFacet, MFlowFacetPoint, MFlowState } from './model.ts';
import { normalizeWhitespace, tokenizeSearchText } from './shared.ts';

export type MFlowAnchorKind = 'episode' | 'facet' | 'point' | 'entity' | 'edge';

export interface MFlowSearchAnchor {
  id: string;
  kind: MFlowAnchorKind;
  score: number;
  text: string;
}

const scoreTextMatch = (queryText: string, candidateText: string) => {
  const queryTokens = tokenizeSearchText(queryText);
  const candidateTokens = tokenizeSearchText(candidateText);
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const candidateTokenSet = new Set(candidateTokens);
  const matchedTokenCount = queryTokens.filter((token) => candidateTokenSet.has(token)).length;
  if (matchedTokenCount === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const normalizedQuery = normalizeWhitespace(queryText).toLowerCase();
  const normalizedCandidate = normalizeWhitespace(candidateText).toLowerCase();
  const exactPhraseBonus = normalizedCandidate.includes(normalizedQuery) ? 0.12 : 0;

  return Math.max(0.02, 1 / (matchedTokenCount + 1) - exactPhraseBonus);
};

const applyKindBias = (kind: MFlowAnchorKind, score: number) => {
  if (!Number.isFinite(score)) {
    return score;
  }

  if (kind === 'point') {
    return Math.max(0.02, score - 0.15);
  }

  if (kind === 'entity') {
    return Math.max(0.02, score - 0.15);
  }

  if (kind === 'edge') {
    return Math.max(0.02, score - 0.1);
  }

  if (kind === 'facet') {
    return score + 0.05;
  }

  if (kind === 'episode') {
    return score + 0.15;
  }

  return score;
};

const toAnchor = (
  kind: MFlowAnchorKind,
  id: string,
  text: string
): MFlowSearchAnchor | null => {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return null;
  }

  return {
    id,
    kind,
    score: Number.POSITIVE_INFINITY,
    text: normalizedText,
  };
};

const collectAnchors = (state: MFlowState) => {
  const anchors: MFlowSearchAnchor[] = [];

  const pushNode = (
    kind: 'episode' | 'facet' | 'point' | 'entity',
    node: MFlowEpisode | MFlowFacet | MFlowFacetPoint | MFlowEntity,
    text: string
  ) => {
    const anchor = toAnchor(kind, node.id, text);
    if (anchor) {
      anchors.push(anchor);
    }
  };

  state.episodes.forEach((episode) => pushNode('episode', episode, episode.searchText));
  state.facets.forEach((facet) => pushNode('facet', facet, `${facet.label}\n${facet.anchorText}\n${facet.searchText}`));
  state.facetPoints.forEach((point) => pushNode('point', point, `${point.summary}\n${point.searchText}`));
  state.entities.forEach((entity) => pushNode('entity', entity, `${entity.name}\n${entity.searchText}`));
  state.edges.forEach((edge: MFlowEdge) => {
    const anchor = toAnchor('edge', edge.id, edge.edgeText);
    if (anchor) {
      anchors.push(anchor);
    }
  });

  return anchors;
};

export const searchAnchors = (state: MFlowState, queryText: string, maxResults = 48): MFlowSearchAnchor[] =>
  collectAnchors(state)
    .map((anchor) => ({
      ...anchor,
      score: applyKindBias(anchor.kind, scoreTextMatch(queryText, anchor.text)),
    }))
    .filter((anchor) => Number.isFinite(anchor.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return left.id.localeCompare(right.id, 'en');
    })
    .slice(0, maxResults);
