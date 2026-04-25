import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatContextSnapshot,
  resolveKnowledgeSelectionForPrompt,
  resolveKnowledgeContextSelection,
} from '../../src/modules/ai/chat/chatContext.ts';

const knowledgeEntries = [
  {
    id: 'doc-1',
    title: '需求总览.md',
    summary: '核心需求',
    content: '# 需求',
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
    title: '首页草图.md',
    summary: '首页结构',
    content: '# 草图',
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
    selectedKnowledgeContextIds: ['doc-2'],
  });

  assert.equal(result.label, '知识文档 / 需求总览.md');
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
    selectedKnowledgeContextIds: ['doc-2'],
  });

  assert.equal(result.label, '知识库 / 按问题自动参考');
  assert.equal(result.currentFile, null);
  assert.equal(result.relatedFiles.length, 2);
});

test('resolveKnowledgeSelectionForPrompt does not restore first doc after focus is cleared', () => {
  const result = resolveKnowledgeSelectionForPrompt({
    scene: 'knowledge',
    knowledgeMode: 'all',
    knowledgeEntries,
    activeKnowledgeFileId: null,
    selectedKnowledgeContextIds: ['doc-2'],
  });

  assert.equal(result.currentFile, null);
  assert.deepEqual(
    result.relatedFiles.map((file) => file.id),
    ['doc-1', 'doc-2']
  );
});

test('resolveKnowledgeContextSelection respects user-selected mode in page scene', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'page',
    knowledgeMode: 'selected',
    knowledgeEntries,
    activeKnowledgeFileId: 'doc-1',
    selectedKnowledgeContextIds: ['doc-2'],
  });

  assert.equal(result.label, '知识文档 / 首页草图.md');
  assert.equal(result.currentFile?.id, 'doc-2');
  assert.equal(result.relatedFiles.length, 0);
});

test('buildChatContextSnapshot keeps page context primary and knowledge optional', () => {
  const result = buildChatContextSnapshot({
    scene: 'page',
    pageTitle: '首页',
    selectedElementLabel: 'Hero 区块',
    knowledgeLabel: '知识库 / 当前文档',
  });

  assert.equal(result.primaryLabel, '页面 / 首页');
  assert.equal(result.secondaryLabel, '设计 / Hero 区块');
  assert.equal(result.knowledgeLabel, '知识库 / 当前文档');
});

test('buildChatContextSnapshot does not duplicate knowledge label in knowledge scene', () => {
  const result = buildChatContextSnapshot({
    scene: 'knowledge',
    knowledgeLabel: '知识文档 / 需求规格说明书.md',
  });

  assert.equal(result.primaryLabel, '知识文档 / 需求规格说明书.md');
  assert.equal(result.secondaryLabel, null);
  assert.equal(result.knowledgeLabel, null);
});
