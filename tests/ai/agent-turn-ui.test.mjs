import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const planPanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentPlanPanel.tsx');
const summaryCardsPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentTurnSummaryCards.tsx',
);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('GN agent shell wires turn summary cards and a plan panel into the main layout', async () => {
  const [chatPageSource, aiChatSource] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
  ]);

  assert.match(chatPageSource, /GNAgentPlanPanel/);
  assert.match(chatPageSource, /GNAgentTurnSummaryCards/);
  assert.match(chatPageSource, /latestTurnSession/);
  assert.match(chatPageSource, /AI_CHAT_COMMAND_EVENT/);
  assert.match(chatPageSource, /autoSubmit: true/);
  assert.match(chatPageSource, /Additional guidance:/);
  assert.match(chatPageSource, /Pause after the current step and wait for more instructions before continuing\./);
  assert.match(aiChatSource, /sessionsByThread|upsertTurnSession|patchTurnSession/);
});

test('GN agent plan panel renders structured plan state for the latest turn session', async () => {
  const source = await readFile(planPanelPath, 'utf8');

  assert.match(source, /session\?\.plan/);
  assert.match(source, /session\.plan\.steps\.map/);
  assert.match(source, /No structured plan/);
});

test('GN agent turn summary cards surface execution and resume cards', async () => {
  const source = await readFile(summaryCardsPath, 'utf8');

  assert.match(source, /executionSteps\.slice\(-3\)/);
  assert.match(source, /resumeSnapshot/);
  assert.match(source, /onResumeTurn/);
  assert.match(source, /onRetryTurn/);
  assert.match(source, /onFeedTurn/);
  assert.match(source, /onPauseTurn/);
  assert.match(source, /Retry turn/);
  assert.match(source, /Pause turn/);
  assert.match(source, /Send guidance/);
  assert.match(source, /Add guidance for the current turn/);
  assert.match(source, /chat-structured-card/);
});
