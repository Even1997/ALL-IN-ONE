import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const threadListPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentThreadList.tsx');
const timelinePanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx');
const sessionHookPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts',
);

test('gn agent compatibility page wraps AgentChatStage with the shared workbench session gateway', async () => {
  const [source, aiChatSource, sessionHook] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
    readFile(sessionHookPath, 'utf8'),
  ]);

  assert.match(source, /AgentChatStage/);
  assert.match(source, /useGNAgentWorkbenchSession/);
  assert.match(source, /session=\{session\}/);
  assert.match(sessionHook, /useRuntimeConversationGateway/);
  assert.match(sessionHook, /threads:\s*conversation\.threads/);
  assert.match(sessionHook, /recoveryByThread:\s*conversation\.recoveryByThread/);
  assert.match(aiChatSource, /useRuntimeConversationGateway/);
});

test('thread list stays presentation-focused while timeline panel owns recovery and runtime store wiring', async () => {
  const [threadListSource, timelinePanelSource] = await Promise.all([
    readFile(threadListPath, 'utf8'),
    readFile(timelinePanelPath, 'utf8'),
  ]);

  assert.match(threadListSource, /搜索对话历史/);
  assert.match(threadListSource, /onSelectThread/);
  assert.doesNotMatch(threadListSource, /requestReplayResumeFromRecovery/);
  assert.match(timelinePanelSource, /requestReplayResumeFromRecovery|recovery/i);
  assert.match(timelinePanelSource, /useAIChatStore/);
  assert.match(timelinePanelSource, /useAgentRuntimeStore/);
  assert.doesNotMatch(threadListSource, /useAIChatStore/);
  assert.doesNotMatch(threadListSource, /useAgentRuntimeStore/);
});
