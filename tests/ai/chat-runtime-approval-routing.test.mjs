import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);

test('chat delegates local agent approval feedback without direct project file pre-routing', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.doesNotMatch(source, /prepareProjectFileProposalFlow/);
  assert.doesNotMatch(source, /requestRuntimeProjectFileApproval/);
  assert.match(coordinator, /buildRuntimeLocalAgentDecisionState/);
  assert.match(coordinator, /resolveRuntimeLocalAgentDecisionFeedback/);
  assert.match(coordinator, /const localAgentDecisionFeedback = resolveRuntimeLocalAgentDecisionFeedback\(/);
  assert.match(coordinator, /localAgentFlow\.decision === 'blocked'/);
  assert.match(coordinator, /onApprovalRequired: async \(\) =>/);
  assert.match(coordinator, /createRuntimeEventId\('local-agent-blocked'\)/);
  assert.doesNotMatch(source, /summary: `Sandbox denied: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /summary: `Approval required: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /completeWithReplay\(`Sandbox denied: \$\{localAgentFlow\.summary\}`\)/);
  assert.doesNotMatch(source, /completeWithReplay\(`Approval required: \$\{localAgentFlow\.summary\}`\)/);
});
