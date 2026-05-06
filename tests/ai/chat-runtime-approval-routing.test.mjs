import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates local agent approval feedback without direct project file pre-routing', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(source, /prepareProjectFileProposalFlow/);
  assert.doesNotMatch(source, /requestRuntimeProjectFileApproval/);
  assert.match(source, /buildRuntimeLocalAgentDecisionState/);
  assert.match(source, /resolveRuntimeLocalAgentDecisionFeedback/);
  assert.match(source, /const localAgentDecisionFeedback = resolveRuntimeLocalAgentDecisionFeedback\(/);
  assert.match(source, /localAgentFlow\.decision === 'blocked'/);
  assert.match(source, /onApprovalRequired: async \(\) =>/);
  assert.match(source, /createRuntimeEventId\('local-agent-blocked'\)/);
  assert.doesNotMatch(source, /summary: `Sandbox denied: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /summary: `Approval required: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /completeWithReplay\(`Sandbox denied: \$\{localAgentFlow\.summary\}`\)/);
  assert.doesNotMatch(source, /completeWithReplay\(`Approval required: \$\{localAgentFlow\.summary\}`\)/);
});
