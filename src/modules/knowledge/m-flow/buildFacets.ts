import type { MFlowEpisode, MFlowFacet } from './model.ts';
import { splitIntoSentences, summarizeText } from './shared.ts';

const buildFacetLabel = (episode: MFlowEpisode) => {
  const firstSentence = splitIntoSentences(episode.summary || episode.content)[0];
  return summarizeText(firstSentence || episode.title, 80);
};

export const buildFacets = (episodes: MFlowEpisode[]): MFlowFacet[] =>
  episodes.map((episode) => ({
    id: `facet:${episode.id.replace(/^episode:/, '')}`,
    episodeId: episode.id,
    label: buildFacetLabel(episode),
    anchorText: episode.summary || summarizeText(episode.content),
    searchText: [episode.title, episode.summary, episode.content].filter(Boolean).join('\n'),
  }));
