import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeContextSections } from '../../src/modules/knowledge/knowledgeContext.ts';

test('buildKnowledgeContextSections includes current file before related files', () => {
  const sections = buildKnowledgeContextSections({
    currentFile: {
      title: '草图.md',
      type: 'markdown',
      summary: '首页草图',
      content: '# 首页',
    },
    relatedFiles: [
      {
        title: '风格说明.md',
        type: 'markdown',
        summary: '视觉方向',
        content: '卡片更轻',
      },
    ],
  });

  assert.match(sections, /current_file/);
  assert.match(sections, /related_files/);
  assert.ok(sections.indexOf('草图.md') < sections.indexOf('风格说明.md'));
});

test('buildKnowledgeContextSections omits related section when there are no related files', () => {
  const sections = buildKnowledgeContextSections({
    currentFile: {
      title: '首页设计.html',
      type: 'html',
      summary: '设计结果',
      content: '<html></html>',
    },
    relatedFiles: [],
  });

  assert.match(sections, /current_file/);
  assert.doesNotMatch(sections, /related_files/);
});
