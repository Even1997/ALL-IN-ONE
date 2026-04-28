import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('types expose a document change event contract for project activity tracking', async () => {
  const source = await readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8');

  assert.match(source, /export type DocumentChangeAction = 'created' \| 'updated' \| 'deleted';/);
  assert.match(source, /export type DocumentChangeTrigger = 'editor' \| 'import' \| 'sync';/);
  assert.match(source, /export interface DocumentChangeEvent \{/);
  assert.match(source, /projectId: string;/);
  assert.match(source, /documentId: string;/);
  assert.match(source, /trigger: DocumentChangeTrigger;/);
  assert.match(source, /summary: string;/);
});

test('project store persists document events alongside requirement docs', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.match(source, /documentEvents: DocumentChangeEvent\[\];/);
  assert.match(source, /documentEvents: \[\],/);
  assert.match(source, /documentEvents: normalizeDocumentChangeEvents\(persisted\.documentEvents\)/);
  assert.match(source, /documentEvents: \[\],\s*activeKnowledgeFileId: null,/s);
});

test('project store records document change events for create update delete import and replace flows', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.match(source, /const buildDocumentChangeEvent =/);
  assert.match(source, /const collectRequirementDocEvents =/);
  assert.match(source, /addRequirementDoc:[\s\S]*buildDocumentChangeEvent\([\s\S]*'created'[\s\S]*'editor'/);
  assert.match(source, /updateRequirementDoc:[\s\S]*buildDocumentChangeEvent\([\s\S]*'updated'[\s\S]*'editor'/);
  assert.match(source, /deleteRequirementDoc:[\s\S]*buildDocumentChangeEvent\([\s\S]*'deleted'[\s\S]*'editor'/);
  assert.match(source, /ingestRequirementDoc:[\s\S]*buildDocumentChangeEvent\([\s\S]*'created'[\s\S]*'import'/);
  assert.match(source, /replaceRequirementDocs:[\s\S]*collectRequirementDocEvents\([\s\S]*'sync'/);
});
