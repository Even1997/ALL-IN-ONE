import assert from 'node:assert/strict';
import test from 'node:test';

const loadTemporaryKnowledgeFlow = async () =>
  import(`../../src/modules/ai/knowledge/temporaryKnowledgeFlow.ts?test=${Date.now()}`);

const loadKnowledgeSessionArtifactsStore = async () =>
  import(`../../src/features/knowledge/store/knowledgeSessionArtifactsStore.ts?test=${Date.now()}_${Math.random()}`);

const buildSessionArtifact = (overrides = {}) => ({
  id: 'artifact-1',
  projectId: 'project-1',
  sessionId: 'session-1',
  title: '变更同步候选.md',
  artifactType: 'candidate-summary',
  summary: '待确认的变更同步候选',
  body: '# 变更同步候选',
  status: 'session',
  createdAt: 1,
  ...overrides,
});

test('change-sync temporary flow creates session-scoped artifacts and structured cards before any proposal exists', async () => {
  const { buildChangeSyncSessionArtifacts, buildChangeSyncTemporaryReply } = await loadTemporaryKnowledgeFlow();

  const artifacts = buildChangeSyncSessionArtifacts({
    projectId: 'project-1',
    sessionId: 'session-1',
    createdAt: 100,
    docs: [
      {
        id: 'doc-1',
        title: 'change-sync-proposal.md',
        summary: '同步原型差异',
        content: '# Proposal',
        authorRole: '产品',
        updatedAt: '2026-05-01T00:00:00.000Z',
        status: 'ready',
      },
      {
        id: 'doc-2',
        title: 'change-sync-checklist.md',
        summary: '确认落地清单',
        content: '# Checklist',
        authorRole: '产品',
        updatedAt: '2026-05-01T00:00:00.000Z',
        status: 'ready',
      },
    ],
  });

  assert.equal(artifacts.length, 2);
  assert.deepEqual(
    artifacts.map((artifact) => ({
      projectId: artifact.projectId,
      sessionId: artifact.sessionId,
      title: artifact.title,
      summary: artifact.summary,
      body: artifact.body,
      status: artifact.status,
    })),
    [
      {
        projectId: 'project-1',
        sessionId: 'session-1',
        title: 'change-sync-proposal.md',
        summary: '同步原型差异',
        body: '# Proposal',
        status: 'session',
      },
      {
        projectId: 'project-1',
        sessionId: 'session-1',
        title: 'change-sync-checklist.md',
        summary: '确认落地清单',
        body: '# Checklist',
        status: 'session',
      },
    ]
  );

  const reply = buildChangeSyncTemporaryReply(artifacts);

  assert.match(reply.content, /2/);
  assert.deepEqual(reply.cards.map((card) => card.type), ['summary', 'temporary-content', 'temporary-content']);
  assert.equal(reply.cards[1].artifactId, artifacts[0].id);
  assert.equal(reply.cards[2].artifactId, artifacts[1].id);
});

test('temporary artifact proposal linkage uses explicit artifact ids so duplicate titles stay isolated', async () => {
  const {
    buildTemporaryArtifactPromotionProposal,
    collectPendingTemporaryArtifactIds,
    findTemporaryArtifactForProposal,
  } = await loadTemporaryKnowledgeFlow();
  const firstArtifact = buildSessionArtifact({
    id: 'artifact-a',
    title: '同名候选.md',
    summary: 'A 版本',
    body: '# A',
  });
  const secondArtifact = buildSessionArtifact({
    id: 'artifact-b',
    title: '同名候选.md',
    summary: 'B 版本',
    body: '# B',
    createdAt: 2,
  });

  const firstProposal = buildTemporaryArtifactPromotionProposal({
    projectId: 'project-1',
    artifact: firstArtifact,
  });
  const dismissedSecondProposal = {
    ...buildTemporaryArtifactPromotionProposal({
      projectId: 'project-1',
      artifact: secondArtifact,
    }),
    status: 'dismissed',
  };

  assert.equal(firstProposal.sourceArtifactId, 'artifact-a');
  assert.equal(dismissedSecondProposal.sourceArtifactId, 'artifact-b');
  assert.equal(findTemporaryArtifactForProposal([firstArtifact, secondArtifact], firstProposal)?.id, 'artifact-a');
  assert.equal(
    findTemporaryArtifactForProposal([firstArtifact, secondArtifact], dismissedSecondProposal)?.id,
    'artifact-b'
  );

  const pendingArtifactIds = collectPendingTemporaryArtifactIds(
    [firstArtifact, secondArtifact],
    [firstProposal, dismissedSecondProposal]
  );

  assert.deepEqual([...pendingArtifactIds], ['artifact-a']);
});

