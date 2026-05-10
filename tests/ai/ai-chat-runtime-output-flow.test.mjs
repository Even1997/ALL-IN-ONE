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

test('runtime tool blocks stay off the primary assistant path once canonical timeline rendering takes over', async () => {
  const [chatSource, timelineSource, cssSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(path.resolve(testDir, '../../src/components/workspace/timeline/TimelineCard.tsx'), 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(chatSource, /renderTimelineProjection/);
  assert.match(chatSource, /TimelineView/);
  assert.doesNotMatch(chatSource, /buildRuntimeExecutionTimelineCards\(/);
  assert.doesNotMatch(chatSource, /legacyRuntimeToolHelpers/);
  assert.match(timelineSource, /chat-timeline-card/);
  assert.match(cssSource, /\.chat-timeline-card/);
  assert.match(cssSource, /\.chat-timeline-detail-drawer/);
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

test('runtime output flow uses canonical event projection as the primary process rendering source', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /timelineProjectionByRunId/);
  assert.doesNotMatch(source, /buildRuntimeExecutionTimelineCards/);
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
    /\.chat-timeline-card\s*\{[\s\S]*padding:\s*12px 14px[\s\S]*border-radius:\s*16px[\s\S]*border:\s*1px solid/
  );
  assert.match(
    cssSource,
    /\.chat-timeline-detail-line\s*\{[\s\S]*padding:\s*10px 12px[\s\S]*border-radius:\s*14px[\s\S]*border:\s*1px solid/
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
    /\.chat-timeline-card-copy strong\s*\{[\s\S]*font-size:\s*13px/
  );
  assert.match(
    cssSource,
    /\.chat-timeline-card-phase,\s*\r?\n\.chat-timeline-card-progress,\s*\r?\n\.chat-timeline-card-status,\s*\r?\n\.chat-timeline-card-chip\s*\{[\s\S]*font-size:\s*12px[\s\S]*line-height:\s*1\.5/
  );
  assert.match(
    cssSource,
    /\.chat-timeline-detail-copy span,\s*\r?\n\.chat-timeline-detail-copy pre\s*\{[\s\S]*font-size:\s*13px[\s\S]*line-height:\s*1\.6/
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
