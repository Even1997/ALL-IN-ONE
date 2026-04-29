import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnowledgeRuntimeArtifacts,
  buildKnowledgeRuntimePromptContext,
} from '../src/modules/knowledge/runtime/knowledgeRuntime.ts';
import { buildSystemIndex } from '../src/modules/knowledge/systemIndex.ts';

const buildRuntimeIndex = () =>
  buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-30T00:00:00.000Z',
    sources: [
      {
        id: 'knowledge:prd',
        path: 'project/prd.md',
        title: 'prd.md',
        content: '# Product Requirements\n\nThe assistant should answer from stable knowledge artifacts.',
        updatedAt: '2026-04-29T00:00:00.000Z',
        kind: 'knowledge-doc',
        tags: ['prd'],
        summary: 'Stable product requirements',
      },
      {
        id: 'project-file:src/search.ts',
        path: 'src/search.ts',
        title: 'search.ts',
        content: 'export function rankEvidencePath(query) { return query; }',
        updatedAt: '2026-04-29T00:30:00.000Z',
        kind: 'project-file',
        tags: ['ts'],
        summary: 'Evidence path ranking implementation',
      },
    ],
  });

test('knowledge runtime dispatches prompt context by selected mode', () => {
  const index = buildRuntimeIndex();

  const llmwiki = buildKnowledgeRuntimePromptContext({
    index,
    knowledgeRetrievalMethod: 'llmwiki',
    userInput: 'How should the assistant answer?',
  });
  const mFlow = buildKnowledgeRuntimePromptContext({
    index,
    knowledgeRetrievalMethod: 'm-flow',
    userInput: 'How is evidence ranked?',
  });
  const rag = buildKnowledgeRuntimePromptContext({
    index,
    knowledgeRetrievalMethod: 'rag',
    userInput: 'Find evidence about search',
  });

  assert.match(llmwiki.policySection, /structured wiki pages/i);
  assert.match(llmwiki.expandedSection, /llmwiki_wiki_pages:/);
  assert.doesNotMatch(llmwiki.expandedSection, /m_flow_paths:/);

  assert.match(mFlow.policySection, /evidence path/i);
  assert.match(mFlow.expandedSection, /m_flow_paths:/);
  assert.doesNotMatch(mFlow.expandedSection, /llmwiki_wiki_pages:/);

  assert.match(rag.policySection, /standard chunk retrieval/i);
  assert.match(rag.expandedSection, /rag_chunks:/);
  assert.doesNotMatch(rag.expandedSection, /m_flow_paths:/);
});

