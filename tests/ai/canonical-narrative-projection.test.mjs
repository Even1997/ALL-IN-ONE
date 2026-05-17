import assert from 'node:assert/strict';
import test from 'node:test';

const loadProjection = async () =>
  import(`../../src/modules/ai/runtime/timeline/canonicalNarrativeProjection.ts?test=${Date.now()}`);

const base = {
  runId: 'run_1',
  turnId: 'turn_1',
  sessionId: 'session_1',
  messageId: 'msg_1',
  source: { kind: 'model', provider: 'built-in', name: 'assistant' },
};

const event = (type, payload, seq, ts = 100) => ({
  ...base,
  eventId: `evt_${seq}`,
  type,
  payload,
  ts,
  seq,
});

test('canonical narrative projection separates reasoning, tools, and final answer in event order', async () => {
  const { projectCanonicalEventsToAssistantTimeline } = await loadProjection();

  const timeline = projectCanonicalEventsToAssistantTimeline([
    event('message.completed', { finalText: 'Final answer', phase: 'final_answer' }, 6, 106),
    event('reasoning.started', {}, 1, 101),
    event('reasoning.delta', { textChunk: 'Check files' }, 2, 102),
    {
      ...event('tool.started', { toolCallId: 'tool_1', toolName: 'view', input: { path: 'a.md' } }, 3, 103),
      source: { kind: 'tool', provider: 'built-in', name: 'view' },
    },
    {
      ...event('tool.completed', { toolCallId: 'tool_1', ok: true, outputText: 'ok' }, 4, 104),
      source: { kind: 'tool', provider: 'built-in', name: 'view' },
    },
    event('reasoning.completed', {}, 5, 105),
  ]);

  assert.deepEqual(timeline.map((item) => item.kind), [
    'reasoning',
    'tool_use',
    'tool_result',
    'text',
  ]);
  assert.equal(timeline[0].content, 'Check files');
  assert.equal(timeline[0].status, 'completed');
  assert.equal(timeline[3].content, 'Final answer');
});

test('canonical narrative projection ignores commentary as durable answer text', async () => {
  const { projectCanonicalEventsToAssistantTimeline } = await loadProjection();

  const timeline = projectCanonicalEventsToAssistantTimeline([
    event('message.delta', { textChunk: 'Working...', phase: 'commentary' }, 1, 101),
    event('message.completed', { finalText: 'Working...', phase: 'commentary' }, 2, 102),
    event('message.delta', { textChunk: 'Final', phase: 'final_answer' }, 3, 103),
    event('message.completed', { finalText: 'Final answer', phase: 'final_answer' }, 4, 104),
  ]);

  assert.deepEqual(timeline.map((item) => item.kind), ['text']);
  assert.equal(timeline[0].content, 'Final answer');
});

test('canonical narrative projection does not duplicate reasoning when sidecar replays full snapshot text then final text', async () => {
  const { projectCanonicalEventsToAssistantTimeline } = await loadProjection();

  const timeline = projectCanonicalEventsToAssistantTimeline([
    event('reasoning.started', {}, 1, 101),
    event('reasoning.delta', { textChunk: '好的，让我先看看这个项目的结构。' }, 2, 102),
    event('reasoning.completed', { finalText: '好的，让我先看看这个项目的结构。' }, 3, 103),
  ]);

  assert.deepEqual(timeline.map((item) => item.kind), ['reasoning']);
  assert.equal(timeline[0].content, '好的，让我先看看这个项目的结构。');
  assert.equal(timeline[0].status, 'completed');
});

test('canonical narrative projection appends reasoning suffix deltas from sidecar snapshots without duplicating prior text', async () => {
  const { projectCanonicalEventsToAssistantTimeline } = await loadProjection();

  const timeline = projectCanonicalEventsToAssistantTimeline([
    event('reasoning.started', {}, 1, 101),
    event('reasoning.delta', { textChunk: '好的，让我先看看这个项目的结构。' }, 2, 102),
    event('reasoning.delta', { textChunk: '然后我会顺着运行链路继续排查。' }, 3, 103),
    event(
      'reasoning.completed',
      { finalText: '好的，让我先看看这个项目的结构。然后我会顺着运行链路继续排查。' },
      4,
      104,
    ),
  ]);

  assert.deepEqual(timeline.map((item) => item.kind), ['reasoning']);
  assert.equal(
    timeline[0].content,
    '好的，让我先看看这个项目的结构。然后我会顺着运行链路继续排查。',
  );
  assert.equal(timeline[0].status, 'completed');
});
