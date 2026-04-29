import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge note workspace shows database and markdown mirror state without file-first wording', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /mirrorSourcePath\?: string \| null/);
  assert.match(source, /数据库笔记/);
  assert.match(source, /Markdown 镜像/);
  assert.match(source, /导入 Markdown 到知识库/);
  assert.match(source, /保存到知识库/);
  assert.match(source, /删除笔记/);
  assert.doesNotMatch(source, /删除文件/);
});
