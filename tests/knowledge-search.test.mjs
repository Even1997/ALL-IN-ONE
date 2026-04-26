import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeSearchIndex, searchKnowledgeEntries } from '../src/modules/knowledge/knowledgeSearch.ts';

test('knowledge search matches title and content with deterministic ordering', () => {
  const entries = [
    { id: 'a', title: '产品需求', content: '支持 Markdown 编辑与搜索', summary: '产品摘要' },
    { id: 'b', title: '设计草图', content: '页面画布与结构说明', summary: '设计摘要' },
    { id: 'c', title: '搜索约定', content: '全文索引需要稳定排序', summary: '工程摘要' },
  ];

  const index = buildKnowledgeSearchIndex(entries);

  assert.deepEqual(searchKnowledgeEntries(index, '').map((entry) => entry.id), ['a', 'b', 'c']);
  assert.deepEqual(searchKnowledgeEntries(index, 'Markdown').map((entry) => entry.id), ['a']);
  assert.deepEqual(searchKnowledgeEntries(index, '搜索').map((entry) => entry.id), ['a', 'c']);
});
