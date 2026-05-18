import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const riskPolicyPath = path.resolve(__dirname, '../../src/modules/ai/runtime/approval/riskPolicy.ts');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const conversationPanePath = path.resolve(
  __dirname,
  '../../src/components/workspace/AIChatConversationMessagesPane.tsx',
);
const runtimeInteractionCardsPath = path.resolve(
  __dirname,
  '../../src/components/workspace/AIChatRuntimeInteractionCards.tsx',
);
const runtimeInteractionRenderModelPath = path.resolve(
  __dirname,
  '../../src/components/workspace/runtimeInteractionRenderModel.ts',
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
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'high', sandboxPolicy: 'allow' }), false);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'high', sandboxPolicy: 'bypass' }), true);
});

test('AIChat wires approval gating and inline approval cards into the existing shell', async () => {
  const chat = await readFile(aiChatPath, 'utf8');
  const pane = await readFile(conversationPanePath, 'utf8');
  const renderModel = await readFile(runtimeInteractionRenderModelPath, 'utf8');

  assert.match(chat, /useApprovalStore/);
  assert.match(chat, /enqueueAgentApproval/);
  assert.match(chat, /sandboxPolicy/);
  assert.match(pane, /renderRuntimeApproval/);
  assert.match(pane, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(renderModel, /getRuntimeInteractionRenderEntries/);
  assert.doesNotMatch(chat, /GNAgentApprovalPanel/);
  assert.match(chat, /run_local_agent_prompt/);
});

test('approval cards and runtime summary expose approval actions and approval-policy wording without store-list fallback UI', async () => {
  const pane = await readFile(conversationPanePath, 'utf8');
  const cards = await readFile(runtimeInteractionCardsPath, 'utf8');
  const summary = await readFile(runtimeSummaryPath, 'utf8');

  assert.doesNotMatch(pane, /AIChatRuntimeApprovalList/);
  assert.doesNotMatch(cards, /export const AIChatRuntimeApprovalList/);
  assert.match(cards, /chat-runtime-approval-actions/);
  assert.match(cards, /onApprove\(event\.approvalId\)/);
  assert.match(cards, /onDeny\(event\.approvalId\)/);
  assert.match(summary, /approval:/i);
  assert.match(summary, /approval policy/i);
  assert.doesNotMatch(summary, /ClaudeRuntime/);
  assert.doesNotMatch(summary, /CodexRuntime/);
});
