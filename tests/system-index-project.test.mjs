import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildSystemIndex } from '../src/modules/knowledge/systemIndex.ts';
import {
  buildProjectSystemIndexArtifact,
  getProjectSystemIndexArtifactPath,
} from '../src/modules/knowledge/systemIndexProject.ts';

const buildIndex = () =>
  buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-30T00:00:00.000Z',
    sources: [
      {
        id: 'knowledge:prd',
        path: 'project/prd.md',
        title: 'prd.md',
        content: '# PRD\n\nDescribe the product goals and AI workflow.',
        updatedAt: '2026-04-29T00:00:00.000Z',
        kind: 'knowledge-doc',
        tags: ['md'],
        summary: 'Product goals',
      },
      {
        id: 'project-file:src/components/chat.tsx',
        path: 'src/components/chat.tsx',
        title: 'chat.tsx',
        content: 'export function ChatPanel() { return "index"; }',
        updatedAt: '2026-04-29T00:30:00.000Z',
        kind: 'project-file',
        tags: ['tsx'],
        summary: 'Chat panel',
      },
    ],
  });

test('project system index artifact path uses mode-specific visible outputs directory', () => {
  assert.equal(
    getProjectSystemIndexArtifactPath('C:\\Vault\\Demo', 'llmwiki'),
    'C:\\Vault\\Demo\\_goodnight\\outputs\\llmwiki\\system-index.md'
  );
  assert.equal(
    getProjectSystemIndexArtifactPath('/vault/demo', 'm-flow'),
    '/vault/demo/_goodnight/outputs/m-flow/system-index.md'
  );
});

test('project system index artifact summarizes index output for humans', () => {
  const artifact = buildProjectSystemIndexArtifact(buildIndex(), 'llmwiki');

  assert.match(artifact, /^# System Index Artifact$/m);
  assert.match(artifact, /Retrieval method: `llmwiki`/);
  assert.match(artifact, /Sources: 2/);
  assert.match(artifact, /Chunks: \d+/);
  assert.match(artifact, /Top topics/);
  assert.match(artifact, /project\/prd\.md/);
  assert.match(artifact, /src\/components\/chat\.tsx/);
  assert.match(artifact, /\.goodnight\/base-index\/manifest\.json/);
});

test('refreshProjectSystemIndex persists a visible artifact alongside hidden base-index files', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/systemIndexProject.ts', import.meta.url), 'utf8');

  assert.match(source, /export const getProjectSystemIndexArtifactPath =/);
  assert.match(source, /export const buildProjectSystemIndexArtifact =/);
  assert.match(source, /writeProjectTextFile\(getProjectSystemIndexArtifactPath\(options\.vaultPath, options\.knowledgeRetrievalMethod\), buildProjectSystemIndexArtifact\(nextIndex, options\.knowledgeRetrievalMethod\)\)/);
});

test('refreshProjectSystemIndex can skip visible retrieval artifacts and keep only hidden base-index files fresh', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/systemIndexProject.ts', import.meta.url), 'utf8');

  assert.match(source, /writeRuntimeArtifacts\?: boolean/);
  assert.match(source, /if \(options\.writeRuntimeArtifacts !== false\)/);
  assert.match(source, /ensureVaultKnowledgeRuntimeDirectoryStructure\(options\.vaultPath,\s*options\.knowledgeRetrievalMethod\)/);
});
