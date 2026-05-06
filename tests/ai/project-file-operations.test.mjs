import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../../src/modules/ai/chat/projectFileOperations.ts');

const loadModule = async () => {
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('project file operations allow arbitrary project file paths for write flows', async () => {
  const { isSupportedProjectTextFilePath } = await loadModule();

  assert.equal(isSupportedProjectTextFilePath('docs/spec.md'), true);
  assert.equal(isSupportedProjectTextFilePath('src/app.tsx'), true);
  assert.equal(isSupportedProjectTextFilePath('scripts/build.py'), true);
  assert.equal(isSupportedProjectTextFilePath('src/main.rs'), true);
  assert.equal(isSupportedProjectTextFilePath('queries/report.sql'), true);
  assert.equal(isSupportedProjectTextFilePath('assets/logo.png'), true);
  assert.equal(isSupportedProjectTextFilePath('docs/archive.pdf'), true);
});

test('project file operations detect write intent from natural language prompts', async () => {
  const { detectProjectFileWriteIntent } = await loadModule();

  assert.equal(detectProjectFileWriteIntent('\u8bf7\u65b0\u5efa docs/prd.md'), true);
  assert.equal(detectProjectFileWriteIntent('\u628a src/config.ts \u4fee\u6539\u4e00\u4e0b'), true);
  assert.equal(detectProjectFileWriteIntent('\u628a obsolete.md \u5220\u9664\u6389'), true);
  assert.equal(detectProjectFileWriteIntent('\u8bf7\u628a\u9700\u6c42\u6587\u6863\u4fdd\u5b58\u6210 docs/prd.md'), true);
  assert.equal(detectProjectFileWriteIntent('\u628a\u5185\u5bb9\u5199\u5230 C:\\repo\\demo\\docs\\prd.md'), true);
  assert.equal(detectProjectFileWriteIntent('\u5e2e\u6211\u770b\u770b docs \u76ee\u5f55\u91cc\u6709\u4ec0\u4e48'), false);
});

test('project file operations detect read intent without forcing confirmation flows', async () => {
  const { detectProjectFileReadIntent } = await loadModule();

  assert.equal(detectProjectFileReadIntent('\u5e2e\u6211\u770b\u770b docs \u76ee\u5f55\u91cc\u6709\u4ec0\u4e48'), true);
  assert.equal(detectProjectFileReadIntent('\u8bfb\u53d6 docs/prd.md \u5185\u5bb9'), true);
  assert.equal(detectProjectFileReadIntent('\u5e2e\u6211\u641c\u7d22 login \u76f8\u5173\u5185\u5bb9'), true);
  assert.equal(detectProjectFileReadIntent('\u8bf7\u65b0\u5efa docs/prd.md'), false);
});

test('project file operations detect task-authorized write intent without requiring explicit save wording', async () => {
  const { detectTaskAuthorizedProjectWriteIntent } = await loadModule();

  assert.equal(detectTaskAuthorizedProjectWriteIntent('\u5e2e\u6211\u4fee\u4e00\u4e0b src/app.tsx \u8fd9\u4e2a bug'), true);
  assert.equal(detectTaskAuthorizedProjectWriteIntent('\u628a\u8fd9\u7bc7\u6587\u6863\u91cd\u5199\u5f97\u66f4\u6e05\u695a\u4e00\u70b9'), true);
  assert.equal(detectTaskAuthorizedProjectWriteIntent('\u6574\u7406\u4e00\u4e0b README \u7684\u7ed3\u6784'), true);
  assert.equal(detectTaskAuthorizedProjectWriteIntent('\u4e3a\u4ec0\u4e48\u8fd9\u4e2a\u6587\u4ef6\u4f1a\u62a5\u9519\uff1f'), false);
  assert.equal(detectTaskAuthorizedProjectWriteIntent('\u5e2e\u6211\u770b\u770b docs \u76ee\u5f55\u91cc\u6709\u4ec0\u4e48'), false);
});

test('project file operations resolve request kind and explicit review-first prompts', async () => {
  const { resolveProjectFileRequestKind, shouldForceProjectFileProposal } = await loadModule();

  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u8bfb\u53d6 docs/prd.md \u5185\u5bb9',
      cleanedInput: '\u8bfb\u53d6 docs/prd.md \u5185\u5bb9',
    }),
    'read'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u8bf7\u628a\u9700\u6c42\u6587\u6863\u4fdd\u5b58\u5230 docs/prd.md',
      cleanedInput: '\u8bf7\u628a\u9700\u6c42\u6587\u6863\u4fdd\u5b58\u5230 docs/prd.md',
    }),
    'write'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u5199\u4e00\u4e2a\u9700\u6c42\u6587\u6863\u5173\u4e8e\u52a8\u6f2bapp\u7684',
      cleanedInput: '\u5199\u4e00\u4e2a\u9700\u6c42\u6587\u6863\u5173\u4e8e\u52a8\u6f2bapp\u7684',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u7ed9\u6211\u4e00\u4efd PRD\uff0c\u5148\u76f4\u63a5\u8f93\u51fa\u5728\u804a\u5929\u91cc',
      cleanedInput: '\u7ed9\u6211\u4e00\u4efd PRD\uff0c\u5148\u76f4\u63a5\u8f93\u51fa\u5728\u804a\u5929\u91cc',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u7ed9\u6211\u4e00\u4e2a\u52a8\u6f2b app \u9996\u9875\u8349\u56fe',
      cleanedInput: '\u7ed9\u6211\u4e00\u4e2a\u52a8\u6f2b app \u9996\u9875\u8349\u56fe',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u5e2e\u6211\u505a\u4e00\u4e0b\u8fd9\u4e2a\u9875\u9762\u7684 UI \u65b9\u5411',
      cleanedInput: '\u5e2e\u6211\u505a\u4e00\u4e0b\u8fd9\u4e2a\u9875\u9762\u7684 UI \u65b9\u5411',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4fee\u6539 src/App.tsx \u652f\u6301\u62d6\u62fd\u4e0a\u4f20',
      cleanedInput: '\u4fee\u6539 src/App.tsx \u652f\u6301\u62d6\u62fd\u4e0a\u4f20',
    }),
    'write'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u5e2e\u6211\u4fee\u4e00\u4e0b src/App.tsx \u8fd9\u4e2a bug',
      cleanedInput: '\u5e2e\u6211\u4fee\u4e00\u4e0b src/App.tsx \u8fd9\u4e2a bug',
    }),
    'write'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4f18\u5316\u767b\u5f55\u9875\u4ee3\u7801',
      cleanedInput: '\u4f18\u5316\u767b\u5f55\u9875\u4ee3\u7801',
    }),
    'write'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4e3a\u4ec0\u4e48 login \u9875\u9762\u4f1a\u62a5\u9519\uff1f',
      cleanedInput: '\u4e3a\u4ec0\u4e48 login \u9875\u9762\u4f1a\u62a5\u9519\uff1f',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4e3a\u4ec0\u4e48\u4fdd\u5b58\u4e0d\u4e86',
      cleanedInput: '\u4e3a\u4ec0\u4e48\u4fdd\u5b58\u4e0d\u4e86',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4e3a\u4ec0\u4e48\u4fdd\u5b58\u4e0d\u4e86 PRD.md',
      cleanedInput: '\u4e3a\u4ec0\u4e48\u4fdd\u5b58\u4e0d\u4e86 PRD.md',
    }),
    'none'
  );
  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u4fdd\u5b58\u5230\u6839\u76ee\u5f55',
      cleanedInput: '\u4fdd\u5b58\u5230\u6839\u76ee\u5f55',
    }),
    'write'
  );

  assert.equal(shouldForceProjectFileProposal('\u5148\u7ed9\u6211\u770b\u4e00\u4e0b\u8981\u600e\u4e48\u5199\uff0c\u518d\u786e\u8ba4'), true);
  assert.equal(shouldForceProjectFileProposal('\u4e0d\u8981\u76f4\u63a5\u5199\uff0c\u5148\u786e\u8ba4'), true);
  assert.equal(shouldForceProjectFileProposal('\u8bf7\u76f4\u63a5\u4fdd\u5b58\u5230 docs/prd.md'), false);
});

