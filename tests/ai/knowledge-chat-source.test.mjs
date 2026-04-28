import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('ai chat prefers sidecar-backed knowledge notes when building knowledge context', async () => {
  const source = await readFile(new URL('../../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');

  assert.match(source, /const serverNotes = useKnowledgeStore\(\(state\) => state\.notes\)/);
  assert.match(source, /const knowledgeSourceDocs = useMemo/);
  assert.match(source, /serverNotes\.length > 0 \? projectKnowledgeNotesToRequirementDocs\(serverNotes\) : requirementDocs/);
  assert.match(source, /buildKnowledgeEntries\(knowledgeSourceDocs,\s*generatedFiles\)/);
});
