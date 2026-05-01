import assert from 'node:assert/strict';
import test from 'node:test';

const loadStore = async () =>
  import(`../src/features/knowledge/store/knowledgeSessionArtifactsStore.ts?test=${Date.now()}`);

const getSessionArtifacts = (state, projectId, sessionId) =>
  Object.values(state.artifactsBySession)
    .flat()
    .filter((artifact) => artifact.projectId === projectId && artifact.sessionId === sessionId);

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

  const [entry] = getSessionArtifacts(useKnowledgeSessionArtifactsStore.getState(), 'project-1', 'session-1');
  assert.equal(entry.title, '影响分析');
  assert.equal(entry.status, 'session');
});

test('knowledge session artifacts store dedupes by id and keeps newest artifacts first', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '旧版本',
    artifactType: 'candidate-summary',
    summary: 'old',
    body: 'old',
    status: 'session',
    createdAt: 1,
  });
  store.upsertArtifact({
    id: 'artifact-2',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '较新内容',
    artifactType: 'candidate-summary',
    summary: 'new',
    body: 'new',
    status: 'session',
    createdAt: 3,
  });
  store.upsertArtifact({
    id: 'artifact-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '更新后的旧条目',
    artifactType: 'candidate-summary',
    summary: 'updated',
    body: 'updated',
    status: 'promoted',
    createdAt: 2,
  });

  const entries = getSessionArtifacts(useKnowledgeSessionArtifactsStore.getState(), 'project-1', 'session-1');
  assert.deepEqual(
    entries.map((artifact) => [artifact.id, artifact.title, artifact.status]),
    [
      ['artifact-2', '较新内容', 'session'],
      ['artifact-1', '更新后的旧条目', 'promoted'],
    ]
  );
});

test('knowledge session artifacts store updates artifact status in place', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '候选摘要',
    artifactType: 'candidate-summary',
    summary: 'summary',
    body: 'body',
    status: 'session',
    createdAt: 1,
  });

  store.setArtifactStatus('project-1', 'session-1', 'artifact-1', 'discarded');

  const [entry] = getSessionArtifacts(useKnowledgeSessionArtifactsStore.getState(), 'project-1', 'session-1');
  assert.equal(entry.status, 'discarded');
  assert.equal(entry.title, '候选摘要');
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
  store.setActiveArtifact('project-1', 'session-a', 'artifact-a');
  store.setActiveArtifact('project-1', 'session-b', 'artifact-b');

  store.clearSessionArtifacts('project-1', 'session-a');

  assert.equal(getSessionArtifacts(useKnowledgeSessionArtifactsStore.getState(), 'project-1', 'session-a').length, 0);
  assert.equal(getSessionArtifacts(useKnowledgeSessionArtifactsStore.getState(), 'project-1', 'session-b').length, 1);
  assert.equal(Object.values(useKnowledgeSessionArtifactsStore.getState().activeArtifactIdBySession).includes('artifact-a'), false);
  assert.equal(Object.values(useKnowledgeSessionArtifactsStore.getState().activeArtifactIdBySession).includes('artifact-b'), true);
});
