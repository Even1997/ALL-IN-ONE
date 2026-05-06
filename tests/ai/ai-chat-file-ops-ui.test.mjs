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

test('AIChat does not pre-route free text through project file intent regex', async () => {
  const chatSource = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(
    chatSource,
    /const\s+projectFileRequestKind\s*=\s*resolveProjectFileRequestKind\(/,
    'free text should enter the runtime tool loop; project file intent must be model/tool driven'
  );
});

test('AI chat routes project file requests through read/planning helpers and proposal UI', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const helperSource = await readFile(helperPath, 'utf8');
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /projectFileProposal/);
  assert.match(chatSource, /renderProjectFileProposal/);
  assert.match(chatSource, /renderRuntimeApproval/);
  assert.doesNotMatch(chatSource, /resolveProjectFileRequestKind/);
  assert.match(chatSource, /findLatestPendingProjectFileProposalAction/);
  assert.match(chatSource, /isShortPendingActionAffirmation/);
  assert.match(chatSource, /handleExecuteProjectFileProposal\(\s*pendingProjectFileAction\.messageId/);
  assert.match(chatSource, /handleCancelProjectFileProposal\(pendingProjectFileAction\.messageId\)/);
  assert.doesNotMatch(chatSource, /parseProjectFileOperationsPlan/);
  assert.doesNotMatch(chatSource, /executeRuntimeProjectFileRead/);
  assert.doesNotMatch(chatSource, /executeRuntimeProjectFilePlanning/);
  assert.doesNotMatch(chatSource, /prepareProjectFileProposalFlow/);
  assert.doesNotMatch(chatSource, /requestRuntimeProjectFileApproval/);
  assert.match(chatSource, /conversationHistory/);
  assert.match(chatSource, /executeProjectFileOperations/);
  assert.match(chatSource, /notifyProjectFilesChanged/);
  assert.doesNotMatch(chatSource, /projectFileRequestKind/);
  assert.doesNotMatch(chatSource, /projectFileMode = shouldForceProjectFileProposal/);
  assert.doesNotMatch(chatSource, /resolveProjectFileRequestKind\(\{\s*rawInput: rawContent,\s*cleanedInput: cleanedContent,\s*conversationHistory,/);
  assert.match(chatSource, /notifyProjectFilesChanged\(result\.changedPaths\)/);
  assert.match(chatSource, /notifyProjectFilesChanged\(checkpointFilesFromToolCalls\.map\(\(file\) => file\.path\)\)/);

  assert.match(messageListSource, /renderProjectFileProposal/);
  assert.match(messageListSource, /renderRuntimeApproval/);

  assert.match(helperSource, /resolveProjectOperationPath/);
  assert.match(helperSource, /isSupportedProjectTextFilePath/);
  assert.match(helperSource, /findLatestPendingProjectFileProposalAction/);
  assert.match(helperSource, /SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN/);
  assert.doesNotMatch(helperSource, /resolveProjectFileRequestKind/);
  assert.doesNotMatch(helperSource, /detectProjectFileWriteIntent/);
  assert.doesNotMatch(helperSource, /detectProjectFileReadIntent/);
  assert.doesNotMatch(helperSource, /detectTaskAuthorizedProjectWriteIntent/);
  assert.doesNotMatch(helperSource, /shouldForceProjectFileProposal/);

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

test('AI chat uses delete-specific proposal copy instead of generic write wording', async () => {
  const chatSource = await readFile(chatPath, 'utf8');

  assert.match(chatSource, /删除文件/);
  assert.match(chatSource, /删除完成/);
  assert.match(chatSource, /正在删除文件并校验结果/);
});
