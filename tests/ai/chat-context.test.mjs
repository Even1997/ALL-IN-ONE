import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatContextSnapshot,
  resolveCurrentReferenceFileIds,
  resolveKnowledgeContextSelection,
} from '../../src/modules/ai/chat/chatContext.ts';

const knowledgeEntries = [
  {
    id: 'doc-1',
    title: 'requirements-overview.md',
    summary: 'core requirements',
    content: '# Requirements',
    type: 'markdown',
    source: 'requirement',
    updatedAt: new Date().toISOString(),
    status: 'ready',
    kind: 'spec',
    tags: ['requirements'],
    relatedIds: [],
  },
  {
    id: 'doc-2',
    title: 'homepage-sketch.md',
    summary: 'homepage structure',
    content: '# Sketch',
    type: 'markdown',
    source: 'requirement',
    updatedAt: new Date().toISOString(),
    status: 'ready',
    kind: 'sketch',
    tags: ['sketch'],
    relatedIds: [],
  },
];

test('resolveKnowledgeContextSelection focuses active doc and keeps the rest as background', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'knowledge',
    knowledgeMode: 'off',
    knowledgeEntries,
    activeKnowledgeFileId: 'doc-1',
  });

  assert.equal(result.currentFile?.id, 'doc-1');
  assert.equal(result.relatedFiles.length, 1);
  assert.equal(result.relatedFiles[0].id, 'doc-2');
});

test('resolveKnowledgeContextSelection can clear document focus while keeping knowledge background', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'knowledge',
    knowledgeMode: 'all',
    knowledgeEntries,
    activeKnowledgeFileId: null,
  });

  assert.equal(result.currentFile, null);
  assert.equal(result.relatedFiles.length, 2);
});

test('resolveKnowledgeContextSelection uses the active doc when page chat enables knowledge context', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'page',
    knowledgeMode: 'all',
    knowledgeEntries,
    activeKnowledgeFileId: 'doc-1',
  });

  assert.equal(result.currentFile?.id, 'doc-1');
  assert.equal(result.relatedFiles.length, 1);
  assert.equal(result.relatedFiles[0].id, 'doc-2');
});

test('buildChatContextSnapshot keeps page context primary and knowledge optional', () => {
  const result = buildChatContextSnapshot({
    scene: 'page',
    pageTitle: 'Home',
    selectedElementLabel: 'Hero section',
    knowledgeLabel: 'Knowledge / current.md',
  });

  assert.equal(result.primaryLabel, '页面 / Home');
  assert.equal(result.secondaryLabel, '设计 / Hero section');
  assert.equal(result.knowledgeLabel, 'Knowledge / current.md');
});

test('buildChatContextSnapshot does not duplicate knowledge label in knowledge scene', () => {
  const result = buildChatContextSnapshot({
    scene: 'knowledge',
    knowledgeLabel: 'Knowledge / requirements.md',
  });

  assert.equal(result.primaryLabel, 'Knowledge / requirements.md');
  assert.equal(result.secondaryLabel, null);
  assert.equal(result.knowledgeLabel, null);
});

test('resolveCurrentReferenceFileIds keeps knowledge current scope on the focused file only', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'knowledge',
    activeKnowledgeFileId: 'doc-2',
    selectedPagePath: null,
    availableFileIds: ['doc-1', 'doc-2', 'doc-3'],
  });

  assert.deepEqual(result, ['doc-2']);
});

test('resolveCurrentReferenceFileIds stays empty when knowledge focus is cleared', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'knowledge',
    activeKnowledgeFileId: null,
    selectedPagePath: null,
    availableFileIds: ['doc-1', 'doc-2'],
  });

  assert.deepEqual(result, []);
});

test('resolveCurrentReferenceFileIds keeps page current scope on the focused page only', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'page',
    activeKnowledgeFileId: 'doc-2',
    selectedPagePath: 'sketch/pages/home.md',
    availableFileIds: ['doc-1', 'doc-2', 'sketch/pages/home.md'],
  });

  assert.deepEqual(result, ['sketch/pages/home.md']);
});
