import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

const loadKnowledgeProposalHelpers = async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const helperStart = chatSource.indexOf('const RUNNABLE_KNOWLEDGE_PROPOSAL_OPERATION_TYPES');
  const helperEnd = chatSource.indexOf('const KnowledgeTruthStructuredCards');

  assert.notEqual(helperStart, -1, 'knowledge proposal helper block should exist');
  assert.notEqual(helperEnd, -1, 'structured card component should follow helper block');

  const helperSource = `${chatSource.slice(helperStart, helperEnd)}

export default {
  getRunnableKnowledgeProposalOperationIds,
  hasRunnableKnowledgeProposalOperations,
  approveAllKnowledgeProposalOperations,
  buildRecoverableKnowledgeProposalAfterFailure,
};
`;

  const transpiled = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(chatPath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('AIChat exposes knowledge proposal controls in assistant messages', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /knowledgeProposal/);
  assert.match(chatSource, /executeKnowledgeProposal/);
  assert.match(chatSource, /toggleProposalOperation/);
  assert.match(chatSource, /dismissKnowledgeProposal/);
  assert.match(chatSource, /buildKnowledgeNoteRootMirrorPath/);
  assert.match(chatSource, /serializeKnowledgeNoteMarkdown/);
  assert.match(chatSource, /resolveKnowledgeNoteMirrorPath/);
  assert.match(chatSource, /structuredCards/);
  assert.match(chatSource, /renderStructuredCards/);
  assert.match(chatSource, /handleApproveAllKnowledgeProposal/);
  assert.match(chatSource, /upsertProposal\(approvedProposal\)/);
  assert.match(chatSource, /getRunnableKnowledgeProposalOperationIds/);
  assert.match(chatSource, /hasRunnableKnowledgeProposalOperations/);
  assert.match(chatSource, /buildRecoverableKnowledgeProposalAfterFailure/);
  assert.match(chatSource, /if \(runnableOperationIds\.length === 0\)/);
  assert.match(chatSource, /catch\s*\(error\)/);
  assert.match(chatSource, /createStoredChatMessage\('system',\s*errorMessage,\s*'error'\)/);
  assert.doesNotMatch(chatSource, /suggestKnowledgeProposalFromAnswer/);
  assert.doesNotMatch(chatSource, /鎴戞暣鐞嗕簡涓€浠藉彲鎵ц鐨勭煡璇嗗簱鎻愭/);
  assert.match(chatSource, /chat-knowledge-proposal-card/);
  assert.match(chatSource, /\u5168\u90e8\u6279\u51c6|\u6267\u884c\u9009\u4e2d\u9879/);
  assert.match(chatSource, /\u5ffd\u7565/);
  assert.doesNotMatch(chatSource, /filePath:\s*''/);

  assert.match(messageListSource, /renderKnowledgeProposal/);

  assert.match(css, /\.chat-knowledge-proposal-card/);
  assert.match(css, /\.chat-knowledge-proposal-actions/);
  assert.match(css, /\.chat-knowledge-proposal-operation/);
});

test('approveAllKnowledgeProposalOperations selects every operation without mutating the original proposal', async () => {
  const { approveAllKnowledgeProposalOperations } = await loadKnowledgeProposalHelpers();
  const proposal = {
    id: 'proposal-1',
    projectId: 'project-1',
    summary: 'proposal',
    trigger: 'wiki-stale',
    createdAt: 1,
    status: 'pending',
    operations: [
      { id: 'op-1', type: 'create_note', selected: false },
      { id: 'op-2', type: 'update_note', selected: true, targetId: 'note-2' },
    ],
  };

  const approvedProposal = approveAllKnowledgeProposalOperations(proposal);

  assert.deepEqual(
    approvedProposal.operations.map((operation) => operation.selected),
    [true, true]
  );
  assert.deepEqual(
    proposal.operations.map((operation) => operation.selected),
    [false, true]
  );
});

test('partial proposal failure recovery keeps succeeded operations from being re-run on retry', async () => {
  const { getRunnableKnowledgeProposalOperationIds, buildRecoverableKnowledgeProposalAfterFailure } =
    await loadKnowledgeProposalHelpers();
  const proposal = {
    id: 'proposal-2',
    projectId: 'project-1',
    summary: 'proposal',
    trigger: 'wiki-stale',
    createdAt: 1,
    status: 'executing',
    operations: [
      { id: 'op-1', type: 'create_note', selected: true },
      { id: 'op-2', type: 'update_note', selected: true, targetId: 'note-2' },
      { id: 'op-3', type: 'mark_stale', selected: true },
      { id: 'op-4', type: 'link_notes', selected: true },
      { id: 'op-5', type: 'archive_candidate', selected: false, targetId: 'note-5' },
    ],
  };

  assert.deepEqual(getRunnableKnowledgeProposalOperationIds(proposal), ['op-1', 'op-2']);

  const recoverableProposal = buildRecoverableKnowledgeProposalAfterFailure(proposal, ['op-1']);

  assert.equal(recoverableProposal.status, 'pending');
  assert.deepEqual(
    recoverableProposal.operations.map((operation) => ({ id: operation.id, selected: operation.selected })),
    [
      { id: 'op-1', selected: false },
      { id: 'op-2', selected: true },
      { id: 'op-3', selected: true },
      { id: 'op-4', selected: true },
      { id: 'op-5', selected: false },
    ]
  );
});

test('no-op proposals report no runnable operations even after approve-all', async () => {
  const {
    getRunnableKnowledgeProposalOperationIds,
    hasRunnableKnowledgeProposalOperations,
    approveAllKnowledgeProposalOperations,
  } = await loadKnowledgeProposalHelpers();
  const proposal = {
    id: 'proposal-3',
    projectId: 'project-1',
    summary: 'proposal',
    trigger: 'wiki-stale',
    createdAt: 1,
    status: 'pending',
    operations: [
      { id: 'op-1', type: 'link_notes', selected: true },
      { id: 'op-2', type: 'archive_candidate', selected: false },
    ],
  };

  assert.deepEqual(getRunnableKnowledgeProposalOperationIds(proposal), []);
  assert.equal(hasRunnableKnowledgeProposalOperations(proposal), false);

  const approvedProposal = approveAllKnowledgeProposalOperations(proposal);

  assert.deepEqual(getRunnableKnowledgeProposalOperationIds(approvedProposal), []);
  assert.equal(hasRunnableKnowledgeProposalOperations(approvedProposal), false);
});
