import assert from 'node:assert/strict';
import test from 'node:test';

const loadComposer = async () =>
  import(`../../src/modules/ai/runtime/composer/timelineComposer.ts?test=${Date.now()}`);

test('composer groups tool work into one timeline card and keeps final text separate', async () => {
  const { createTimelineComposer } = await loadComposer();

  const composer = createTimelineComposer({ runId: 'run_1' });
  composer.append({
    eventId: '1',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'progress.updated',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { label: '正在检查项目结构' },
  });
  composer.append({
    eventId: '2',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.started',
    ts: 2,
    seq: 2,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'Get-ChildItem -Depth 2' },
  });
  composer.append({
    eventId: '3',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.completed',
    ts: 3,
    seq: 3,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', ok: true, summary: 'Scanned files' },
  });
  composer.append({
    eventId: '4',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    messageId: 'msg_1',
    type: 'message.completed',
    ts: 4,
    seq: 4,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { finalText: '已经定位到关键文件。' },
  });

  const projection = composer.getProjection();
  assert.equal(projection.cards.length, 2);
  assert.equal(projection.cards[0].phase, 'tooling');
  assert.equal(projection.cards[1].phase, 'response');
  assert.equal(projection.finalMessage?.text, '已经定位到关键文件。');
});

test('composer keeps tool stdout and stderr attached to the active tool card', async () => {
  const { createTimelineComposer } = await loadComposer();

  const composer = createTimelineComposer({ runId: 'run_2' });
  composer.append({
    eventId: '1',
    runId: 'run_2',
    turnId: 'turn_2',
    sessionId: 'session_2',
    type: 'tool.started',
    ts: 1,
    seq: 1,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'npm run build' },
  });
  composer.append({
    eventId: '2',
    runId: 'run_2',
    turnId: 'turn_2',
    sessionId: 'session_2',
    type: 'tool.stdout',
    ts: 2,
    seq: 2,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', chunk: 'building...' },
  });
  composer.append({
    eventId: '3',
    runId: 'run_2',
    turnId: 'turn_2',
    sessionId: 'session_2',
    type: 'tool.stderr',
    ts: 3,
    seq: 3,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', chunk: 'warning: deprecated flag' },
  });
  composer.append({
    eventId: '4',
    runId: 'run_2',
    turnId: 'turn_2',
    sessionId: 'session_2',
    type: 'tool.completed',
    ts: 4,
    seq: 4,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', ok: true, summary: 'Build finished' },
  });

  const projection = composer.getProjection();
  assert.equal(projection.cards.length, 1);
  assert.equal(projection.cards[0].status, 'completed');
  assert.equal(projection.cards[0].detailRefs.length, 4);
  assert.equal(projection.cards[0].warningCount, 1);
});

test('composer projects run lifecycle and response lifecycle into visible timeline cards', async () => {
  const { createTimelineComposer } = await loadComposer();

  const composer = createTimelineComposer({ runId: 'run_3' });
  composer.append({
    eventId: '1',
    runId: 'run_3',
    turnId: 'turn_3',
    sessionId: 'session_3',
    type: 'run.started',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { providerId: 'built-in', mode: 'agent' },
  });
  composer.append({
    eventId: '2',
    runId: 'run_3',
    turnId: 'turn_3',
    sessionId: 'session_3',
    messageId: 'msg_3',
    type: 'message.started',
    ts: 2,
    seq: 2,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { role: 'assistant' },
  });
  composer.append({
    eventId: '3',
    runId: 'run_3',
    turnId: 'turn_3',
    sessionId: 'session_3',
    messageId: 'msg_3',
    type: 'message.delta',
    ts: 3,
    seq: 3,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { textChunk: 'Drafting the final answer.' },
  });
  composer.append({
    eventId: '4',
    runId: 'run_3',
    turnId: 'turn_3',
    sessionId: 'session_3',
    messageId: 'msg_3',
    type: 'message.completed',
    ts: 4,
    seq: 4,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { finalText: 'Final answer ready.' },
  });
  composer.append({
    eventId: '5',
    runId: 'run_3',
    turnId: 'turn_3',
    sessionId: 'session_3',
    type: 'run.completed',
    ts: 5,
    seq: 5,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { outcome: 'success', summary: 'Run finished cleanly.' },
  });

  const projection = composer.getProjection();
  assert.deepEqual(
    projection.cards.map((card) => card.phase),
    ['intake', 'response'],
  );
  assert.equal(projection.cards[0].status, 'completed');
  assert.equal(projection.cards[1].status, 'completed');
  assert.equal(projection.cards[1].detailRefs.includes('3'), true);
  assert.equal(projection.finalMessage?.text, 'Final answer ready.');
});
