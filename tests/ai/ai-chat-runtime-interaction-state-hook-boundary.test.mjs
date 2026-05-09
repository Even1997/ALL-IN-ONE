import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const hookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatRuntimeInteractionState.ts');

test('AIChat delegates runtime approval and question interactions into a dedicated hook', async () => {
  const [chatSource, hookSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(hookPath, 'utf8'),
  ]);

  assert.match(chatSource, /useAIChatRuntimeInteractionState/);
  assert.doesNotMatch(chatSource, /const waitForRuntimeApproval = useCallback/);
  assert.doesNotMatch(chatSource, /const waitForRuntimeQuestionAnswer = useCallback/);
  assert.doesNotMatch(chatSource, /const handleApproveRuntimeApproval = useCallback/);
  assert.doesNotMatch(chatSource, /const handleDenyRuntimeApproval = useCallback/);
  assert.doesNotMatch(chatSource, /const handleAnswerRuntimeQuestion = useCallback/);

  assert.match(hookSource, /export const useAIChatRuntimeInteractionState/);
  assert.match(hookSource, /const waitForRuntimeApproval = useCallback/);
  assert.match(hookSource, /const waitForRuntimeQuestionAnswer = useCallback/);
  assert.match(hookSource, /const handleApproveRuntimeApproval = useCallback/);
  assert.match(hookSource, /const handleDenyRuntimeApproval = useCallback/);
  assert.match(hookSource, /const handleAnswerRuntimeQuestion = useCallback/);
});
