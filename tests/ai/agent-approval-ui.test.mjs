import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const riskPolicyPath = path.resolve(__dirname, '../../src/modules/ai/runtime/approval/riskPolicy.ts');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const approvalPanelPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentApprovalPanel.tsx',
);
const runtimeSummaryPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx',
);

const loadRiskPolicy = async () =>
  import(`../../src/modules/ai/runtime/approval/riskPolicy.ts?test=${Date.now()}`);

test('risk policy classifies destructive runtime actions', async () => {
  const {
    classifyRuntimeActionRisk,
    classifyProjectFileOperationsRisk,
    shouldAutoApproveRuntimeAction,
  } = await loadRiskPolicy();

  assert.equal(classifyRuntimeActionRisk('tool_remove'), 'high');
  assert.equal(classifyRuntimeActionRisk('tool_bash'), 'high');
  assert.equal(classifyRuntimeActionRisk('run_local_agent_prompt'), 'high');
  assert.equal(
    classifyProjectFileOperationsRisk([{ type: 'delete_file', targetPath: 'docs/spec.md' }]),
    'high',
  );
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'medium', sandboxPolicy: 'ask' }), false);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'medium', sandboxPolicy: 'allow' }), true);
});

test('AIChat wires approval gating and approval panel into the existing shell', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useApprovalStore/);
  assert.match(source, /enqueueAgentApproval/);
  assert.match(source, /sandboxPolicy/);
  assert.match(source, /GNAgentApprovalPanel/);
  assert.match(source, /run_local_agent_prompt/);
});

test('approval panel and runtime summary expose pending approval state', async () => {
  const panel = await readFile(approvalPanelPath, 'utf8');
  const summary = await readFile(runtimeSummaryPath, 'utf8');

  assert.match(panel, /Pending approvals/i);
  assert.match(panel, /Approve/i);
  assert.match(panel, /Deny/i);
  assert.match(summary, /approval/i);
  assert.match(summary, /sandbox/i);
});
