import assert from 'node:assert/strict';
import test from 'node:test';

import { rebuildProjectMFlow, buildMFlowPromptContext, loadMFlowPromptState } from '../src/modules/knowledge/m-flow/runtime.ts';

test('native m-flow runtime rebuilds state and returns artifact paths for hidden state plus rendered outputs', async () => {
  const rebuilt = await rebuildProjectMFlow({
    projectId: 'project-1',
    projectName: 'GoodNight',
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

  assert.ok(rebuilt.artifacts.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/index.md')));
  assert.ok(rebuilt.artifacts.some((artifact) => artifact.path.endsWith('/.goodnight/m-flow/edges.json')));
  assert.equal(rebuilt.state.manifest.episodeCount, 2);
});

test('native m-flow runtime builds prompt context from episode bundle scoring', async () => {
  const rebuilt = await rebuildProjectMFlow({
    projectId: 'project-1',
    projectName: 'GoodNight',
    vaultPath: 'C:/vault/demo',
    requirementDocs: [],
    generatedFiles: [],
    projectFiles: [
      {
        path: 'project/deadline.md',
        content: '# Deadline\n\nCheckout deadline is Friday.\nP99 target stays under 500ms.\nMIT partner review is required.',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  });

  const promptContext = buildMFlowPromptContext(rebuilt.state, 'Was the P99 target under 500ms?');

  assert.match(promptContext.expandedSection, /best_path:/);
  assert.match(promptContext.expandedSection, /episode_bundle:/);
  assert.match(promptContext.indexSection, /episode:deadline/);
  assert.equal(promptContext.labels.length > 0, true);
});

test('native m-flow runtime prefers cached prompt state before rebuilding', async () => {
  const cached = (
    await rebuildProjectMFlow({
      projectId: 'project-1',
      projectName: 'GoodNight',
      vaultPath: 'C:/vault/demo',
      requirementDocs: [],
      generatedFiles: [],
      projectFiles: [
        {
          path: 'project/cached.md',
          content: '# Cached\n\nReuse the existing prompt state when available.',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })
  ).state;

  const loaded = await loadMFlowPromptState({
    projectId: 'project-1',
    projectName: 'GoodNight',
    vaultPath: 'C:/vault/demo',
    requirementDocs: [],
    generatedFiles: [],
    cachedState: cached,
  });

  assert.equal(loaded.source, 'cache');
  assert.equal(loaded.state, cached);
});
