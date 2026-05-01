import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runChangeSyncLane } from '../../src/modules/ai/knowledge/runChangeSyncLane.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

const buildLanePayload = () =>
  JSON.stringify({
    'change-sync-proposal': {
      summary: 'Change sync proposal',
      content: '# Change sync proposal\n\n- Update onboarding copy',
    },
    'change-sync-checklist': {
      summary: 'Change sync checklist',
      content: '# Change sync checklist\n\n- Confirm page diff',
    },
  });

test('change sync lane returns derived note docs with explicit typing', async () => {
  const docs = await runChangeSyncLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [],
    generatedFiles: [],
    executeText: async () => buildLanePayload(),
  });

  assert.equal(docs.length, 2);
  assert.equal(docs.every((doc) => doc.docType === 'ai-summary'), true);
  assert.equal(docs.some((doc) => doc.title.includes('proposal')), true);
  assert.equal(docs.some((doc) => doc.title.includes('checklist')), true);
});

test('change sync proposal builder converts derived docs into user-approved note operations', async () => {
  const { buildChangeSyncProposal } = await import('../../src/modules/ai/knowledge/buildChangeSyncProposal.ts');
  const docs = await runChangeSyncLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [],
    generatedFiles: [],
    executeText: async () => buildLanePayload(),
  });

  const proposal = buildChangeSyncProposal({
    projectId: 'project-1',
    docs,
  });

  assert.equal(proposal.trigger, 'change-sync');
  assert.equal(proposal.operations.length, 2);
  assert.equal(proposal.operations.every((operation) => operation.selected === true), true);
  assert.equal(proposal.operations.every((operation) => operation.type === 'create_note'), true);
});

test('ai chat no longer runs hidden change sync promotion flow', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(chatSource, /runChangeSyncLane/);
  assert.doesNotMatch(chatSource, /buildChangeSyncSessionArtifacts/);
  assert.doesNotMatch(chatSource, /buildChangeSyncTemporaryReply/);
  assert.doesNotMatch(chatSource, /buildTemporaryArtifactPromotionProposal/);
  assert.doesNotMatch(chatSource, /collectPendingTemporaryArtifactIds/);
  assert.doesNotMatch(chatSource, /findExistingTemporaryArtifactProposal/);
  assert.doesNotMatch(chatSource, /findTemporaryArtifactForProposal/);
  assert.doesNotMatch(chatSource, /syncTemporaryArtifactCardStatuses/);
});
