import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('native m-flow model defines manifest, node, and edge contracts', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/m-flow/model.ts', import.meta.url), 'utf8');

  assert.match(source, /export interface MFlowManifest/);
  assert.match(source, /export interface MFlowEpisode/);
  assert.match(source, /export interface MFlowFacet/);
  assert.match(source, /export interface MFlowFacetPoint/);
  assert.match(source, /export interface MFlowEntity/);
  assert.match(source, /relationshipName: 'has_facet' \| 'has_point' \| 'involves_entity'/);
});

test('native m-flow persistence targets dedicated .goodnight and output paths', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/m-flow/persistence.ts', import.meta.url), 'utf8');

  assert.match(source, /getVaultMFlowManifestPath/);
  assert.match(source, /getVaultMFlowEpisodesPath/);
  assert.match(source, /getVaultMFlowFacetsPath/);
  assert.match(source, /getVaultMFlowFacetPointsPath/);
  assert.match(source, /getVaultMFlowEntitiesPath/);
  assert.match(source, /getVaultMFlowEdgesPath/);
  assert.match(source, /_goodnight[\\/]+outputs[\\/]+m-flow/);
  assert.doesNotMatch(source, /base-index/);
  assert.doesNotMatch(source, /llmwiki/);
  assert.doesNotMatch(source, /rag/);
});
