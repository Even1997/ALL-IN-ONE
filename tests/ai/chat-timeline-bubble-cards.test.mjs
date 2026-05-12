import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const loadComposer = async () =>
  import(`../../src/modules/ai/runtime/composer/timelineComposer.ts?test=${Date.now()}`);

const loadBubbleCards = async () =>
  import(`../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`);

const loadTimelineDetails = async () =>
  import(`../../src/components/workspace/timeline/timelineEventDetails.ts?test=${Date.now()}`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('chat timeline bubble cards suppress the redundant run-start card', async () => {
  const [{ createTimelineComposer }, { buildChatTimelineBubbleCards }] = await Promise.all([
    loadComposer(),
    loadBubbleCards(),
  ]);

  const composer = createTimelineComposer({ runId: 'run_cards_1' });
  composer.append({
    eventId: 'evt_1',
    runId: 'run_cards_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'run.started',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { providerId: 'built-in', mode: 'agent' },
  });
  composer.append({
    eventId: 'evt_2',
    runId: 'run_cards_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.started',
    ts: 2,
    seq: 2,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'npm run build' },
  });
  composer.append({
    eventId: 'evt_3',
    runId: 'run_cards_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.completed',
    ts: 3,
    seq: 3,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', ok: true, summary: 'Build finished' },
  });
  composer.append({
    eventId: 'evt_4',
    runId: 'run_cards_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    messageId: 'msg_1',
    type: 'message.completed',
    ts: 4,
    seq: 4,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { finalText: 'Done.' },
  });

  const model = buildChatTimelineBubbleCards(composer.getProjection());
  assert.equal(model.descriptors.length, 1);
  assert.equal(model.descriptors[0].card.phase, 'tooling');
  assert.notEqual(model.descriptors[0].card.title, 'Run');
  assert.equal(model.completedResponseSummary?.phase, 'response');
});

test('timeline detail items summarize build commands instead of exposing raw command text as the main label', async () => {
  const { buildTimelineDetailItems } = await loadTimelineDetails();

  const items = buildTimelineDetailItems([
    {
      eventId: 'evt_build_1',
      runId: 'run_build_1',
      turnId: 'turn_build_1',
      sessionId: 'session_build_1',
      type: 'tool.started',
      ts: 1,
      seq: 1,
      source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
      payload: {
        toolCallId: 'call_build_1',
        toolName: 'powershell',
        inputSummary: 'npm run build',
        input: { command: 'npm run build' },
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'PowerShell');
  assert.equal(items[0].value, 'Build project');
});

test('compact timeline cards avoid glassy blur and hover lift animations', async () => {
  const source = await readFile(aiChatCssPath, 'utf8');
  const summaryBlockMatch = source.match(
    /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-summary \{([\s\S]*?)\n\}/,
  );
  const hoverBlockMatch = source.match(
    /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-summary:hover \{([\s\S]*?)\n\}/,
  );

  assert.match(source, /\.chat-tool-trace-stream\.compact \.chat-tool-trace-group-summary \{/);
  assert.ok(summaryBlockMatch);
  assert.ok(hoverBlockMatch);
  assert.doesNotMatch(summaryBlockMatch[1], /backdrop-filter:/);
  assert.match(summaryBlockMatch[1], /border:\s*0/);
  assert.match(summaryBlockMatch[1], /border-radius:\s*0/);
  assert.match(summaryBlockMatch[1], /background:\s*transparent/);
  assert.doesNotMatch(hoverBlockMatch[1], /transform:/);
});
