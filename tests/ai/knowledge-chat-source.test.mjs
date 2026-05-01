import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ai chat builds direct chat context from visible vault state only', async () => {
  const source = await readFile(new URL('../../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');

  assert.match(source, /const serverNotes = useKnowledgeStore\(\(state\) => state\.notes\)/);
  assert.match(source, /const projectRoot = currentProject\?\.vaultPath \|\| ''/);
  assert.match(source, /scene: aiContextState\?\.scene \|\| 'vault'/);
  assert.match(source, /const currentFileLabel = /);
  assert.match(source, /const vaultLabel = /);
  assert.match(source, /const explicitReferenceLabels = useMemo/);
  assert.match(source, /const resolvedReferenceContextFiles = useMemo/);
  assert.match(source, /const previewReferenceContext = useMemo/);
  assert.match(source, /selectedReferenceFileIds/);
  assert.match(source, /Reference \/ /);
  assert.match(source, /Reference dir \/ /);
  assert.match(source, /buildReferencePromptContext/);
  assert.match(source, /referenceContext: previewReferenceContext/);
  assert.match(source, /referenceContext: buildPromptReferenceContext\(cleanedContent\)/);
  assert.doesNotMatch(source, /const knowledgeSourceDocs = useMemo/);
  assert.doesNotMatch(source, /buildKnowledgeEntries/);
  assert.doesNotMatch(source, /projectKnowledgeNotesToRequirementDocs/);
});
