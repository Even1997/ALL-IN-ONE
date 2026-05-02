import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const workflowFlowPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeWorkflowFlow.ts'
);

test('chat routes explicit workflow packages through the workflow runner without switching away from chat', async () => {
  const [source, workflowFlowSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(workflowFlowPath, 'utf8'),
  ]);

  assert.match(source, /runAIWorkflowPackage/);
  assert.match(source, /buildRuntimeWorkflowCompletion/);
  assert.match(source, /if \(\s*skillIntent &&/);
  assert.match(source, /skillIntent\.package === 'requirements'/);
  assert.match(source, /skillIntent\.package === 'prototype'/);
  assert.match(source, /skillIntent\.package === 'page'/);
  assert.match(source, /const targetWorkflowPackage = skillIntent\.package;/);
  assert.match(source, /await runAIWorkflowPackage\(targetWorkflowPackage\)/);
  assert.match(source, /const workflowCompletion = buildRuntimeWorkflowCompletion\(/);
  assert.match(source, /workflowCompletion\.finalContent/);
  assert.doesNotMatch(source, /setActivePanel\('workflow'\)/);
  assert.doesNotMatch(source, /skillIntent\.package === 'knowledge-organize'/);
  assert.doesNotMatch(source, /skillIntent\.package === 'change-sync'/);

  assert.match(workflowFlowSource, /已在当前对话中执行/);
  assert.match(workflowFlowSource, /Workflow completed:/);
});