test('project file operations route filename replies after save prompts to write flow', async () => {
  const { resolveProjectFileRequestKind } = await loadModule();
  const conversationHistory = [
    {
      role: 'assistant',
      content:
        '\u6211\u5df2\u7ecf\u751f\u6210\u4e86\u9700\u6c42\u6587\u6863\u5ba1\u67e5\u610f\u89c1\uff0c\u8981\u4fdd\u5b58\u5230\u9879\u76ee\u6839\u76ee\u5f55\u5417\uff1f\u8bf7\u544a\u8bc9\u6211\u6587\u4ef6\u540d\u3002',
    },
  ];

  assert.equal(
    resolveProjectFileRequestKind({
      rawInput: '\u9700\u6c42\u6587\u6863\u5ba1\u67e5\u610f\u89c1.md',
      cleanedInput: '\u9700\u6c42\u6587\u6863\u5ba1\u67e5\u610f\u89c1.md',
      conversationHistory,
    }),
    'write'
  );
  for (const filename of ['build.py', 'server.go', 'main.rs', 'query.sql', 'config.toml']) {
    assert.equal(
      resolveProjectFileRequestKind({
        rawInput: filename,
        cleanedInput: filename,
        conversationHistory,
      }),
      'write'
    );
  }
});

test('project file operations recognize short replies to pending file proposals', async () => {
  const {
    findLatestPendingProjectFileProposalAction,
    isShortPendingActionAffirmation,
    isShortPendingActionRejection,
  } = await loadModule();
  const pendingProposal = {
    id: 'proposal-1',
    mode: 'manual',
    status: 'pending',
    summary: 'save draft',
    assistantMessage: 'Ready to save.',
    operations: [
      {
        id: 'create_file:docs/spec.md:0',
        type: 'create_file',
        targetPath: 'docs/spec.md',
        summary: 'create spec',
        content: '# Spec',
      },
    ],
  };

  assert.equal(isShortPendingActionAffirmation('\u597d'), true);
  assert.equal(isShortPendingActionAffirmation('\u53ef\u4ee5'), true);
  assert.equal(isShortPendingActionAffirmation('OK'), true);
  assert.equal(isShortPendingActionAffirmation('\u597d\uff0c\u4f46\u662f\u5148\u522b\u5199'), false);
  assert.equal(isShortPendingActionRejection('\u4e0d\u7528'), true);
  assert.equal(isShortPendingActionRejection('cancel'), true);
  assert.deepEqual(
    findLatestPendingProjectFileProposalAction([
      { id: 'message-1', projectFileProposal: { ...pendingProposal, status: 'executed' } },
      { id: 'message-2', projectFileProposal: pendingProposal },
    ]),
    {
      messageId: 'message-2',
      proposal: pendingProposal,
    }
  );
  assert.equal(
    findLatestPendingProjectFileProposalAction([
      { id: 'message-1', projectFileProposal: { ...pendingProposal, status: 'cancelled' } },
    ]),
    null
  );
});

