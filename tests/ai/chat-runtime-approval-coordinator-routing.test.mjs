import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const interactionHookPath = path.resolve(
  __dirname,
  '../../src/components/workspace/useAIChatRuntimeInteractionState.ts',
);

test('chat delegates approval pending-action bookkeeping to the runtime approval coordinator', async () => {
  const source = await readFile(interactionHookPath, 'utf8');

  assert.match(source, /requestRuntimeApproval/);
  assert.match(source, /resolveRuntimeApproval/);
  assert.match(source, /type RuntimePendingApprovalAction/);
  assert.match(source, /buildCapabilityApprovalLifecycleDescriptor/);
  assert.match(source, /const approval = await requestRuntimeApproval\(/);
  assert.match(source, /const pendingAction = await resolveRuntimeApproval\(/);
  assert.match(source, /replayRecoveryController\.appendAndSync/);
  assert.match(source, /pendingApprovalActionsRef\.current\[approval\.id\] = \{/);
});

test('chat stop handler cancels pending built-in approvals and questions', async () => {
  const source = await readFile(interactionHookPath, 'utf8');
  const stopHandler = source.match(/const stopPendingRuntimeInteractions = useCallback\(\(\) => \{[\s\S]*?\n\s*\}, \[/)?.[0] || '';

  assert.match(stopHandler, /pendingQuestionActionsRef\.current/);
  assert.match(stopHandler, /\.reject\(/);
  assert.match(stopHandler, /pendingApprovalActionsRef\.current/);
  assert.match(stopHandler, /\.onDeny\?\.\(/);
  assert.match(stopHandler, /resolveStoredApproval\(approvalId,\s*'denied'\)/);
});
