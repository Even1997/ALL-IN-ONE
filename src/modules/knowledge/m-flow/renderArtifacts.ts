import type { MFlowState } from './model.ts';
import { getVaultMFlowArtifactDirectoryPath, getVaultMFlowIndexArtifactPath } from './persistence.ts';
import { slugifyMFlowPart, summarizeText } from './shared.ts';
import { scoreEpisodeBundles } from './scoreBundles.ts';
import { searchAnchors } from './searchAnchors.ts';

export type MFlowArtifact = {
  path: string;
  content: string;
};

const normalizeArtifactPath = (value: string) => value.replace(/\\/g, '/');

export const renderMFlowArtifacts = (options: {
  vaultPath: string;
  state: MFlowState;
}): MFlowArtifact[] => {
  const overviewQuery = options.state.facetPoints.slice(0, 6).map((point) => point.searchText).join('\n');
  const bundles = scoreEpisodeBundles({
    state: options.state,
    anchors: searchAnchors(options.state, overviewQuery || options.state.episodes.map((episode) => episode.summary).join('\n')),
    hopCost: 0.15,
    directEpisodePenalty: 0.4,
    edgeMissCost: 0.9,
  });

  const episodeArtifacts = options.state.episodes.map((episode) => ({
    path: normalizeArtifactPath(
      getVaultMFlowArtifactDirectoryPath(options.vaultPath, 'episodes', `${slugifyMFlowPart(episode.id)}.md`)
    ),
    content: [
      `# Episode: ${episode.id}`,
      '',
      `path: ${episode.path}`,
      `summary: ${episode.summary}`,
      '',
      '## Content',
      episode.content,
    ].join('\n'),
  }));

  const pathArtifacts = bundles.map((bundle) => {
    const episode = options.state.episodes.find((candidate) => candidate.id === bundle.episodeId);
    return {
      path: normalizeArtifactPath(
        getVaultMFlowArtifactDirectoryPath(options.vaultPath, 'paths', `${slugifyMFlowPart(bundle.episodeId)}.md`)
      ),
      content: [
        `# Episode Bundle: ${bundle.episodeId}`,
        '',
        `best_path: ${bundle.bestPath.kind}`,
        `score: ${bundle.score.toFixed(3)}`,
        `summary: ${episode?.summary || ''}`,
      ].join('\n'),
    };
  });

  return [
    {
      path: normalizeArtifactPath(getVaultMFlowIndexArtifactPath(options.vaultPath)),
      content: [
        '# M-Flow Index',
        '',
        `episodes: ${options.state.manifest.episodeCount}`,
        `facets: ${options.state.manifest.facetCount}`,
        `facet_points: ${options.state.manifest.facetPointCount}`,
        `entities: ${options.state.manifest.entityCount}`,
        '',
        '## Episode Bundles',
        ...bundles.map(
          (bundle) =>
            `- ${bundle.episodeId} | best_path: ${bundle.bestPath.kind} | score: ${bundle.score.toFixed(3)} | ${summarizeText(options.state.episodes.find((episode) => episode.id === bundle.episodeId)?.summary || '', 100)}`
        ),
      ].join('\n'),
    },
    ...episodeArtifacts,
    ...pathArtifacts,
  ];
};
