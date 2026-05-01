import type { MFlowEntity, MFlowEpisode, MFlowFacet, MFlowSource } from './model.ts';
import { splitIntoSentences, tokenizeSearchText, uniqueStrings } from './shared.ts';

const ENTITY_PATTERN = /\b[A-Z]{2,}[A-Za-z0-9_-]*\b/g;
const IGNORED_ENTITIES = new Set(['AND', 'FOR', 'WITH', 'EXPORT', 'RETURN', 'CONST']);

const canonicalizeEntityName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const collectEntityNames = (value: string) => {
  const matches = value.match(ENTITY_PATTERN) || [];
  return uniqueStrings(
    matches
      .map((match) => match.trim())
      .filter((match) => match.length >= 2 && !IGNORED_ENTITIES.has(match) && !/\d/.test(match))
  );
};

export const buildEntities = (options: {
  episodes: MFlowEpisode[];
  facets: MFlowFacet[];
  sources: MFlowSource[];
}): MFlowEntity[] => {
  const entities = new Map<string, MFlowEntity>();
  const sourceById = new Map(options.sources.map((source) => [source.id, source]));
  const facetByEpisodeId = new Map<string, MFlowFacet[]>();

  for (const facet of options.facets) {
    const existing = facetByEpisodeId.get(facet.episodeId) || [];
    existing.push(facet);
    facetByEpisodeId.set(facet.episodeId, existing);
  }

  for (const episode of options.episodes) {
    const source = sourceById.get(episode.sourceId);
    const facets = facetByEpisodeId.get(episode.id) || [];
    const candidates = collectEntityNames(
      [episode.title, episode.summary, episode.content, source?.path || '', ...facets.map((facet) => facet.anchorText)].join('\n')
    );

    for (const name of candidates) {
      const canonicalName = canonicalizeEntityName(name);
      if (!canonicalName || tokenizeSearchText(canonicalName).length === 0) {
        continue;
      }

      const supportingText = splitIntoSentences([episode.summary, episode.content, ...facets.map((facet) => facet.anchorText)].join('\n'))
        .filter((sentence) => sentence.includes(name));
      const entitySearchText = uniqueStrings([name, canonicalName, ...supportingText]).join('\n');

      const existing = entities.get(canonicalName);
      if (existing) {
        existing.episodeIds = uniqueStrings([...existing.episodeIds, episode.id]);
        existing.searchText = uniqueStrings([existing.searchText, entitySearchText]).join('\n');
        continue;
      }

      entities.set(canonicalName, {
        id: `entity:${canonicalName}`,
        episodeIds: [episode.id],
        name,
        searchText: entitySearchText,
      });
    }
  }

  return [...entities.values()].sort((left, right) => left.name.localeCompare(right.name, 'en'));
};
