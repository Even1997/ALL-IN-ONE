import assert from 'node:assert/strict';
import test from 'node:test';

import { runChangeSyncLane } from '../../src/modules/ai/knowledge/runChangeSyncLane.ts';

test('change sync lane returns proposal docs that can be confirmed in the knowledge base', async () => {
  const docs = await runChangeSyncLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [
      {
        id: 'req-1',
        title: '需求.md',
        content: '# 需求\n- 支持知识库整理',
        summary: '需求',
        authorRole: '浜у搧',
        sourceType: 'manual',
        updatedAt: '2026-04-27T00:00:00.000Z',
        status: 'ready',
      },
    ],
    generatedFiles: [
      {
        path: 'design/prototypes/home.html',
        content: '<main>home</main>',
        language: 'html',
        category: 'design',
        summary: '首页原型',
        sourceTaskIds: [],
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
    ],
    executeText: async () =>
      JSON.stringify({
        'change-sync-proposal': { summary: '同步建议', content: '# 变更同步提案' },
        'change-sync-checklist': { summary: '确认项', content: '# 待确认同步项' },
      }),
  });

  assert.equal(docs.length, 2);
  assert.equal(docs.some((doc) => doc.title === '变更同步提案.md' && doc.docType === 'ai-summary'), true);
  assert.equal(docs.some((doc) => doc.title === '待确认同步项.md' && doc.docType === 'ai-summary'), true);
});
