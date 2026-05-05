import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cardPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolExecutionCard.tsx');
const blocksPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolBlocks.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

const loadRenderModel = async () =>
  import(`../../src/components/workspace/runtimeEventRenderModel.ts?test=${Date.now()}`);

test('runtime event render model groups repeated file edits into a compact label', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'first' },
      status: 'completed',
      createdAt: 1,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'write',
      input: { file_path: 'src/components/workspace/AIChat.css' },
      status: 'completed',
      createdAt: 2,
    },
    {
      id: 'tool-result-2',
      kind: 'tool_result',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'write',
      status: 'completed',
      output: 'ok',
      fileChanges: [
        {
          path: 'src/components/workspace/AIChat.css',
          beforeContent: null,
          afterContent: 'body {}',
        },
      ],
      createdAt: 3,
    },
    {
      id: 'tool-use-3',
      kind: 'tool_use',
      toolCallId: 'call-3',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/components/workspace/AIChat.tsx', new_string: 'third' },
      status: 'completed',
      createdAt: 4,
    },
  ]);

  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(
    model.items[0]?.groupLabel,
    '\u5df2\u521b\u5efa 1 \u4e2a\u6587\u4ef6,\u5df2\u7f16\u8f91 2 \u4e2a\u6587\u4ef6'
  );
});

test('runtime event render model keeps adjacent top-level tool steps in one chronological group', async () => {
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

  assert.equal(model.items.length, 1);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[0]?.toolUses.length, 2);
  assert.equal(
    model.items[0]?.groupLabel,
    '\u5df2\u7f16\u8f91 1 \u4e2a\u6587\u4ef6,\u5df2\u8bfb\u53d6 1 \u9879\u5185\u5bb9'
  );
});

test('runtime event render model keeps mixed action summaries in one combined group', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'write',
      input: { file_path: 'src/App.tsx', content: 'first' },
      status: 'completed',
      createdAt: 1,
    },
    {
      id: 'tool-result-1',
      kind: 'tool_result',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'write',
      status: 'completed',
      output: 'ok',
      fileChanges: [
        {
          path: 'src/App.tsx',
          beforeContent: null,
          afterContent: 'first',
        },
      ],
      createdAt: 2,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'bash',
      input: { command: 'npm run build' },
      status: 'completed',
      createdAt: 3,
    },
    {
      id: 'tool-use-3',
      kind: 'tool_use',
      toolCallId: 'call-3',
      parentToolCallId: null,
      toolName: 'bash',
      input: { command: 'node --test tests/ai/ai-chat-runtime-output-flow.test.mjs' },
      status: 'completed',
      createdAt: 4,
    },
  ]);

  assert.equal(model.items.length, 1);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(
    model.items[0]?.groupLabel,
    '\u5df2\u521b\u5efa 1 \u4e2a\u6587\u4ef6,\u5df2\u8fd0\u884c 2 \u6761\u547d\u4ee4'
  );
});

test('runtime event render model sorts nested tool steps by creation time', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-parent',
      kind: 'tool_use',
      toolCallId: 'call-parent',
      parentToolCallId: null,
      toolName: 'project_file_flow',
      input: { task: 'update doc' },
      status: 'running',
      createdAt: 10,
    },
    {
      id: 'tool-use-apply',
      kind: 'tool_use',
      toolCallId: 'call-apply',
      parentToolCallId: 'call-parent',
      toolName: 'project_file_apply',
      input: { path: 'docs/spec.md' },
      status: 'completed',
      createdAt: 30,
    },
    {
      id: 'tool-use-plan',
      kind: 'tool_use',
      toolCallId: 'call-plan',
      parentToolCallId: 'call-parent',
      toolName: 'project_file_plan',
      input: { path: 'docs/spec.md' },
      status: 'completed',
      createdAt: 20,
    },
  ]);

  const childToolUses = model.childToolUsesByParent.get('call-parent');
  assert.deepEqual(
    childToolUses?.map((toolUse) => toolUse.toolCallId),
    ['call-plan', 'call-apply']
  );
});

test('runtime tool blocks use compact grouped timeline markup without fallback rendering', async () => {
  const [chatSource, cardSource, blocksSource, cssSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(cardPath, 'utf8'),
    readFile(blocksPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(chatSource, /buildRuntimeExecutionTimelineCards\(/);
  assert.match(chatSource, /chat-inline-disclosure/);
  assert.match(chatSource, /chat-tool-trace-phase-summary/);
  assert.match(chatSource, /chat-tool-trace-member-summary/);
  assert.match(chatSource, /chat-tool-card-summary/);
  assert.match(cardSource, /className="chat-tool-trace-stream compact"/);
  assert.match(cardSource, /data-runtime-trace="compact"/);
  assert.doesNotMatch(cardSource, /RuntimeFallbackToolGroup/);
  assert.doesNotMatch(cardSource, /buildFallbackToolGroupLabel/);
  assert.match(blocksSource, /WRAPPER_TOOL_NAMES/);
  assert.match(blocksSource, /buildCollapsedGroupHeadline/);
  assert.match(blocksSource, /chat-inline-disclosure chat-tool-trace-group-summary/);
  assert.match(blocksSource, /chat-tool-trace-group-main/);
  assert.match(blocksSource, /chat-tool-trace-group-copy/);
  assert.match(blocksSource, /chat-tool-trace-group-meta/);
  assert.match(blocksSource, /chat-tool-trace-group-detail/);
  assert.match(blocksSource, /chat-tool-trace-detail-line/);
  assert.match(blocksSource, /chat-tool-trace-line-copy/);
  assert.doesNotMatch(blocksSource, /RuntimeFallbackToolTree/);
  assert.doesNotMatch(blocksSource, /chat-tool-trace-detail-toggle/);
  assert.doesNotMatch(blocksSource, /鏇村缁嗚妭/);
  assert.doesNotMatch(blocksSource, /indexLabel/);
  assert.doesNotMatch(blocksSource, /prefix=/);
  assert.doesNotMatch(blocksSource, /\$\{index \+ 1\}\./);
  assert.doesNotMatch(cssSource, /chat-tool-trace-detail-toggle/);
  assert.match(cssSource, /\.chat-tool-trace-group-summary/);
  assert.match(cssSource, /\.chat-tool-trace-group-main/);
  assert.match(cssSource, /\.chat-tool-trace-group-copy/);
  assert.match(cssSource, /\.chat-tool-trace-group-meta/);
  assert.match(cssSource, /\.chat-tool-trace-detail-line/);
  assert.match(cssSource, /\.chat-inline-disclosure/);
  assert.match(cssSource, /\.chat-inline-disclosure-caret/);
  assert.match(cssSource, /text-overflow:\s*ellipsis/);
  assert.match(cssSource, /\.chat-tool-trace-line-copy\s*\{[\s\S]*align-items:\s*center/);
  assert.match(cssSource, /\.chat-tool-trace-caret\s*\{/);
  assert.match(cssSource, /margin-left:\s*auto/);
  assert.match(cssSource, /opacity:\s*0/);
  assert.match(cssSource, /:hover\s*>\s*\.chat-tool-trace-group-summary\s+\.chat-tool-trace-caret/);
  assert.match(cssSource, /\[open\]\s*>\s*\.chat-tool-trace-group-summary\s+\.chat-tool-trace-caret/);
});
