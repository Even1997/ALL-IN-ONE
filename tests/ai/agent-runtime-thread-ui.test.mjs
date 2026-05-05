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

test('gn agent chat page references thread list, timeline panel, and memory panel through the runtime conversation gateway', async () => {
  const [source, aiChatSource] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
  ]);

  assert.match(source, /GNAgentThreadList/);
  assert.match(source, /GNAgentTimelinePanel/);
  assert.match(source, /GNAgentMemoryPanel/);
  assert.match(source, /useRuntimeConversationGateway/);
  assert.match(aiChatSource, /useRuntimeConversationGateway/);
});

test('runtime thread and timeline panels expose resume or recovery UI without opening their own shared runtime stores', async () => {
  const [threadListSource, timelinePanelSource] = await Promise.all([
    readFile(threadListPath, 'utf8'),
    readFile(timelinePanelPath, 'utf8'),
  ]);

  assert.match(threadListSource, /requestReplayResumeFromRecovery|resume/i);
  assert.match(timelinePanelSource, /requestReplayResumeFromRecovery|recovery/i);
  assert.doesNotMatch(threadListSource, /useAIChatStore/);
  assert.doesNotMatch(threadListSource, /useAgentRuntimeStore/);
});
