import assert from 'node:assert/strict';
import test from 'node:test';

const loadStore = async () =>
  import(`../src/features/knowledge/store/knowledgeSessionArtifactsStore.ts?test=${Date.now()}`);

test('knowledge session artifacts store keeps temporary content per session', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '影响分析',
    artifactType: 'impact-analysis',
    summary: '会员体系发生变化',
    body: '需要先确认是个人订阅还是团队订阅。',
    status: 'session',
    createdAt: 1,
  });

  const entry = useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-1'][0];
  assert.equal(entry.title, '影响分析');
  assert.equal(entry.status, 'session');
});

test('knowledge session artifacts store clears one session without touching another', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-a',
    projectId: 'project-1',
    sessionId: 'session-a',
    title: 'A',
    artifactType: 'candidate-summary',
    summary: 'A',
    body: 'A',
    status: 'session',
    createdAt: 1,
  });
  store.upsertArtifact({
    id: 'artifact-b',
    projectId: 'project-1',
    sessionId: 'session-b',
    title: 'B',
    artifactType: 'candidate-summary',
    summary: 'B',
    body: 'B',
    status: 'session',
    createdAt: 2,
  });

  store.clearSessionArtifacts('project-1', 'session-a');

  assert.equal(useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-a']?.length ?? 0, 0);
  assert.equal(useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-b'].length, 1);
});
