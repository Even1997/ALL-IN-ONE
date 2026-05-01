import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const servicePath = path.resolve(testDir, '../../src/modules/ai/core/AIService.ts');
const helperPath = path.resolve(testDir, '../../src/modules/ai/chat/projectFileOperations.ts');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AI chat exposes per-chat file operation mode and file operation proposal UI', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const helperSource = await readFile(helperPath, 'utf8');
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /本次聊天模式/);
  assert.match(chatSource, /手动确认/);
  assert.match(chatSource, /自动确认/);
  assert.match(chatSource, /projectFileProposal/);
  assert.match(chatSource, /renderProjectFileProposal/);
  assert.match(chatSource, /detectProjectFileWriteIntent/);
  assert.match(chatSource, /detectProjectFileReadIntent/);
  assert.match(chatSource, /parseProjectFileOperationsPlan/);
  assert.match(chatSource, /executeProjectFileOperations/);
  assert.match(chatSource, /确认执行|取消/);

  assert.match(messageListSource, /renderProjectFileProposal/);

  assert.match(helperSource, /resolveProjectOperationPath/);
  assert.match(helperSource, /isSupportedProjectTextFilePath/);

  assert.match(cssSource, /\.chat-mode-switch/);
  assert.match(cssSource, /\.chat-project-file-proposal-card/);
  assert.match(cssSource, /\.chat-project-file-proposal-actions/);
});

test('AI service exposes a read-tools chat path for project file queries', async () => {
  const serviceSource = await readFile(servicePath, 'utf8');

  assert.match(serviceSource, /chatWithTools/);
  assert.match(serviceSource, /allowedTools/);
  assert.match(serviceSource, /glob/);
  assert.match(serviceSource, /grep/);
  assert.match(serviceSource, /ls/);
  assert.match(serviceSource, /view/);
});
