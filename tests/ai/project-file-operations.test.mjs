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

test('project file operations only allow supported text files for write flows', async () => {
  const { isSupportedProjectTextFilePath } = await loadModule();

  assert.equal(isSupportedProjectTextFilePath('docs/spec.md'), true);
  assert.equal(isSupportedProjectTextFilePath('src/app.tsx'), true);
  assert.equal(isSupportedProjectTextFilePath('assets/logo.png'), false);
  assert.equal(isSupportedProjectTextFilePath('docs/archive.pdf'), false);
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
