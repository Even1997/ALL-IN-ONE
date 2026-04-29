import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge note workspace shows storage state without file-first wording', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /mirrorSourcePath\?: string \| null/);
  assert.match(source, /Markdown 镜像/);
  assert.match(source, /未绑定 Markdown/);
  assert.match(source, /保存到知识库/);
  assert.match(source, /删除笔记/);
  assert.doesNotMatch(source, /删除文件/);
});

test('knowledge note workspace surfaces reading and code mode labels in the editor chrome', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /阅读/);
  assert.match(source, /代码/);
  assert.match(source, /gn-note-mode-toggle/);
  assert.match(source, /gn-note-reading-surface/);
});
