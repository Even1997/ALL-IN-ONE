import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ai chat builds direct chat context from visible vault state only', async () => {
  const source = await readFile(new URL('../../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');
  const directFlowSource = await readFile(
    new URL('../../src/modules/ai/runtime/orchestration/runtimeDirectChatFlow.ts', import.meta.url),
    'utf8',
  );

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
  assert.match(source, /buildReferencePromptContext/);
  assert.match(source, /referenceContext: previewReferenceContext/);
  assert.match(source, /buildDirectChatPrompt\(\{/);
  assert.match(source, /contextLabels: \[/);
  assert.match(directFlowSource, /const visibleReferenceFiles = input\.referenceFiles\.filter/);
  assert.match(directFlowSource, /!isInternalAssistantReferencePath\(file\.path\)/);
  assert.match(directFlowSource, /assembleAgentContext/);
  assert.match(directFlowSource, /buildThreadPrompt/);
  assert.match(directFlowSource, /buildDirectChatPrompt\(\{/);
});
