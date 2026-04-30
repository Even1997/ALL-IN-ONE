import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../src/features/knowledge/workspace/knowledgeNoteFilePaths.ts');

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

test('knowledge note file paths default to a markdown file in the project root', async () => {
  const { buildKnowledgeNoteRootMirrorPath } = await loadModule();

  assert.equal(
    buildKnowledgeNoteRootMirrorPath('C:\\Vault\\Project', 'AI 对话结论'),
    'C:\\Vault\\Project\\AI 对话结论.md'
  );
});

test('knowledge note file paths sanitize invalid characters and append a numeric suffix when needed', async () => {
  const { buildKnowledgeNoteRootMirrorPath } = await loadModule();

  assert.equal(
    buildKnowledgeNoteRootMirrorPath('/vault/project', '需求: 登录/注册?', 3),
    '/vault/project/需求- 登录-注册-3.md'
  );
});
