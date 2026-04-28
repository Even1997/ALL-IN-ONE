import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge adapter projects KnowledgeNote into RequirementDoc without making it the source of truth', async () => {
  const source = await readFile(new URL('../src/features/knowledge/adapters/knowledgeRequirementAdapter.ts', import.meta.url), 'utf8');

  assert.match(source, /export const projectKnowledgeNoteToRequirementDoc =/);
  assert.match(source, /export const projectKnowledgeNotesToRequirementDocs =/);
  assert.match(source, /bodyMarkdown/);
  assert.match(source, /summary:/);
  assert.match(source, /sourceUrl/);
  assert.doesNotMatch(source, /updateRequirementDoc/);
});
