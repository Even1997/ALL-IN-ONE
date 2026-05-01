import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestMFlowSources } from '../src/modules/knowledge/m-flow/ingest.ts';
import { buildEpisodes } from '../src/modules/knowledge/m-flow/buildEpisodes.ts';
import { buildFacets } from '../src/modules/knowledge/m-flow/buildFacets.ts';
import { buildFacetPoints } from '../src/modules/knowledge/m-flow/buildFacetPoints.ts';
import { buildEntities } from '../src/modules/knowledge/m-flow/buildEntities.ts';
import { buildEdges } from '../src/modules/knowledge/m-flow/buildEdges.ts';
import { searchAnchors } from '../src/modules/knowledge/m-flow/searchAnchors.ts';
import { scoreEpisodeBundles } from '../src/modules/knowledge/m-flow/scoreBundles.ts';

const buildState = async () => {
  const sources = await ingestMFlowSources({
    vaultPath: 'C:/vault/demo',
    requirementDocs: [],
    generatedFiles: [],
    projectFiles: [
      {
        path: 'project/deadline.md',
        content: '# Deadline\n\nCheckout deadline is Friday.\nP99 target stays under 500ms.\nMIT partner review is required.',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        path: 'project/latency.md',
        content: '# Latency\n\nP99 target stays under 900ms.\nRollout note remains broad.',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  });

  const episodes = buildEpisodes(sources);
  const facets = buildFacets(episodes);
  const facetPoints = buildFacetPoints(facets);
  const entities = buildEntities({ episodes, facets, sources });
  const edges = buildEdges({ episodes, facets, facetPoints, entities });

  return {
    manifest: {
      version: 1,
      builtAt: '2026-05-01T00:00:00.000Z',
      fingerprint: 'test',
      sourceCount: sources.length,
      episodeCount: episodes.length,
      facetCount: facets.length,
      facetPointCount: facetPoints.length,
      entityCount: entities.length,
      edgeCount: edges.length,
    },
    sources,
    episodes,
    facets,
    facetPoints,
    entities,
    edges,
  };
};

test('native m-flow search prefers point-routed bundles over direct episode hits', async () => {
  const state = await buildState();
  const anchors = searchAnchors(state, 'Was the P99 target under 500ms?');
  const results = scoreEpisodeBundles({ state, anchors, hopCost: 0.15, directEpisodePenalty: 0.4, edgeMissCost: 0.9 });

  assert.equal(results[0].bestPath.kind, 'point');
  assert.equal(results[0].episodeId, 'episode:deadline');
  assert.ok(results[0].score < results[1].score);
  assert.ok(results.every((result) => Number.isFinite(result.score)));

  const directOnlyResults = scoreEpisodeBundles({
    state,
    anchors: anchors.filter((anchor) => anchor.kind === 'episode'),
    hopCost: 0.15,
    directEpisodePenalty: 0.4,
    edgeMissCost: 0.9,
  });
  const directEpisodeScore = directOnlyResults.find((result) => result.episodeId === 'episode:deadline')?.score ?? Number.POSITIVE_INFINITY;
  const pointRoutedScore = results.find((result) => result.episodeId === 'episode:deadline')?.score ?? Number.POSITIVE_INFINITY;

  assert.ok(directEpisodeScore > pointRoutedScore);
});

test('native m-flow search supports entity-routed bundles', async () => {
  const state = await buildState();
  const anchors = searchAnchors(state, 'Which MIT partner needs review?');
  const results = scoreEpisodeBundles({ state, anchors, hopCost: 0.15, directEpisodePenalty: 0.4, edgeMissCost: 0.9 });

  assert.ok(results.some((result) => result.bestPath.kind === 'entity' || result.bestPath.kind === 'facet_entity'));
  assert.ok(results.every((result) => Number.isFinite(result.score)));
});
