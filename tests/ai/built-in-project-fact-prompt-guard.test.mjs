import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agentKernelPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts'
);
const directChatPromptPath = path.resolve(
  __dirname,
  '../../src/modules/ai/chat/directChatPrompt.ts'
);

test('built-in prompt guidance prefers canonical project files over temp artifacts', async () => {
  const [agentKernelSource, directChatSource] = await Promise.all([
    readFile(agentKernelPath, 'utf8'),
    readFile(directChatPromptPath, 'utf8'),
  ]);

  assert.match(
    agentKernelSource,
    /prefer canonical source files, docs, tests, and package scripts over temporary, cache, hidden, worktree, or log files/i
  );
  assert.match(
    directChatSource,
    /prefer canonical source files, docs, tests, and package scripts over temporary, cache, hidden, worktree, or log files/i
  );
});
