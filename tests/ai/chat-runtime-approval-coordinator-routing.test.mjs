import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates approval pending-action bookkeeping to the runtime approval coordinator', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /requestRuntimeApprovalFlow/);
  assert.match(source, /resolveRuntimeApproval/);
  assert.match(source, /type RuntimePendingApprovalAction/);
  assert.match(source, /const approval = await requestRuntimeApprovalFlow\(/);
  assert.match(source, /const pendingAction = await resolveRuntimeApproval\(/);
  assert.doesNotMatch(source, /pendingApprovalActionsRef\.current\[approval\.id\] = \{ onApprove, onDeny \}/);
});
