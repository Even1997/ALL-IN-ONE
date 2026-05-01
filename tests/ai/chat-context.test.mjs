import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildChatContextSnapshot,
  resolveCurrentReferenceFileIds,
  resolveKnowledgeContextSelection,
} from '../../src/modules/ai/chat/chatContext.ts';

const visibleFiles = [
  {
    id: 'doc-1',
    title: 'requirements-overview.md',
    summary: 'core requirements',
    content: '# Requirements',
    type: 'markdown',
    source: 'requirement',
    updatedAt: new Date().toISOString(),
    status: 'ready',
    kind: 'spec',
    tags: ['requirements'],
    relatedIds: [],
  },
  {
    id: 'doc-2',
    title: 'homepage-sketch.md',
    summary: 'homepage structure',
    content: '# Sketch',
    type: 'markdown',
    source: 'requirement',
    updatedAt: new Date().toISOString(),
    status: 'ready',
    kind: 'sketch',
    tags: ['sketch'],
    relatedIds: [],
  },
];

test('resolveKnowledgeContextSelection focuses the current file in vault scene', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'vault',
    knowledgeMode: 'off',
    knowledgeEntries: visibleFiles,
    activeKnowledgeFileId: 'doc-1',
  });

  assert.equal(result.currentFile?.id, 'doc-1');
  assert.equal(result.relatedFiles.length, 1);
  assert.equal(result.relatedFiles[0].id, 'doc-2');
  assert.equal(result.label, 'Current file / requirements-overview.md');
});

test('resolveKnowledgeContextSelection falls back to vault-wide context when no file is focused', () => {
  const result = resolveKnowledgeContextSelection({
    scene: 'vault',
    knowledgeMode: 'all',
    knowledgeEntries: visibleFiles,
    activeKnowledgeFileId: null,
  });

  assert.equal(result.currentFile, null);
  assert.equal(result.relatedFiles.length, 2);
  assert.equal(result.label, 'Vault / Visible files');
});

test('buildChatContextSnapshot keeps page context primary and vault context explicit', () => {
  const result = buildChatContextSnapshot({
    scene: 'page',
    pageTitle: 'Home',
    selectedElementLabel: 'Hero section',
    currentFileLabel: 'Current file / requirements-overview.md',
    vaultLabel: 'Vault / C:/vaults/demo',
  });

  assert.equal(result.primaryLabel, 'Page / Home');
  assert.equal(result.secondaryLabel, 'Canvas / Hero section');
  assert.equal(result.currentFileLabel, 'Current file / requirements-overview.md');
  assert.equal(result.vaultLabel, 'Vault / C:/vaults/demo');
});

test('buildChatContextSnapshot uses current file wording in vault scene without duplication', () => {
  const result = buildChatContextSnapshot({
    scene: 'vault',
    currentFileLabel: 'Current file / requirements-overview.md',
    vaultLabel: 'Vault / C:/vaults/demo',
  });

  assert.equal(result.primaryLabel, 'Current file / requirements-overview.md');
  assert.equal(result.secondaryLabel, 'Vault / C:/vaults/demo');
  assert.equal(result.currentFileLabel, null);
  assert.equal(result.vaultLabel, null);
});

test('resolveCurrentReferenceFileIds keeps vault current scope on the focused file only', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'vault',
    activeKnowledgeFileId: 'doc-2',
    selectedPagePath: null,
    availableFileIds: ['doc-1', 'doc-2', 'doc-3'],
  });

  assert.deepEqual(result, ['doc-2']);
});

test('resolveCurrentReferenceFileIds stays empty when vault focus is cleared', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'vault',
    activeKnowledgeFileId: null,
    selectedPagePath: null,
    availableFileIds: ['doc-1', 'doc-2'],
  });

  assert.deepEqual(result, []);
});

test('resolveCurrentReferenceFileIds keeps page current scope on the focused page only', () => {
  const result = resolveCurrentReferenceFileIds({
    scene: 'page',
    activeKnowledgeFileId: 'doc-2',
    selectedPagePath: 'sketch/pages/home.md',
    availableFileIds: ['doc-1', 'doc-2', 'sketch/pages/home.md'],
  });

  assert.deepEqual(result, ['sketch/pages/home.md']);
});

test('AIChat no longer references hidden knowledge runtime helpers', async () => {
  const source = await readFile(new URL('../../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /executeKnowledgeProposal/);
  assert.doesNotMatch(source, /buildKnowledgeOrganizeWorkflowState/);
  assert.doesNotMatch(source, /runChangeSyncLane/);
  assert.doesNotMatch(source, /buildChangeSyncSessionArtifacts/);
  assert.doesNotMatch(source, /buildMFlowPromptContext/);
  assert.doesNotMatch(source, /loadMFlowPromptState/);
  assert.doesNotMatch(source, /rebuildProjectMFlow/);
  assert.doesNotMatch(source, /projectKnowledgeNotesToRequirementDocs/);
  assert.doesNotMatch(source, /getProjectKnowledgeRootDir/);
});
