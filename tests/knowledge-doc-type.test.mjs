import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../src/features/knowledge/model/knowledgeDocType.ts');

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

test('inferKnowledgeDocType recognizes generated wiki and summary filenames', async () => {
  const { inferKnowledgeDocType } = await loadModule();

  assert.equal(inferKnowledgeDocType('project-overview.md'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('feature-inventory.md'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('page-inventory.md'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('terminology.md'), 'ai-summary');
  assert.equal(inferKnowledgeDocType('open-questions.md'), 'ai-summary');
});

test('inferKnowledgeDocType recognizes bare wiki headings without markdown extensions', async () => {
  const { inferKnowledgeDocType } = await loadModule();

  assert.equal(inferKnowledgeDocType('project overview'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('feature inventory'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('page inventory'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('\u9879\u76ee\u6982\u89c8'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('\u529f\u80fd\u6e05\u5355'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('\u9875\u9762\u6e05\u5355'), 'wiki-index');
  assert.equal(inferKnowledgeDocType('\u5f00\u653e\u95ee\u9898'), 'ai-summary');
  assert.equal(inferKnowledgeDocType('\u672f\u8bed\u8868'), 'ai-summary');
});
