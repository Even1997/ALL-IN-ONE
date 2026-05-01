import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestMFlowSources } from '../src/modules/knowledge/m-flow/ingest.ts';
import { buildEpisodes } from '../src/modules/knowledge/m-flow/buildEpisodes.ts';
import { buildFacets } from '../src/modules/knowledge/m-flow/buildFacets.ts';
import { buildFacetPoints } from '../src/modules/knowledge/m-flow/buildFacetPoints.ts';
import { buildEntities } from '../src/modules/knowledge/m-flow/buildEntities.ts';
import { buildEdges } from '../src/modules/knowledge/m-flow/buildEdges.ts';

test('native m-flow builders derive episodes, facets, points, entities, and edges from sources', async () => {
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
        path: 'src/search.ts',
        content: 'export const bundleScoring = () => "Entity links flow through bundle scoring";',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  });

  const episodes = buildEpisodes(sources);
  const facets = buildFacets(episodes);
  const facetPoints = buildFacetPoints(facets);
  const entities = buildEntities({ episodes, facets, sources });
  const edges = buildEdges({ episodes, facets, facetPoints, entities });

  assert.equal(episodes.length, 2);
  assert.equal(facets.every((facet) => facet.anchorText), true);
  assert.equal(facetPoints.some((point) => point.searchText.includes('500ms')), true);
  assert.equal(entities.some((entity) => entity.name === 'MIT'), true);
  assert.equal(edges.some((edge) => edge.relationshipName === 'has_point'), true);
  assert.equal(edges.some((edge) => edge.edgeText.includes('->')), true);
});
