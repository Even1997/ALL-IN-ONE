import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime chat turn streaming owns assembler and live streaming patches', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts'),
    'utf8',
  );

  assert.match(source, /createRuntimeChatStreamingController/);
  assert.match(source, /createRuntimeStreamingMessageAssembler/);
  assert.match(source, /onModelEvent/);
  assert.match(source, /markToolBoundary/);
  assert.match(source, /finalize/);
});

test('runtime chat turn streaming keeps canonical message events on the parent run id', async () => {
  const { createRuntimeChatStreamingController } = await import(
    `../../src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts?test=${Date.now()}`
  );

  const canonicalEvents = [];
  const controller = createRuntimeChatStreamingController({
    assistantMessageId: 'assistant_msg_1',
    runId: 'run_parent_1',
    runtimeStoreThreadId: 'thread_1',
    baseTimeline: [],
    bridge: {
      appendCanonicalEvent: (_assistantMessageId, event) => {
        canonicalEvents.push(event);
      },
      patchLiveState: () => {},
      updateAssistantTimeline: () => {},
    },
  });

  controller.onModelEvent({ kind: 'text', delta: 'hello' });

  assert.equal(canonicalEvents.length >= 2, true);
  assert.equal(canonicalEvents[0]?.type, 'run.started');
  assert.equal(canonicalEvents[1]?.type, 'message.started');
  assert.equal(canonicalEvents[2]?.type, 'message.delta');
  assert.equal(canonicalEvents[0]?.runId, 'run_parent_1');
  assert.equal(canonicalEvents[1]?.runId, 'run_parent_1');
  assert.equal(canonicalEvents[2]?.runId, 'run_parent_1');
});
