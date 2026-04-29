import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadModule = async (relativePath) => {
  const modulePath = path.resolve(__dirname, `../src/${relativePath}`);
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('buildKnowledgeProposal creates a wiki update proposal from distilled evidence', async () => {
  const { buildKnowledgeProposal } = await loadModule('modules/ai/knowledge/buildKnowledgeProposal.ts');

  const proposal = buildKnowledgeProposal({
    projectId: 'project-1',
    summary: '发现一条项目总览已过时',
    trigger: 'wiki-stale',
    operations: [
      {
        type: 'update_wiki',
        targetTitle: '项目总览.md',
        reason: '当前对话总结出的 onboarding 流程与 wiki 不一致',
        evidence: ['note:需求讨论.md', 'chat:最近一轮问答'],
        draftContent: '# 项目总览\n\n更新后的 onboarding 流程',
      },
    ],
  });

  assert.equal(proposal.projectId, 'project-1');
  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].selected, true);
  assert.equal(proposal.operations[0].type, 'update_wiki');
  assert.equal(proposal.status, 'pending');
});

test('knowledge organize proposal preserves reference titles for generated wiki docs', async () => {
  const { buildKnowledgeOrganizeProposal } = await import('../src/modules/ai/knowledge/buildKnowledgeOrganizeProposal.ts');

  const proposal = buildKnowledgeOrganizeProposal({
    projectId: 'project-1',
    sourceTitles: ['开放问题', '术语表', '开放问题'],
    docs: [
      {
        id: 'doc-1',
        title: 'project-overview.md',
        content: '# Project overview',
        summary: 'Project overview',
        kind: 'note',
        docType: 'wiki-index',
        tags: ['knowledge-organize'],
        relatedIds: [],
        authorRole: 'product',
        sourceType: 'ai',
        updatedAt: '2026-04-29T00:00:00.000Z',
        status: 'ready',
      },
    ],
  });

  assert.deepEqual(proposal.operations[0].referenceTitles, ['开放问题', '术语表']);
});

test('supported proposal signals trigger knowledge suggestions', async () => {
  const { shouldSuggestKnowledgeProposal } = await loadModule('modules/ai/knowledge/shouldSuggestKnowledgeProposal.ts');

  assert.equal(
    shouldSuggestKnowledgeProposal({
      hasGap: true,
      hasStaleWiki: false,
      hasDuplicates: false,
      canDistill: false,
    }),
    true
  );
  assert.equal(
    shouldSuggestKnowledgeProposal({
      hasGap: false,
      hasStaleWiki: false,
      hasDuplicates: false,
      canDistill: false,
    }),
    false
  );
});

test('delete-like operations are not executable knowledge proposal operations', async () => {
  const { isExecutableKnowledgeProposalOperation } = await import('../src/modules/ai/knowledge/executeKnowledgeProposal.ts');

  assert.equal(
    isExecutableKnowledgeProposalOperation({
      id: 'op-1',
      type: 'archive_candidate',
      targetTitle: '旧流程.md',
      reason: '内容已过时',
      evidence: ['note:旧流程.md'],
      draftContent: '# 旧流程',
      riskLevel: 'low',
      selected: true,
    }),
    true
  );

  assert.equal(
    isExecutableKnowledgeProposalOperation({
      id: 'op-2',
      type: 'delete_note',
      targetTitle: '重复文档.md',
      reason: '重复内容',
      evidence: ['note:重复文档.md'],
      draftContent: '',
      riskLevel: 'high',
      selected: true,
    }),
    false
  );
});

test('tag-only proposal operations execute as non-destructive note updates', async () => {
  const { executeKnowledgeProposal } = await import('../src/modules/ai/knowledge/executeKnowledgeProposal.ts');

  const updateCalls = [];
  await executeKnowledgeProposal(
    {
      id: 'proposal-1',
      projectId: 'project-1',
      summary: 'Tag-only updates',
      trigger: 'duplicate-notes',
      createdAt: Date.now(),
      status: 'pending',
      operations: [
        {
          id: 'op-1',
          type: 'merge_candidate',
          targetId: 'note-1',
          targetTitle: 'Duplicate note.md',
          reason: 'Looks mergeable',
          evidence: ['note:a', 'note:b'],
          draftContent: '',
          riskLevel: 'low',
          selected: true,
        },
        {
          id: 'op-2',
          type: 'mark_stale',
          targetId: 'note-2',
          targetTitle: 'Old flow.md',
          reason: 'Outdated content',
          evidence: ['note:old-flow'],
          draftContent: '',
          riskLevel: 'low',
          selected: true,
        },
      ],
    },
    {
      createNote: async () => {
        throw new Error('should not create note for tag-only operations');
      },
      updateNote: async (input) => {
        updateCalls.push(input);
      },
    }
  );

  assert.deepEqual(updateCalls, [
    {
      noteId: 'note-1',
      title: 'Duplicate note.md',
      content: undefined,
      tags: ['candidate/merge'],
    },
    {
      noteId: 'note-2',
      title: 'Old flow.md',
      content: undefined,
      tags: ['status/stale'],
    },
  ]);
});

test('wiki proposal operations append reference titles into the markdown payload', async () => {
  const { executeKnowledgeProposal } = await import('../src/modules/ai/knowledge/executeKnowledgeProposal.ts');

  const createCalls = [];
  const updateCalls = [];
  await executeKnowledgeProposal(
    {
      id: 'proposal-2',
      projectId: 'project-1',
      summary: 'Wiki references',
      trigger: 'knowledge-organize',
      createdAt: Date.now(),
      status: 'pending',
      operations: [
        {
          id: 'op-1',
          type: 'create_wiki',
          targetTitle: 'project-overview.md',
          reason: 'Create wiki',
          evidence: ['note:a'],
          draftContent: '# Project overview\n\nBody',
          referenceTitles: ['开放问题', '术语表', '开放问题'],
          riskLevel: 'low',
          selected: true,
        },
        {
          id: 'op-2',
          type: 'update_wiki',
          targetId: 'note-1',
          targetTitle: 'feature-inventory.md',
          reason: 'Update wiki',
          evidence: ['note:b'],
          draftContent: '# Feature inventory\n\nBody',
          referenceTitles: ['页面清单'],
          riskLevel: 'low',
          selected: true,
        },
      ],
    },
    {
      createNote: async (input) => {
        createCalls.push(input);
      },
      updateNote: async (input) => {
        updateCalls.push(input);
      },
    }
  );

  assert.match(createCalls[0].content, /^## 引用来源$/m);
  assert.match(createCalls[0].content, /- 开放问题/);
  assert.match(createCalls[0].content, /- 术语表/);
  assert.match(updateCalls[0].content, /^## 引用来源$/m);
  assert.match(updateCalls[0].content, /- 页面清单/);
});
