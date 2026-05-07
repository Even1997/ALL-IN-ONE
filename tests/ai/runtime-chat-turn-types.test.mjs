import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typesPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnTypes.ts',
);

test('runtime chat turn types expose a sidecar-friendly coordinator contract', async () => {
  const source = await readFile(typesPath, 'utf8');

  assert.match(source, /RuntimeChatTurnRequest/);
  assert.match(source, /projectId: string/);
  assert.match(source, /targetSessionId: string/);
  assert.match(source, /runtimeThreadId: string \| null/);
  assert.match(source, /rawUserInput: string/);
  assert.match(source, /cleanedUserInput: string/);
  assert.match(source, /selectedRuntimeConfigName: string \| null/);
  assert.match(source, /permissionMode: PermissionMode/);
  assert.match(source, /selectedChatAgentId: ChatAgentId/);
  assert.match(source, /fallbackToBuiltInMessage: string \| null/);
  assert.match(source, /activeSkills: RuntimeSkillDefinition\[\]/);
  assert.match(source, /RuntimeChatTurnPorts/);
  assert.match(source, /resolveProjectRootById: \(projectId: string\) => Promise<string>/);
  assert.match(source, /modelOverride\?: string \| null/);
  assert.match(source, /kind: 'thinking' \| 'text';/);
  assert.match(source, /delta: string/);
  assert.match(source, /persistRuntimeThread/);
  assert.match(source, /RuntimeChatQuestionRequest/);
  assert.match(source, /assistantMessageId: string/);
  assert.match(source, /waitForQuestionAnswer/);
  assert.match(source, /RuntimeChatTurnResult/);
  assert.match(source, /finalContent: string/);
});
