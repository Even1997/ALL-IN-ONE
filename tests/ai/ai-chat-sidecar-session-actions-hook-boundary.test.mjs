import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSidecarSessionActions.ts');

test('AIChat delegates sidecar session creation and turn submission into a dedicated hook', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /useAIChatSidecarSessionActions/);
  assert.doesNotMatch(chatSource, /const handleCreateSession = useCallback/);
  assert.doesNotMatch(chatSource, /const submitPrompt = useCallback/);

  assert.match(hookSource, /export const useAIChatSidecarSessionActions/);
  assert.match(hookSource, /const handleCreateSession = useCallback/);
  assert.match(hookSource, /const submitPrompt = useCallback/);
  assert.match(hookSource, /createRuntimeSidecarSession/);
  assert.match(hookSource, /submitRuntimeSidecarTurn/);
});

test('sidecar turn submission only reuses sessions that are already bound to a runtime thread', async () => {
  const hookSource = await readFile(hookPath, 'utf8');

  assert.match(hookSource, /sessionId:\s*activeSession\?\.runtimeThreadId\s*\|\|\s*null/);
  assert.doesNotMatch(hookSource, /sessionId:\s*activeSession\?\.runtimeThreadId\s*\|\|\s*activeSessionId/);
});

test('sidecar turn submission forwards conversation history and selected references', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.doesNotMatch(
    chatSource,
    /conversationHistory:\s*toConversationHistoryMessages\(activeSession\?\.messages \|\| \[\]\)/,
  );
  assert.match(chatSource, /getConversationHistory:\s*getConversationHistory/);
  assert.match(chatSource, /referenceFiles:\s*resolvedReferenceContextFiles/);
  assert.match(chatSource, /contextLabels:\s*runtimeContextLabels/);
  assert.match(hookSource, /getConversationHistory:\s*\(\)\s*=>\s*RuntimeConversationHistoryMessage\[\]/);
  assert.match(hookSource, /conversationHistory:\s*getConversationHistory\(\)/);
  assert.match(hookSource, /referenceFiles,\s*/);
  assert.match(hookSource, /contextLabels,\s*/);
  assert.match(hookSource, /getConversationHistory,\s*$/m);
  assert.match(hookSource, /referenceFiles,\s*$/m);
  assert.match(hookSource, /contextLabels,\s*$/m);
});

test('sidecar turn submission surfaces startup and submission failures in the chat', async () => {
  const hookSource = await readFile(hookPath, 'utf8');

  assert.match(hookSource, /const submitted = await submitRuntimeSidecarTurn/);
  assert.match(hookSource, /appendMessage\(/);
  assert.match(hookSource, /createStoredChatMessage\('system',[\s\S]*'error'\)/);
});

test('sidecar turn submission creates a local fallback session when startup fails before runtime session creation', async () => {
  const hookSource = await readFile(hookPath, 'utf8');

  assert.match(hookSource, /const ensureLocalSubmissionSession = \(promptValue: string\) =>/);
  assert.match(hookSource, /const session = createWelcomeSession\(currentProjectId, runtimeProviderId\)/);
  assert.match(hookSource, /upsertSession\(currentProjectId, sessionWithPrompt\)/);
  assert.match(hookSource, /setActiveSession\(currentProjectId, sessionWithPrompt\.id\)/);
  assert.match(hookSource, /createStoredChatMessage\('user', promptValue\)/);
});