test('knowledge runtime adapters expose mode-specific visible artifacts', () => {
  const index = buildRuntimeIndex();

  const llmwiki = buildKnowledgeRuntimeArtifacts({
    index,
    knowledgeRetrievalMethod: 'llmwiki',
    vaultPath: 'C:\\Vault\\Demo',
  });
  assert.ok(llmwiki.some((artifact) => artifact.path.endsWith('\\_goodnight\\outputs\\llmwiki\\raw\\project-prd.md')));
  assert.ok(llmwiki.some((artifact) => artifact.path.endsWith('\\_goodnight\\outputs\\llmwiki\\wiki\\project-prd.md')));
  assert.ok(llmwiki.some((artifact) => artifact.path.endsWith('\\_goodnight\\outputs\\llmwiki\\index.md')));
  assert.ok(llmwiki.some((artifact) => artifact.path.endsWith('\\_goodnight\\outputs\\llmwiki\\log.md')));
  assert.ok(llmwiki.some((artifact) => artifact.path.endsWith('\\.goodnight\\skills\\llmwiki\\manifest.md')));
  assert.ok(llmwiki.some((artifact) => artifact.content.includes('## Source Coverage')));
  assert.ok(llmwiki.some((artifact) => artifact.content.includes('## Open Questions')));
  assert.equal(llmwiki.some((artifact) => /\.(json|jsonl)$/i.test(artifact.path)), false);

  const mFlow = buildKnowledgeRuntimeArtifacts({
    index,
    knowledgeRetrievalMethod: 'm-flow',
    vaultPath: '/vault/demo',
  });
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/episodes/project-prd.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/facets/project-prd.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/facet-points/project-prd.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/entities/project-prd.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/paths/project-prd.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/index.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/.goodnight/skills/m-flow/graph.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/.goodnight/skills/m-flow/anchors.md')));
  assert.ok(mFlow.some((artifact) => artifact.path.endsWith('/.goodnight/skills/m-flow/path-index.md')));
  assert.ok(mFlow.some((artifact) => artifact.content.includes('facet-point:')));
  assert.ok(mFlow.some((artifact) => artifact.content.includes('## Evidence Bundle')));
  assert.ok(mFlow.some((artifact) => artifact.content.includes('Path cost:')));
  assert.ok(mFlow.some((artifact) => artifact.content.includes('edge_text:')));
  assert.ok(mFlow.some((artifact) => artifact.content.includes('strongest_path:')));
  assert.equal(mFlow.some((artifact) => /\.(json|jsonl)$/i.test(artifact.path)), false);

  const rag = buildKnowledgeRuntimeArtifacts({
    index,
    knowledgeRetrievalMethod: 'rag',
    vaultPath: '/vault/demo',
  });
  assert.ok(rag.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/rag/retrieval-guide.md')));
  assert.ok(rag.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/rag/source-digests/project-prd.md')));
});

test('knowledge runtime artifact generation skips previous runtime outputs', () => {
  const index = buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-30T00:00:00.000Z',
    sources: [
      {
        id: 'project-file:project/prd.md',
        path: 'project/prd.md',
        title: 'prd.md',
        content: '# PRD\n\nReal project source.',
        updatedAt: '2026-04-29T00:00:00.000Z',
        kind: 'project-file',
        tags: ['md'],
        summary: 'Real source',
      },
      {
        id: 'generated:_goodnight/outputs/llmwiki/wiki/project-prd.md',
        path: '_goodnight/outputs/llmwiki/wiki/project-prd.md',
        title: 'project-prd.md',
        content: '# Wiki: prd.md',
        updatedAt: '2026-04-29T00:30:00.000Z',
        kind: 'generated-file',
        tags: ['md'],
        summary: 'Previous runtime output',
      },
    ],
  });

  const artifacts = buildKnowledgeRuntimeArtifacts({
    index,
    knowledgeRetrievalMethod: 'llmwiki',
    vaultPath: '/vault/demo',
  });

  assert.ok(artifacts.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/llmwiki/wiki/project-prd.md')));
  assert.equal(
    artifacts.some((artifact) =>
      artifact.path.endsWith('/_goodnight/outputs/llmwiki/wiki/goodnight-outputs-llmwiki-wiki-project-prd.md')
    ),
    false
  );
});

test('llmwiki prompt context reuses indexed wiki pages instead of inventing second-generation paths', () => {
  const index = buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-30T00:00:00.000Z',
    sources: [
      {
        id: 'generated:_goodnight/outputs/llmwiki/wiki/project-prd.md',
        path: '_goodnight/outputs/llmwiki/wiki/project-prd.md',
        title: 'project-prd.md',
        content: '# Product Requirements\n\nStable wiki page about assistant knowledge behavior.',
        updatedAt: '2026-04-29T00:30:00.000Z',
        kind: 'generated-file',
        tags: ['md'],
        summary: 'Stable wiki page',
      },
    ],
  });

  const context = buildKnowledgeRuntimePromptContext({
    index,
    knowledgeRetrievalMethod: 'llmwiki',
    userInput: 'assistant knowledge behavior',
  });

  assert.match(context.expandedSection, /wiki_page: _goodnight\/outputs\/llmwiki\/wiki\/project-prd\.md/);
  assert.doesNotMatch(context.expandedSection, /goodnight-outputs-llmwiki-wiki-project-prd\.md/);
});
