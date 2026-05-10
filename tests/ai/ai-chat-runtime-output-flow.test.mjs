import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const coordinatorPath = path.resolve(
  testDir,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);
const cardPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolExecutionCard.tsx');
const blocksPath = path.resolve(testDir, '../../src/components/workspace/AIChatRuntimeToolBlocks.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

const loadRenderModel = async () =>
  import(`../../src/components/workspace/runtimeEventRenderModel.ts?test=${Date.now()}`);
const loadAssistantTimeline = async () =>
  import(`../../src/modules/ai/store/assistantTimeline.ts?test=${Date.now()}`);

test('runtime event render model keeps repeated file edits as separate chronological steps', async () => {
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

  assert.equal(model.items.length, 3);
  assert.deepEqual(
    model.items.map((item) => item.kind === 'tool_group' ? item.toolUses.map((toolUse) => toolUse.toolCallId) : []),
    [['call-1'], ['call-2'], ['call-3']],
  );
});

test('runtime event render model keeps adjacent top-level tool steps as separate chronological groups', async () => {
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
  assert.equal(model.items[0]?.toolUses.length, 1);
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.equal(model.items[1]?.toolUses.length, 1);
  assert.deepEqual(
    model.items.map((item) => item.kind === 'tool_group' ? item.toolUses.map((toolUse) => toolUse.toolCallId) : []),
    [['call-1'], ['call-2']],
  );
});

test('runtime event render model keeps mixed action summaries as separate top-level groups', async () => {
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

  assert.equal(model.items.length, 3);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.equal(model.items[2]?.kind, 'tool_group');
  assert.deepEqual(
    model.items.map((item) => item.kind === 'tool_group' ? item.toolUses.map((toolUse) => toolUse.toolCallId) : []),
    [['call-1'], ['call-2'], ['call-3']],
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

test('runtime event render model splits tool groups when assistant reasoning or text appears between them', async () => {
  const { buildRuntimeTimelineModelFromAssistantTimeline } = await loadRenderModel();
  const model = buildRuntimeTimelineModelFromAssistantTimeline([
    {
      id: 'reasoning-1',
      kind: 'reasoning',
      content: 'Check the first file.',
      collapsed: true,
      createdAt: 1,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 2,
    },
    {
      id: 'tool-result-1',
      kind: 'tool_result',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      status: 'completed',
      output: 'done',
      createdAt: 3,
    },
    {
      id: 'text-1',
      kind: 'text',
      content: 'The first check is done.',
      createdAt: 4,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'next' },
      status: 'running',
      createdAt: 5,
    },
  ]);

  assert.equal(model.items.length, 2);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.deepEqual(model.items[0]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-1']);
  assert.deepEqual(model.items[1]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-2']);
});

test('runtime event render model keeps tool groups split after assistant content is rebuilt during streaming', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();
  const { buildRuntimeTimelineModelFromAssistantTimeline } = await loadRenderModel();

  const currentTimeline = [
    {
      id: 'reasoning-1',
      kind: 'reasoning',
      content: 'Check the first file.',
      collapsed: true,
      createdAt: 1,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 2,
    },
    {
      id: 'tool-result-1',
      kind: 'tool_result',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      status: 'completed',
      output: 'done',
      createdAt: 3,
    },
    {
      id: 'text-1',
      kind: 'text',
      content: 'The first check is done.',
      createdAt: 4,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'next' },
      status: 'running',
      createdAt: 5,
    },
  ];

  const rebuiltTimeline = buildAssistantTimelineUpdate(
    '<think>Check the first file again</think>\n\nThe first check is still done.',
    currentTimeline,
  );
  const model = buildRuntimeTimelineModelFromAssistantTimeline(rebuiltTimeline);

  assert.equal(model.items.length, 2);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.deepEqual(model.items[0]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-1']);
  assert.deepEqual(model.items[1]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-2']);
});

test('runtime event render model keeps tool groups split when final content only includes the latest answer segment', async () => {
  const { buildAssistantTimelineUpdate } = await loadAssistantTimeline();
  const { buildRuntimeTimelineModelFromAssistantTimeline } = await loadRenderModel();

  const currentTimeline = [
    {
      id: 'reasoning-1',
      kind: 'reasoning',
      content: 'Check the first file.',
      collapsed: true,
      createdAt: 1,
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 2,
    },
    {
      id: 'tool-result-1',
      kind: 'tool_result',
      toolCallId: 'call-1',
      parentToolCallId: null,
      toolName: 'view',
      status: 'completed',
      output: 'done',
      createdAt: 3,
    },
    {
      id: 'text-1',
      kind: 'text',
      content: 'The first check is done.',
      createdAt: 4,
    },
    {
      id: 'tool-use-2',
      kind: 'tool_use',
      toolCallId: 'call-2',
      parentToolCallId: null,
      toolName: 'edit',
      input: { file_path: 'src/App.tsx', new_string: 'next' },
      status: 'running',
      createdAt: 5,
    },
  ];

  const rebuiltTimeline = buildAssistantTimelineUpdate(
    'Now fix the second issue.',
    currentTimeline,
    {
      preferredAssistantParts: [
        { type: 'thinking', content: 'Check the first file.', collapsed: true, createdAt: 1 },
        { type: 'text', content: 'The first check is done.', createdAt: 4 },
        { type: 'text', content: 'Now fix the second issue.', createdAt: 6 },
      ],
    },
  );
  const model = buildRuntimeTimelineModelFromAssistantTimeline(rebuiltTimeline);

  assert.equal(model.items.length, 2);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[1]?.kind, 'tool_group');
  assert.deepEqual(model.items[0]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-1']);
  assert.deepEqual(model.items[1]?.toolUses.map((toolUse) => toolUse.toolCallId), ['call-2']);
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
  assert.doesNotMatch(blocksSource, /閺囨潙顦跨紒鍡氬Ν/);
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

test('runtime event render model hides internal memory reads from visible tool cards', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    {
      id: 'tool-use-memory',
      kind: 'tool_use',
      toolCallId: 'call-memory',
      parentToolCallId: null,
      toolName: 'memory_read',
      input: { scope: 'project' },
      status: 'completed',
      createdAt: 1,
    },
    {
      id: 'tool-result-memory',
      kind: 'tool_result',
      toolCallId: 'call-memory',
      parentToolCallId: null,
      toolName: 'memory_read',
      status: 'completed',
      output: 'loaded',
      createdAt: 2,
    },
    {
      id: 'tool-use-view',
      kind: 'tool_use',
      toolCallId: 'call-view',
      parentToolCallId: null,
      toolName: 'view',
      input: { file_path: 'src/App.tsx' },
      status: 'completed',
      createdAt: 3,
    },
  ]);

  assert.equal(model.items.length, 1);
  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.deepEqual(
    model.items[0]?.kind === 'tool_group' ? model.items[0].toolUses.map((toolUse) => toolUse.toolCallId) : [],
    ['call-view'],
  );
});

test('runtime event render model tolerates malformed assistant timeline values', async () => {
  const { buildRuntimeTimelineModelFromAssistantTimeline } = await loadRenderModel();
  const model = buildRuntimeTimelineModelFromAssistantTimeline(/** @type {any} */ ({ kind: 'oops' }));

  assert.deepEqual(model.items, []);
  assert.deepEqual(model.orderedRuntimeEvents, []);
});

test('runtime event render model uses the shared ask-user tool constant', async () => {
  const source = await readFile(
    path.resolve(testDir, '../../src/components/workspace/runtimeEventRenderModel.ts'),
    'utf8',
  );

  assert.match(source, /ASK_USER_TOOL_NAME/);
  assert.doesNotMatch(source, /const ASK_USER_TOOL_NAME = 'AskUserQuestion'/);
});

test('assistant narrative, thinking, and runtime cards share a unified surface language', async () => {
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(
    cssSource,
    /\.chat-answer-text\s*\{[\s\S]*padding:\s*14px 16px[\s\S]*border-radius:\s*16px[\s\S]*border:\s*1px solid/
  );
  assert.match(
    cssSource,
    /\.chat-thinking-block\s*\{[\s\S]*padding:\s*10px 12px 12px[\s\S]*border-radius:\s*16px[\s\S]*border:\s*1px solid/
  );
  assert.match(
    cssSource,
    /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-summary\s*\{[\s\S]*padding:\s*10px 12px[\s\S]*border-radius:\s*14px[\s\S]*border:\s*1px solid/
  );
  assert.match(
    cssSource,
    /\.chat-runtime-question-card,\s*\r?\n\.chat-runtime-approval-card\s*\{[\s\S]*border-radius:\s*16px[\s\S]*backdrop-filter:\s*blur\(14px\)/
  );
});

test('assistant narrative and runtime cards use a consistent typography scale', async () => {
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(
    cssSource,
    /\.chat-answer-text\s*\{[\s\S]*font-size:\s*14px[\s\S]*line-height:\s*1\.72/
  );
  assert.match(
    cssSource,
    /\.chat-thinking-block\s*\{[\s\S]*font-size:\s*13px[\s\S]*line-height:\s*1\.6/
  );
  assert.match(
    cssSource,
    /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-copy strong\s*\{[\s\S]*font-size:\s*13px/
  );
  assert.match(
    cssSource,
    /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-meta\s*\{[\s\S]*font-size:\s*12px[\s\S]*line-height:\s*1\.5/
  );
  assert.match(
    cssSource,
    /\.chat-runtime-question-prompt,\s*\r?\n\.chat-runtime-question-answer[\s\S]*font-size:\s*13px[\s\S]*line-height:\s*1\.6/
  );
});

test('built-in runtime seeds a visible thinking placeholder before the first model event', async () => {
  const chatSource = await readFile(coordinatorPath, 'utf8');

  assert.match(chatSource, /pushStreamingDraft\(assistantMessage\.id,\s*\{/);
  assert.match(chatSource, /fallbackThinkingContent:\s*'正在思考\.\.\.'/);
  assert.match(chatSource, /await emitMemoryReadLifecycle\(\);/);
});
