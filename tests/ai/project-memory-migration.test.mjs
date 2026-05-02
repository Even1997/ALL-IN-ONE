import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const typesPath = path.resolve(__dirname, '../../src/types/index.ts');
const projectStorePath = path.resolve(__dirname, '../../src/store/projectStore.ts');
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('project memory schema and store support thread-scoped memory entries', async () => {
  const typesSource = await readFile(typesPath, 'utf8');
  const projectStoreSource = await readFile(projectStorePath, 'utf8');

  assert.match(typesSource, /threadId:/);
  assert.match(projectStoreSource, /threadId:/);
  assert.match(projectStoreSource, /memoryEntries:/);
});

test('runtime summary and chat runtime reference replay or resume state', async () => {
  const runtimeSummarySource = await readFile(runtimeSummaryPath, 'utf8');
  const aiChatSource = await readFile(aiChatPath, 'utf8');

  assert.match(runtimeSummarySource, /replay|recovery|resume/i);
  assert.match(aiChatSource, /listRuntimeReplayEvents|appendRuntimeReplayEvent/);
});
