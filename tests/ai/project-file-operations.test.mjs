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

test('project file operations no longer export natural-language intent routers', async () => {
  const module = await loadModule();

  assert.equal('detectProjectFileWriteIntent' in module, false);
  assert.equal('detectProjectFileReadIntent' in module, false);
  assert.equal('detectTaskAuthorizedProjectWriteIntent' in module, false);
  assert.equal('resolveProjectFileRequestKind' in module, false);
  assert.equal('shouldForceProjectFileProposal' in module, false);
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
