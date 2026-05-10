import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime chat turn tools only own tool executor wiring', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts'),
    'utf8',
  );

  assert.match(source, /ToolExecutor/);
  assert.match(source, /createRuntimeChatToolExecutor/);
  assert.doesNotMatch(source, /ASK_USER_TOOL_NAME/);
  assert.doesNotMatch(source, /BUILT_IN_EXECUTION_TOOLS/);
  assert.doesNotMatch(source, /READ_ONLY_CHAT_TOOLS/);
  assert.doesNotMatch(source, /RISKY_BUILT_IN_TOOLS/);
});
