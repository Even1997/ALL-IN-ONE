import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const bridgePath = path.join(
  repoRoot,
  'src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts',
);

test('runtime sidecar session bridge maps snapshots into the desktop chat store', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /subscribeDesktopRuntimeEvents/);
  assert.match(source, /RuntimeSessionSnapshot/);
  assert.match(source, /useAIChatStore/);
  assert.match(source, /replaceSessionMessages/);
  assert.match(source, /upsertSession/);
});

test('runtime sidecar session bridge consumes streaming assistant messages and runtime interaction projections', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /const patchLiveStateIfChanged =/);
  assert.match(source, /const patchApprovalSummaryIfChanged =/);
  assert.match(source, /replaceCanonicalEvents/);
  assert.match(source, /appendCanonicalEvent/);
  assert.match(source, /canonicalEvents/);
  assert.match(source, /applyRuntimeSidecarTurnDeltaEvent/);
  assert.match(source, /patchLiveStateIfChanged\(sessionId,/);

  assert.match(source, /event\.type === 'message\.delta'/);
  assert.match(source, /event\.type === 'turn\.finished'/);
  assert.match(source, /event\.type === 'turn\.delta'/);
  assert.match(source, /event\.type === 'turn\.usage'/);
  assert.match(source, /event\.type === 'turn\.started'/);
  assert.match(source, /event\.type === 'turn\.reasoning'/);
  assert.match(source, /event\.type === 'tool\.started'/);
  assert.match(source, /event\.type === 'tool\.finished'/);
  assert.match(source, /event\.type === 'tool\.updated'/);
  assert.match(source, /event\.type === 'approval\.requested'/);
  assert.match(source, /event\.type === 'approval\.resolved'/);
  assert.match(source, /event\.type === 'question\.requested'/);
  assert.match(source, /event\.type === 'question\.answered'/);
  assert.match(source, /event\.type === 'checkpoint\.saved'/);
  assert.match(source, /event\.type === 'background_task\.updated'/);
  assert.match(source, /event\.type === 'team_run\.updated'/);
  assert.match(source, /event\.type === 'turn\.completed'/);
  assert.match(source, /event\.type === 'turn\.failed'/);
  assert.match(source, /useApprovalStore/);
  assert.match(source, /useRuntimeMcpStore/);
  assert.match(source, /listMcpServers/);
  assert.match(source, /listMcpToolCalls/);
  assert.match(source, /listReplayEvents/);
  assert.match(source, /listCheckpoints/);
  assert.match(source, /getCheckpointDiff/);
  assert.match(source, /rewindCheckpoint/);
  assert.match(source, /initializeRuntimeSidecarBackgroundTasks/);
  assert.match(source, /initializeRuntimeSidecarReplayHistory/);
  assert.match(source, /listRuntimeSidecarCheckpoints/);
  assert.match(source, /getRuntimeSidecarCheckpointDiff/);
  assert.match(source, /rewindRuntimeSidecarCheckpoint/);
  assert.match(source, /setThreadToolCalls/);
  assert.match(source, /setThreadBackgroundTasks/);
  assert.match(source, /pendingQuestionSummary/);
  assert.match(source, /pendingApprovalSummary/);
});

test('runtime sidecar turn deltas update live text without persisting canonical message deltas', async () => {
  const source = await readFile(bridgePath, 'utf8');
  const deltaHandler = source.slice(
    source.indexOf('const applyRuntimeSidecarTurnDeltaNow ='),
    source.indexOf('const runtimeSidecarDeltaCoalescer ='),
  );

  assert.match(deltaHandler, /runtimeStore\.appendStreamDelta\(sessionId,\s*delta\)/);
  assert.match(deltaHandler, /streamingText:\s*`\$\{state\.streamingText\}\$\{delta\}`/);
  assert.doesNotMatch(deltaHandler, /appendRuntimeSidecarCanonicalEvent/);
  assert.doesNotMatch(deltaHandler, /type:\s*'message\.delta'/);
});

test('runtime sidecar session bridge keeps protocol imports and MCP server projection type-safe', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.doesNotMatch(source, /import type\s*\{[\s\S]*\btype\s+RuntimeApprovalEventRecord/);
  assert.match(source, /args:\s*server\.args\s*\?\s*\[\.\.\.server\.args\]\s*:\s*undefined/);
});
