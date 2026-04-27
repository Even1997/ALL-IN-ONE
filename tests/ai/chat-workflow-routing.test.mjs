import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat routes workflow skill tokens through the workflow runner without switching away from chat', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /runAIWorkflowPackage/);
  assert.match(source, /chooseNextWorkflowPackage/);
  assert.match(source, /skillIntent\?\.package/);
  assert.match(source, /await runAIWorkflowPackage\(targetWorkflowPackage\)/);
  assert.doesNotMatch(source, /setActivePanel\('workflow'\)/);
  assert.match(source, /已在当前对话中执行/);
});
