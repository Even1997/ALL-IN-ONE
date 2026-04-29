import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeOrganizeProposal } from '../src/modules/ai/knowledge/buildKnowledgeOrganizeProposal.ts';
import {
  buildKnowledgeOrganizeWorkflowState,
  hashKnowledgeContent,
  planKnowledgeOrganizeRun,
} from '../src/modules/ai/knowledge/knowledgeOrganizeState.ts';

const buildDoc = (overrides = {}) => ({
  id: overrides.id || 'doc-1',
  title: overrides.title || 'source.md',
  content: overrides.content || '# Source\n\nBody',
  summary: overrides.summary || 'Source summary',
  authorRole: overrides.authorRole || 'product',
  sourceType: overrides.sourceType || 'manual',
  updatedAt: overrides.updatedAt || '2026-04-29T00:00:00.000Z',
  status: overrides.status || 'ready',
  docType: overrides.docType,
  tags: overrides.tags || [],
  relatedIds: overrides.relatedIds || [],
});

test('knowledge organize run returns no-change when sources and managed wiki are unchanged', () => {
  const sourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const wikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-28T01:00:00.000Z',
    docType: 'wiki-index',
  });
  const workflowState = buildKnowledgeOrganizeWorkflowState({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-28T12:00:00.000Z',
  });

  const plan = planKnowledgeOrganizeRun({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [],
    workflowState,
  });

  assert.equal(plan.mode, 'no-change');
  assert.equal(plan.message, '暂未发现变动');
});

test('knowledge organize run preserves manual wiki edits when sources are unchanged', () => {
  const sourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const baselineWikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-28T01:00:00.000Z',
    docType: 'wiki-index',
  });
  const editedWikiDoc = {
    ...baselineWikiDoc,
    content: '# Project overview\n\nUser edited body',
    updatedAt: '2026-04-29T01:00:00.000Z',
  };
  const workflowState = buildKnowledgeOrganizeWorkflowState({
    docs: [sourceDoc, baselineWikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-28T12:00:00.000Z',
  });

  const plan = planKnowledgeOrganizeRun({
    docs: [sourceDoc, editedWikiDoc],
    generatedFiles: [],
    workflowState,
  });

  assert.equal(plan.mode, 'manual-review-only');
  assert.deepEqual(plan.manualEditedWikiTitles, ['project-overview.md']);
  assert.match(plan.message, /手动修改/);
});

test('knowledge organize run proceeds when source content changed after the last organize time', () => {
  const baselineSourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    content: '# PRD\n\nOriginal content',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const sourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    content: '# PRD\n\nUpdated content',
    updatedAt: '2026-04-29T08:00:00.000Z',
  });
  const wikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-28T01:00:00.000Z',
    docType: 'wiki-index',
  });
  const workflowState = buildKnowledgeOrganizeWorkflowState({
    docs: [baselineSourceDoc, wikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-28T12:00:00.000Z',
  });

  const plan = planKnowledgeOrganizeRun({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [],
    workflowState,
  });

  assert.equal(plan.mode, 'proceed');
  assert.equal(plan.sourceDocs.length, 1);
  assert.equal(plan.existingWikiDocs.length, 1);
});

test('knowledge organize run skips when only timestamps changed but source fingerprint is unchanged', () => {
  const sourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    content: '# PRD\n\nStable content',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const wikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-28T01:00:00.000Z',
    docType: 'wiki-index',
  });
  const workflowState = buildKnowledgeOrganizeWorkflowState({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-28T12:00:00.000Z',
  });

  const plan = planKnowledgeOrganizeRun({
    docs: [
      {
        ...sourceDoc,
        updatedAt: '2026-04-29T08:00:00.000Z',
      },
      wikiDoc,
    ],
    generatedFiles: [],
    workflowState,
  });

  assert.equal(plan.mode, 'no-change');
});

test('knowledge organize run proceeds when source fingerprint changes even if timestamps do not move forward', () => {
  const sourceDoc = buildDoc({
    id: 'source-1',
    title: 'prd.md',
    content: '# PRD\n\nStable content',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const wikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-28T01:00:00.000Z',
    docType: 'wiki-index',
  });
  const workflowState = buildKnowledgeOrganizeWorkflowState({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-28T12:00:00.000Z',
  });

  const plan = planKnowledgeOrganizeRun({
    docs: [sourceDoc, wikiDoc],
    generatedFiles: [
      {
        path: 'docs/new-context.md',
        content: '# New context',
        language: 'md',
        category: 'design',
        summary: 'New context file',
        sourceTaskIds: [],
        updatedAt: '2026-04-28T11:00:00.000Z',
      },
    ],
    workflowState,
  });

  assert.equal(plan.mode, 'proceed');
});

test('knowledge organize proposal updates existing wiki instead of creating a duplicate', () => {
  const proposal = buildKnowledgeOrganizeProposal({
    projectId: 'project-1',
    sourceTitles: ['prd.md'],
    docs: [
      buildDoc({
        id: 'draft-1',
        title: 'project-overview.md',
        content: '# Project overview\n\nUpdated',
        summary: 'Updated summary',
        docType: 'wiki-index',
      }),
    ],
    existingWikiTargetsByTitle: {
      'project-overview.md': {
        id: 'wiki-1',
        title: 'project-overview.md',
      },
    },
  });

  assert.equal(proposal.operations[0].type, 'update_wiki');
  assert.equal(proposal.operations[0].targetId, 'wiki-1');
});

test('knowledge organize proposal marks manually edited wiki updates as merge suggestions', () => {
  const proposal = buildKnowledgeOrganizeProposal({
    projectId: 'project-1',
    sourceTitles: ['prd.md'],
    docs: [
      buildDoc({
        id: 'draft-1',
        title: 'project-overview.md',
        content: '# Project overview\n\nUpdated',
        summary: 'Updated summary',
        docType: 'wiki-index',
      }),
    ],
    existingWikiTargetsByTitle: {
      'project-overview.md': {
        id: 'wiki-1',
        title: 'project-overview.md',
        manualEdited: true,
      },
    },
  });

  assert.equal(proposal.operations[0].type, 'update_wiki');
  assert.match(proposal.operations[0].reason, /手动修改/);
});

test('knowledge organize workflow state stores content hashes for managed wiki docs', () => {
  const wikiDoc = buildDoc({
    id: 'wiki-1',
    title: 'project-overview.md',
    content: '# Project overview\n\nBody',
    updatedAt: '2026-04-29T08:00:00.000Z',
    docType: 'wiki-index',
  });

  const state = buildKnowledgeOrganizeWorkflowState({
    docs: [wikiDoc],
    generatedFiles: [],
    lastKnowledgeOrganizeAt: '2026-04-29T09:00:00.000Z',
  });

  assert.equal(state.lastKnowledgeOrganizeAt, '2026-04-29T09:00:00.000Z');
  assert.equal(state.wikiSnapshots['project-overview.md'].noteId, 'wiki-1');
  assert.equal(state.wikiSnapshots['project-overview.md'].contentHash, hashKnowledgeContent(wikiDoc.content));
});
