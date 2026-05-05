import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AI chat converts failed write or edit access errors into project file recovery proposals', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /buildRuntimeWriteRecoveryProposal/);
  assert.match(source, /isProjectFileWriteAccessFailure/);
  assert.match(source, /buildProjectFileOperationFromToolCall/);
  assert.match(source, /const recoveryProposal = await buildRuntimeWriteRecoveryProposal\(/);
  assert.match(source, /projectFileProposal:\s*message\.projectFileProposal\s*\?\?\s*recoveryProposal/);
});
