import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates runtime approval and sandbox feedback strings to orchestration helpers', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /buildProjectFileDecisionFeedback/);
  assert.match(source, /buildRuntimeLocalAgentDecisionFeedback/);
  assert.match(source, /const blockedFeedback = buildProjectFileDecisionFeedback\(/);
  assert.match(source, /const approvalRequiredFeedback = buildProjectFileDecisionFeedback\(/);
  assert.match(source, /const blockedFeedback = buildRuntimeLocalAgentDecisionFeedback\(/);
  assert.match(source, /const approvalRequiredFeedback = buildRuntimeLocalAgentDecisionFeedback\(/);
  assert.match(source, /createRuntimeEventId\('local-agent-blocked'\)/);
  assert.doesNotMatch(source, /summary: `Sandbox denied: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /summary: `Approval required: \$\{nextProposal\.summary\}`/);
  assert.doesNotMatch(source, /completeWithReplay\(`Sandbox denied: \$\{localAgentFlow\.summary\}`\)/);
  assert.doesNotMatch(source, /completeWithReplay\(`Approval required: \$\{localAgentFlow\.summary\}`\)/);
});
