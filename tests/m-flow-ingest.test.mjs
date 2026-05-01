import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestMFlowSources } from '../src/modules/knowledge/m-flow/ingest.ts';

test('ingestMFlowSources normalizes project inputs and ignores hidden runtime directories', async () => {
  const ingestedSources = await ingestMFlowSources({
    vaultPath: 'C:/vault/demo',
    requirementDocs: [],
    generatedFiles: [],
    projectFiles: [
      {
        path: 'project/prd.md',
        content: '# PRD\n\nCheckout deadline is Friday.\nP99 target stays under 500ms.',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        path: 'src/search.ts',
        content: 'export const search = () => "Search ranking uses bundle scoring";',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        path: '.goodnight/m-flow/manifest.json',
        content: '{"version":1}',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        path: '_goodnight/outputs/m-flow/index.md',
        content: '# generated',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(
    ingestedSources.map((source) => source.path),
    ['project/prd.md', 'src/search.ts']
  );
  assert.equal(ingestedSources[0].kind, 'project-file');
  assert.equal(ingestedSources.every((source) => source.summary.length > 0), true);
});
