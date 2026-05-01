import assert from 'node:assert/strict';
import test from 'node:test';

test('buildKnowledgeTruthReply orders cards as summary, conflict, temporary content, then next-step', async () => {
  const { buildKnowledgeTruthReply } = await import('../../src/modules/ai/knowledge/buildKnowledgeTruthReply.ts');

  const reply = buildKnowledgeTruthReply({
    summary: '我识别到 2 条变化。',
    conflicts: [
      {
        id: 'conflict-1',
        title: '会员模型冲突',
        previousLabel: '旧知识：个人订阅',
        nextLabel: '新知识：团队订阅',
        sourceTitles: ['旧需求.md', '新需求.md'],
      },
    ],
    temporaryArtifacts: [
      {
        id: 'artifact-1',
        title: '影响分析',
        artifactType: 'impact-analysis',
        summary: '会员体系变化会影响支付和权限。',
        body: '需要同步检查定价、结算和后台权限。',
      },
    ],
    nextSteps: [{ id: 'confirm-conflict', label: '先确认冲突', prompt: '先确认冲突' }],
  });

  assert.equal(reply.content, '我识别到 2 条变化。');
  assert.deepEqual(reply.cards.map((card) => card.type), ['summary', 'conflict', 'temporary-content', 'next-step']);
});

test('buildKnowledgeTruthReply omits missing sections without changing summary-first order', async () => {
  const { buildKnowledgeTruthReply } = await import('../../src/modules/ai/knowledge/buildKnowledgeTruthReply.ts');

  const reply = buildKnowledgeTruthReply({
    summary: '这次只有候选摘要。',
    conflicts: [],
    temporaryArtifacts: [],
    nextSteps: [{ id: 'do-nothing', label: '暂不同步', prompt: '暂不同步' }],
  });

  assert.deepEqual(reply.cards.map((card) => card.type), ['summary', 'next-step']);
});