test('project file operations reject paths outside the project root', async () => {
  const { resolveProjectOperationPath } = await loadModule();

  assert.equal(
    resolveProjectOperationPath('C:\\repo\\demo', 'docs\\prd.md'),
    'C:\\repo\\demo\\docs\\prd.md'
  );
  assert.equal(
    resolveProjectOperationPath('C:\\repo\\demo', 'C:\\repo\\demo\\notes\\todo.md'),
    'C:\\repo\\demo\\notes\\todo.md'
  );
  assert.throws(() => resolveProjectOperationPath('C:\\repo\\demo', '..\\secret.txt'));
  assert.throws(() => resolveProjectOperationPath('C:\\repo\\demo', 'C:\\other\\secret.txt'));
});

test('project file operations parse structured plans from raw JSON or fenced JSON blocks', async () => {
  const { parseProjectFileOperationsPlan } = await loadModule();

  assert.equal(
    parseProjectFileOperationsPlan(
      '{"status":"ready","assistantMessage":"ok","summary":"create spec","operations":[{"type":"create_file","targetPath":"docs/spec.md","summary":"create spec","content":"# Spec"}]}'
    ).operations[0].targetPath,
    'docs/spec.md'
  );

  assert.equal(
    parseProjectFileOperationsPlan(
      '```json\n{"status":"needs_clarification","assistantMessage":"\u8bf7\u786e\u8ba4\u5177\u4f53\u8def\u5f84","summary":"","operations":[]}\n```'
    ).status,
    'needs_clarification'
  );
});

test('project file operations recognize write access failures that should become recovery proposals', async () => {
  const { isProjectFileWriteAccessFailure } = await loadModule();

  assert.equal(isProjectFileWriteAccessFailure('Access is denied. (os error 5)'), true);
  assert.equal(isProjectFileWriteAccessFailure('Write error: Permission denied'), true);
  assert.equal(isProjectFileWriteAccessFailure('\u62d2\u7edd\u8bbf\u95ee'), true);
  assert.equal(
    isProjectFileWriteAccessFailure('The process cannot access the file because it is being used by another process.'),
    true
  );
  assert.equal(isProjectFileWriteAccessFailure('File not found'), false);
  assert.equal(isProjectFileWriteAccessFailure('old_string not found in file'), false);
});

test('project file operations rebuild retryable operations from failed write and edit tool calls', async () => {
  const { buildProjectFileOperationFromToolCall } = await loadModule();

  assert.deepEqual(
    buildProjectFileOperationFromToolCall({
      toolName: 'write',
      toolInput: {
        file_path: 'docs/spec.md',
        content: '# Spec',
      },
      fileExists: false,
    }),
    {
      id: 'create_file:docs/spec.md:0',
      type: 'create_file',
      targetPath: 'docs/spec.md',
      summary: '创建 docs/spec.md',
      content: '# Spec',
    }
  );

  assert.deepEqual(
    buildProjectFileOperationFromToolCall({
      toolName: 'write',
      toolInput: {
        file_path: 'docs/spec.md',
        content: '# Updated spec',
      },
      fileExists: true,
    }),
    {
      id: 'edit_file:docs/spec.md:0',
      type: 'edit_file',
      targetPath: 'docs/spec.md',
      summary: '写入 docs/spec.md',
      content: '# Updated spec',
    }
  );

  assert.deepEqual(
    buildProjectFileOperationFromToolCall({
      toolName: 'edit',
      toolInput: {
        file_path: 'src/App.tsx',
        old_string: 'foo()',
        new_string: 'bar()',
      },
    }),
    {
      id: 'edit_file:src/App.tsx:0',
      type: 'edit_file',
      targetPath: 'src/App.tsx',
      summary: '编辑 src/App.tsx',
      oldString: 'foo()',
      newString: 'bar()',
    }
  );

  assert.equal(
    buildProjectFileOperationFromToolCall({
      toolName: 'write',
      toolInput: {
        content: '# Missing path',
      },
    }),
    null
  );
});
