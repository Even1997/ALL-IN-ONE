import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates runtime project-file execution to orchestration helper', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /cancelRuntimeProjectFileProposal/);
  assert.match(source, /executeRuntimeApprovedProjectFileProposal/);
  assert.match(source, /executeRuntimeProjectFileOperations/);
  assert.match(source, /type RuntimeProjectFileToolResponse/);
  assert.match(source, /const executeProjectFileOperations = useCallback\(/);
  assert.match(source, /executeRuntimeProjectFileOperations\(/);
  assert.match(source, /await cancelRuntimeProjectFileProposal\(/);
  assert.match(source, /await executeRuntimeApprovedProjectFileProposal\(/);
  assert.doesNotMatch(source, /const changedPaths: string\[\] = \[\];/);
  assert.doesNotMatch(source, /invoke<TauriToolResponse>\('tool_mkdir'/);
  assert.doesNotMatch(source, /invoke<TauriToolResponse>\('tool_edit'/);
  assert.doesNotMatch(source, /invoke<TauriToolResponse>\('tool_remove'/);
});