test('temporary artifact cards reflect the current stored artifact status after promotion', async () => {
  const { syncTemporaryArtifactCardStatuses } = await loadTemporaryKnowledgeFlow();
  const cards = [
    {
      type: 'temporary-content',
      artifactId: 'artifact-1',
      title: '变更同步候选.md',
      artifactType: 'candidate-summary',
      summary: '待确认的变更同步候选',
      body: '# Candidate',
      status: 'session',
    },
  ];

  const nextCards = syncTemporaryArtifactCardStatuses(cards, [
    buildSessionArtifact({
      id: 'artifact-1',
      status: 'promoted',
    }),
  ]);

  assert.equal(nextCards[0].status, 'promoted');
  assert.equal(cards[0].status, 'session');
});

test('rehydration rebuilds session artifacts from persisted messages and preserves executed vs dismissed status correctly', async () => {
  const { buildSessionArtifactsFromStoredMessages } = await loadTemporaryKnowledgeFlow();
  const { useKnowledgeSessionArtifactsStore } = await loadKnowledgeSessionArtifactsStore();
  const artifactStore = useKnowledgeSessionArtifactsStore.getState();

  const artifacts = buildSessionArtifactsFromStoredMessages({
    projectId: 'project-1',
    sessionId: 'session-1',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'temporary content',
        createdAt: 10,
        structuredCards: [
          {
            type: 'temporary-content',
            artifactId: 'artifact-a',
            title: '同名候选.md',
            artifactType: 'candidate-summary',
            summary: 'A 版本',
            body: '# A',
            status: 'session',
          },
          {
            type: 'temporary-content',
            artifactId: 'artifact-b',
            title: '同名候选.md',
            artifactType: 'candidate-summary',
            summary: 'B 版本',
            body: '# B',
            status: 'session',
          },
        ],
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'promoted proposal',
        createdAt: 11,
        knowledgeProposal: {
          id: 'proposal-a',
          projectId: 'project-1',
          sourceArtifactId: 'artifact-a',
          summary: '已从会话临时内容生成待确认知识：同名候选.md',
          trigger: 'change-sync',
          createdAt: 11,
          status: 'executed',
          operations: [],
        },
      },
      {
        id: 'assistant-3',
        role: 'assistant',
        content: 'dismissed proposal',
        createdAt: 12,
        knowledgeProposal: {
          id: 'proposal-b',
          projectId: 'project-1',
          sourceArtifactId: 'artifact-b',
          summary: '已从会话临时内容生成待确认知识：同名候选.md',
          trigger: 'change-sync',
          createdAt: 12,
          status: 'dismissed',
          operations: [],
        },
      },
    ],
  });

  for (const artifact of artifacts) {
    artifactStore.upsertArtifact(artifact);
  }

  const storedArtifacts = Object.fromEntries(
    useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-1'].map((artifact) => [
      artifact.id,
      artifact.status,
    ])
  );

  assert.deepEqual(storedArtifacts, {
    'artifact-a': 'promoted',
    'artifact-b': 'session',
  });
});

test('promotion dedupe detects an existing non-dismissed proposal for the same source artifact id', async () => {
  const { findExistingTemporaryArtifactProposal } = await loadTemporaryKnowledgeFlow();

  const existingProposal = findExistingTemporaryArtifactProposal(
    [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'proposal',
        createdAt: 10,
        knowledgeProposal: {
          id: 'proposal-1',
          projectId: 'project-1',
          sourceArtifactId: 'artifact-1',
          summary: '已从会话临时内容生成待确认知识：候选.md',
          trigger: 'change-sync',
          createdAt: 10,
          status: 'pending',
          operations: [],
        },
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'dismissed proposal',
        createdAt: 11,
        knowledgeProposal: {
          id: 'proposal-2',
          projectId: 'project-1',
          sourceArtifactId: 'artifact-2',
          summary: '已从会话临时内容生成待确认知识：候选.md',
          trigger: 'change-sync',
          createdAt: 11,
          status: 'dismissed',
          operations: [],
        },
      },
    ],
    { id: 'artifact-1', title: '鍊欓€?md' }
  );
  const dismissedProposal = findExistingTemporaryArtifactProposal(
    [
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'dismissed proposal',
        createdAt: 11,
        knowledgeProposal: {
          id: 'proposal-2',
          projectId: 'project-1',
          sourceArtifactId: 'artifact-2',
          summary: '已从会话临时内容生成待确认知识：候选.md',
          trigger: 'change-sync',
          createdAt: 11,
          status: 'dismissed',
          operations: [],
        },
      },
    ],
    { id: 'artifact-2', title: '鍊欓€?md' }
  );

  assert.equal(existingProposal?.id, 'proposal-1');
  assert.equal(dismissedProposal, null);
});

