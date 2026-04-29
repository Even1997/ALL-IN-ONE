import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadModule = async (relativePath) => {
  const modulePath = path.resolve(__dirname, `../src/${relativePath}`);
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

test('knowledge operation policy keeps AI read-only before approval', async () => {
  const { buildKnowledgeOperationPolicy } = await loadModule('modules/ai/knowledge/knowledgeOperationPolicy.ts');
  const policy = buildKnowledgeOperationPolicy();

  assert.match(policy, /默认只读/);
  assert.match(policy, /用户批准/);
  assert.match(policy, /不能直接删除/);
});
