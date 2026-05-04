import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cardPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolExecutionCard.tsx');
const blocksPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolBlocks.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

const loadRenderModel = async () =>
  import(`../../src/components/workspace/runtimeEventRenderModel.ts?test=${Date.now()}`);

test('runtime event render model groups repeated read operations into a compact label', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 1,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'grep',
      input: { pattern: 'chat-tool-trace' },
      status: 'completed',
      createdAt: 2,
    },
    {
      id: 'tool-use-3',
      kind: 'tool_use',
      toolCallId: 'call-3',
      parentToolCallId: null,
      toolName: 'ls',
      input: { path: 'src/components/workspace' },
      status: 'completed',
      createdAt: 3,
    },
  ]);

  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[0]?.groupLabel, '\u8bfb\u53d6 3 \u4e2a\u6b65\u9aa4');
});

test('runtime event render model preserves sequential tool steps instead of collapsing separate actions', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 1,
    },
    {
      id: 'tool-result-1',
      kind: 'tool_result',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      status: 'completed',
      output: 'done',
      createdAt: 2,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'next' },
      status: 'running',
      createdAt: 3,
    },
  ]);

  assert.equal(model.items.length, 2);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.equal(model.items[0]?.toolUses.length, 1);
  assert.equal(model.items[1]?.toolUses.length, 1);
});

test('runtime tool blocks use compact step flow markup with explicit expandable detail regions', async () => {
  const [cardSource, blocksSource, cssSource] = await Promise.all([
    readFile(cardPath, 'utf8'),
    readFile(blocksPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(cardSource, /className="chat-tool-trace-stream compact"/);
  assert.match(cardSource, /data-runtime-trace="compact"/);
  assert.match(blocksSource, /chat-tool-step-shell/);
  assert.match(blocksSource, /chat-tool-step-detail/);
  assert.match(blocksSource, /data-has-details/);
  assert.match(cssSource, /\.chat-tool-step-shell/);
  assert.match(cssSource, /\.chat-tool-step-detail/);
});
