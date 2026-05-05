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

test('AI chat routes project file requests through read/planning helpers and proposal UI', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const helperSource = await readFile(helperPath, 'utf8');
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /projectFileProposal/);
  assert.match(chatSource, /renderProjectFileProposal/);
  assert.match(chatSource, /renderRuntimeApproval/);
  assert.match(chatSource, /resolveProjectFileRequestKind/);
  assert.match(chatSource, /shouldForceProjectFileProposal/);
  assert.match(chatSource, /findLatestPendingProjectFileProposalAction/);
  assert.match(chatSource, /isShortPendingActionAffirmation/);
  assert.match(chatSource, /handleExecuteProjectFileProposal\(\s*pendingProjectFileAction\.messageId/);
  assert.match(chatSource, /handleCancelProjectFileProposal\(pendingProjectFileAction\.messageId\)/);
  assert.match(chatSource, /parseProjectFileOperationsPlan/);
  assert.match(chatSource, /executeRuntimeProjectFileRead/);
  assert.match(chatSource, /executeRuntimeProjectFilePlanning/);
  assert.match(chatSource, /prepareProjectFileProposalFlow/);
  assert.match(chatSource, /requestRuntimeProjectFileApproval/);
  assert.match(chatSource, /conversationHistory/);
  assert.match(chatSource, /conversationHistory,\s*projectName: currentProject\.name/);
  assert.match(chatSource, /executeProjectFileOperations/);
  assert.match(chatSource, /projectFileRequestKind === 'read'/);
  assert.match(chatSource, /projectFileRequestKind === 'write'/);
  assert.match(chatSource, /projectFileMode = shouldForceProjectFileProposal/);
  assert.match(chatSource, /resolveProjectFileRequestKind\(\{\s*rawInput: rawContent,\s*cleanedInput: cleanedContent,\s*conversationHistory,/);

  assert.match(messageListSource, /renderProjectFileProposal/);
  assert.match(messageListSource, /renderRuntimeApproval/);

  assert.match(helperSource, /resolveProjectOperationPath/);
  assert.match(helperSource, /isSupportedProjectTextFilePath/);
  assert.match(helperSource, /findLatestPendingProjectFileProposalAction/);
  assert.match(helperSource, /SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN/);
  assert.match(helperSource, /resolveProjectFileRequestKind/);
  assert.match(helperSource, /shouldForceProjectFileProposal/);

  assert.match(cssSource, /\.chat-project-file-proposal-card/);
  assert.match(cssSource, /\.chat-runtime-approval-card/);
  assert.doesNotMatch(chatSource, /确认写入/);
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