test('legacy persisted proposals without sourceArtifactId still rehydrate promoted state and pending linkage correctly', async () => {
  const {
    buildSessionArtifactsFromStoredMessages,
    buildTemporaryArtifactPromotionSummary,
    collectPendingTemporaryArtifactIds,
    findExistingTemporaryArtifactProposal,
    findTemporaryArtifactForProposal,
  } = await loadTemporaryKnowledgeFlow();

  const messages = [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'temporary content',
      createdAt: 10,
      structuredCards: [
        {
          type: 'temporary-content',
          artifactId: 'artifact-a',
          title: '旧版已执行候选.md',
          artifactType: 'candidate-summary',
          summary: 'legacy executed',
          body: '# Executed',
          status: 'session',
        },
        {
          type: 'temporary-content',
          artifactId: 'artifact-b',
          title: '旧版待处理候选.md',
          artifactType: 'candidate-summary',
          summary: 'legacy pending',
          body: '# Pending',
          status: 'session',
        },
      ],
    },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'legacy executed proposal',
        createdAt: 11,
        knowledgeProposal: {
          id: 'proposal-a',
          projectId: 'project-1',
          summary: buildTemporaryArtifactPromotionSummary('旧版已执行候选.md'),
          trigger: 'change-sync',
          createdAt: 11,
          status: 'executed',
        operations: [
          {
            id: 'op-a',
            type: 'create_note',
            targetTitle: '旧版已执行候选.md',
            reason: 'legacy executed',
            evidence: ['旧版已执行候选.md'],
            draftContent: '# Executed',
            riskLevel: 'low',
            selected: true,
          },
        ],
      },
    },
      {
        id: 'assistant-3',
        role: 'assistant',
        content: 'legacy pending proposal',
        createdAt: 12,
        knowledgeProposal: {
          id: 'proposal-b',
          projectId: 'project-1',
          summary: buildTemporaryArtifactPromotionSummary('旧版待处理候选.md'),
          trigger: 'change-sync',
          createdAt: 12,
          status: 'pending',
        operations: [
          {
            id: 'op-b',
            type: 'create_note',
            targetTitle: '旧版待处理候选.md',
            reason: 'legacy pending',
            evidence: ['旧版待处理候选.md'],
            draftContent: '# Pending',
            riskLevel: 'low',
            selected: true,
          },
        ],
      },
    },
  ];

  const artifacts = buildSessionArtifactsFromStoredMessages({
    projectId: 'project-1',
    sessionId: 'session-1',
    messages,
  });
  const artifactById = Object.fromEntries(artifacts.map((artifact) => [artifact.id, artifact]));
  const pendingArtifactIds = collectPendingTemporaryArtifactIds(
    artifacts,
    messages.flatMap((message) => (message.knowledgeProposal ? [message.knowledgeProposal] : []))
  );

  assert.equal(artifactById['artifact-a'].status, 'promoted');
  assert.equal(artifactById['artifact-b'].status, 'session');
  assert.deepEqual([...pendingArtifactIds], ['artifact-b']);
  assert.equal(findExistingTemporaryArtifactProposal(messages, artifactById['artifact-b'])?.id, 'proposal-b');
  assert.equal(findTemporaryArtifactForProposal(artifacts, messages[1].knowledgeProposal)?.id, 'artifact-a');
});

test('legacy non-temporary create_note proposals with the same target title do not match temporary artifacts', async () => {
  const {
    buildSessionArtifactsFromStoredMessages,
    collectPendingTemporaryArtifactIds,
    findExistingTemporaryArtifactProposal,
    findTemporaryArtifactForProposal,
  } = await loadTemporaryKnowledgeFlow();

  const messages = [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'temporary content',
      createdAt: 10,
      structuredCards: [
        {
          type: 'temporary-content',
          artifactId: 'artifact-1',
          title: '同名候选.md',
          artifactType: 'candidate-summary',
          summary: 'temporary artifact',
          body: '# Artifact',
          status: 'session',
        },
      ],
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      content: 'legacy non-temporary proposal',
      createdAt: 11,
      knowledgeProposal: {
        id: 'proposal-1',
        projectId: 'project-1',
        summary: '普通知识补全提案：同名候选.md',
        trigger: 'wiki-stale',
        createdAt: 11,
        status: 'pending',
        operations: [
          {
            id: 'op-1',
            type: 'create_note',
            targetTitle: '同名候选.md',
            reason: 'unrelated legacy proposal',
            evidence: ['同名候选.md'],
            draftContent: '# Different Source',
            riskLevel: 'low',
            selected: true,
          },
        ],
      },
    },
  ];

  const artifacts = buildSessionArtifactsFromStoredMessages({
    projectId: 'project-1',
    sessionId: 'session-1',
    messages,
  });
  const pendingArtifactIds = collectPendingTemporaryArtifactIds(
    artifacts,
    messages.flatMap((message) => (message.knowledgeProposal ? [message.knowledgeProposal] : []))
  );

  assert.equal(artifacts[0].status, 'session');
  assert.deepEqual([...pendingArtifactIds], []);
  assert.equal(findExistingTemporaryArtifactProposal(messages, artifacts[0]), null);
  assert.equal(findTemporaryArtifactForProposal(artifacts, messages[1].knowledgeProposal), null);
});
