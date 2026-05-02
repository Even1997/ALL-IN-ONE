import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const threadListPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentThreadList.tsx');
const timelinePanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx');

test('gn agent chat page references thread list, timeline panel, and memory panel', async () => {
  const source = await readFile(chatPagePath, 'utf8');

  assert.match(source, /GNAgentThreadList/);
  assert.match(source, /GNAgentTimelinePanel/);
  assert.match(source, /GNAgentMemoryPanel/);
});

test('runtime thread and timeline panels expose resume or recovery UI', async () => {
  const [threadListSource, timelinePanelSource] = await Promise.all([
    readFile(threadListPath, 'utf8'),
    readFile(timelinePanelPath, 'utf8'),
  ]);

  assert.match(threadListSource, /恢复草稿|恢复最近一次输入|重试失败的运行|requestReplayResumeFromRecovery/i);
  assert.match(timelinePanelSource, /恢复最近一次输入|重试失败的运行|recovery|requestReplayResumeFromRecovery/i);
});
