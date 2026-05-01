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

  assert.equal(detectProjectFileWriteIntent('帮我新建一个 docs/prd.md'), true);
  assert.equal(detectProjectFileWriteIntent('请编辑 src/config.ts 里的标题'), true);
  assert.equal(detectProjectFileWriteIntent('把 obsolete.md 删除掉'), true);
  assert.equal(detectProjectFileWriteIntent('看看 docs 目录里有哪些文件'), false);
});

test('project file operations detect read intent without forcing confirmation flows', async () => {
  const { detectProjectFileReadIntent } = await loadModule();

  assert.equal(detectProjectFileReadIntent('列出 docs 目录下有哪些文件'), true);
  assert.equal(detectProjectFileReadIntent('读取 docs/prd.md 的内容'), true);
  assert.equal(detectProjectFileReadIntent('搜索项目里有没有 login 这个词'), true);
  assert.equal(detectProjectFileReadIntent('帮我新建一个 docs/prd.md'), false);
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
      '```json\n{"status":"needs_clarification","assistantMessage":"请提供路径","summary":"","operations":[]}\n```'
    ).status,
    'needs_clarification'
  );
});
