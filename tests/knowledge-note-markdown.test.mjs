import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../src/features/knowledge/workspace/knowledgeNoteMarkdown.ts');

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

test('extractKnowledgeNoteEditorBody removes a duplicated leading H1 title', async () => {
  const { extractKnowledgeNoteEditorBody } = await loadModule();

  assert.equal(extractKnowledgeNoteEditorBody('项目总览', '# 项目总览\n\n这里是正文。'), '这里是正文。');
});

test('extractKnowledgeNoteEditorBody keeps the markdown when the first heading is not the note title', async () => {
  const { extractKnowledgeNoteEditorBody } = await loadModule();

  assert.equal(extractKnowledgeNoteEditorBody('项目总览', '# 另一段标题\n\n这里是正文。'), '# 另一段标题\n\n这里是正文。');
});

test('serializeKnowledgeNoteMarkdown writes a single canonical title heading', async () => {
  const { serializeKnowledgeNoteMarkdown } = await loadModule();

  assert.equal(serializeKnowledgeNoteMarkdown('项目总览', '这里是正文。'), '# 项目总览\n\n这里是正文。');
});

test('serializeKnowledgeNoteMarkdown does not duplicate an existing matching title heading', async () => {
  const { serializeKnowledgeNoteMarkdown } = await loadModule();

  assert.equal(serializeKnowledgeNoteMarkdown('项目总览', '# 项目总览\n\n这里是正文。'), '# 项目总览\n\n这里是正文。');
});
