import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runKnowledgeOrganizeLane } from '../../src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const knowledgeOrganizeLanePath = path.resolve(__dirname, '../../src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts');

const buildLanePayload = () =>
  JSON.stringify({
    'project-overview': { summary: 'Project overview', content: '# Project overview' },
    'feature-inventory': { summary: 'Feature inventory', content: '# Feature inventory' },
    'page-inventory': { summary: 'Page inventory', content: '# Page inventory' },
    terminology: { summary: 'Terminology', content: '# Terminology' },
    'open-questions': { summary: 'Open questions', content: '# Open questions' },
  });

test('knowledge organize lane returns derived wiki docs with explicit typing', async () => {
  const docs = await runKnowledgeOrganizeLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [
      {
        id: 'req-1',
        title: 'Product goals.md',
        content: 'Build a desktop AI workspace for product managers.',
        summary: 'Product goals',
        authorRole: 'product',
        sourceType: 'manual',
        updatedAt: '2026-04-27T00:00:00.000Z',
        status: 'ready',
      },
    ],
    generatedFiles: [],
    executeText: async () => buildLanePayload(),
  });

  assert.equal(docs.length, 5);
  assert.equal(docs.some((doc) => doc.docType === 'wiki-index' && doc.title.includes('overview')), true);
  assert.equal(docs.some((doc) => doc.docType === 'wiki-index' && doc.title.includes('inventory')), true);
  assert.equal(docs.some((doc) => doc.docType === 'ai-summary' && doc.title.toLowerCase().includes('terminology')), true);
});

test('knowledge organize lane reshapes wiki drafts into index-style markdown when the model returns plain prose', async () => {
  const docs = await runKnowledgeOrganizeLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [],
    generatedFiles: [],
    executeText: async () =>
      JSON.stringify({
        'project-overview': { summary: 'Project overview', content: 'A concise overview of the project.' },
        'feature-inventory': { summary: 'Feature inventory', content: '# Example heading\n\nExample content.' },
        'page-inventory': { summary: 'Page inventory', content: 'Page inventory prose.' },
        terminology: { summary: 'Terminology', content: '# Terminology' },
        'open-questions': { summary: 'Open questions', content: '# Open questions' },
      }),
  });

  const featureInventory = docs.find((doc) => doc.title === 'feature-inventory.md');
  assert.ok(featureInventory);
  assert.equal(featureInventory.docType, 'wiki-index');
  assert.match(featureInventory.content, /^# /m);
  assert.match(featureInventory.content, /^## /m);
});

test('knowledge organize proposal builder converts derived docs into user-approved wiki operations', async () => {
  const { buildKnowledgeOrganizeProposal } = await import('../../src/modules/ai/knowledge/buildKnowledgeOrganizeProposal.ts');
  const docs = await runKnowledgeOrganizeLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [],
    generatedFiles: [],
    executeText: async () => buildLanePayload(),
  });

  const proposal = buildKnowledgeOrganizeProposal({
    projectId: 'project-1',
    sourceTitles: ['overview.md', 'inventory.md'],
    docs,
  });

  assert.equal(proposal.trigger, 'knowledge-organize');
  assert.equal(proposal.operations.length, 5);
  assert.equal(proposal.operations.every((operation) => operation.selected === true), true);
  assert.equal(
    proposal.operations.every((operation) => operation.type === 'create_wiki' || operation.type === 'update_wiki'),
    true
  );
  assert.deepEqual(proposal.operations[0].referenceTitles, ['overview.md', 'inventory.md']);
});

test('ai chat no longer owns hidden knowledge organize runtime orchestration', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(chatSource, /buildKnowledgeOrganizeWorkflowState/);
  assert.doesNotMatch(chatSource, /loadMFlowPromptState/);
  assert.doesNotMatch(chatSource, /rebuildProjectMFlow/);
  assert.doesNotMatch(chatSource, /formatMFlowRefreshSummary/);
  assert.doesNotMatch(chatSource, /writeArtifacts:\s*true/);
});

test('knowledge organize lane prompt requires Obsidian-style internal links and external footnotes', async () => {
  const source = await readFile(knowledgeOrganizeLanePath, 'utf8');

  assert.match(source, /\[\[Note Title\]\]/);
  assert.match(source, /\[\^1\]/);
  assert.match(source, /\[Title\]\(https:\/\/example\.com\)/);
  assert.match(source, /Do not add a "## /);
});
