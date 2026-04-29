import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSystemIndex,
  buildSystemIndexPromptContext,
  searchSystemIndex,
} from '../src/modules/knowledge/systemIndex.ts';

const buildSource = (overrides = {}) => ({
  id: overrides.id || 'source-1',
  path: overrides.path || 'project/prd.md',
  title: overrides.title || 'prd.md',
  content: overrides.content || '# PRD\n\n用户可以上传文件并提问。',
  updatedAt: overrides.updatedAt || '2026-04-29T00:00:00.000Z',
  kind: overrides.kind || 'knowledge-doc',
  tags: overrides.tags || [],
  summary: overrides.summary || 'Product requirements',
});

test('buildSystemIndex creates manifest, chunks, topics, and doc intents from mixed sources', () => {
  const index = buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-29T12:00:00.000Z',
    sources: [
      buildSource(),
      buildSource({
        id: 'source-2',
        path: 'src/features/search.ts',
        title: 'search.ts',
        content: 'export function searchIndex(query) { return query; }',
        kind: 'project-file',
        summary: 'Search implementation',
      }),
      buildSource({
        id: 'source-3',
        path: 'src/generated/spec.md',
        title: 'spec.md',
        content: '# Feature spec\n\n系统根据索引输出功能文档。',
        kind: 'generated-file',
        summary: 'Generated feature spec',
      }),
    ],
  });

  assert.equal(index.manifest.version, 1);
  assert.equal(index.manifest.sourceCount, 3);
  assert.equal(index.sources.length, 3);
  assert.equal(index.chunks.length >= 3, true);
  assert.equal(index.topics.length > 0, true);
  assert.deepEqual(index.docIntents.map((item) => item.id), ['qa', 'requirements-doc', 'feature-doc']);
  assert.match(index.sources[0].contentHash, /^[a-f0-9]{8}$/);
});

test('searchSystemIndex ranks relevant chunks for question answering and prompt context', () => {
  const index = buildSystemIndex({
    projectId: 'project-1',
    projectName: 'GoodNight',
    builtAt: '2026-04-29T12:00:00.000Z',
    sources: [
      buildSource({
        id: 'source-1',
        path: 'project/prd.md',
        title: 'prd.md',
        content: '# PRD\n\n用户可以上传文件，系统自动整理索引，然后 AI 根据知识库回答问题。',
      }),
      buildSource({
        id: 'source-2',
        path: 'src/ui/theme.css',
        title: 'theme.css',
        content: '.app { color: red; }',
        kind: 'project-file',
        summary: 'UI theme',
      }),
    ],
  });

  const results = searchSystemIndex(index, 'AI 如何根据知识库回答问题');
  assert.equal(results.length > 0, true);
  assert.equal(results[0].source.path, 'project/prd.md');

  const promptContext = buildSystemIndexPromptContext(index, '根据知识库回答问题');
  assert.match(promptContext.indexSection, /project\/prd\.md/);
  assert.match(promptContext.expandedSection, /AI 根据知识库回答问题/);
});
