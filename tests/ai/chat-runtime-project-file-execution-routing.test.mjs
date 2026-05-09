import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);
const projectFileFlowPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeProjectFileExecutionFlow.ts',
);

test('chat delegates runtime project-file execution to orchestration helpers', async () => {
  const [chatSource, coordinatorSource, projectFileFlowSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(coordinatorPath, 'utf8'),
    readFile(projectFileFlowPath, 'utf8'),
  ]);

  assert.match(projectFileFlowSource, /cancelRuntimeProjectFileProposal/);
  assert.match(projectFileFlowSource, /executeRuntimeApprovedProjectFileProposal/);
  assert.match(projectFileFlowSource, /executeRuntimeProjectFileOperations/);
  assert.match(projectFileFlowSource, /type RuntimeProjectFileToolResponse/);
  assert.match(chatSource, /resolveProjectRuntimeRootPath/);
  assert.match(chatSource, /const resolveProjectRootById = useCallback\(/);
  assert.match(coordinatorSource, /const projectRoot = await ports\.resolveProjectRootById\(request\.projectId\)/);
  assert.match(projectFileFlowSource, /executeProjectFileOperations: \(/);
  assert.match(projectFileFlowSource, /const result = await input\.executeProjectFileOperations\(projectRoot,\s*input\.proposal\.operations\)/);
  assert.match(coordinatorSource, /await completeTurnSession\(executionResult\.successOutcome\.replaySummary\)/);
  assert.match(coordinatorSource, /buildSessionPreview/);
  assert.match(projectFileFlowSource, /const changedPaths: string\[\] = \[\];/);
  assert.match(projectFileFlowSource, /const fileChanges: RuntimeProjectFileExecutionResult\['fileChanges'\] = \[\];/);
  assert.doesNotMatch(projectFileFlowSource, /invoke<TauriToolResponse>\('tool_mkdir'/);
  assert.doesNotMatch(projectFileFlowSource, /invoke<TauriToolResponse>\('tool_edit'/);
  assert.doesNotMatch(projectFileFlowSource, /invoke<TauriToolResponse>\('tool_remove'/);
});
