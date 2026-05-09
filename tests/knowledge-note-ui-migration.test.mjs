import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge note workspace shows storage state without file-first wording', async () => {
  const noteWorkspaceSource = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');
  const productWorkbenchSource = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');
  const noteDeleteBlock = productWorkbenchSource.slice(
    productWorkbenchSource.indexOf('const deleteDialogDescription = pendingDeleteRequest'),
    productWorkbenchSource.indexOf('const confirmDeleteRequest = useCallback', productWorkbenchSource.indexOf('const deleteDialogDescription = pendingDeleteRequest'))
  );

  assert.match(noteWorkspaceSource, /mirrorSourcePath\?: string \| null/);
  assert.match(productWorkbenchSource, /Markdown 镜像/);
  assert.match(productWorkbenchSource, /已保存到知识库/);
  assert.match(noteDeleteBlock, /pendingDeleteRequest\.type === 'knowledge-note'/);
  assert.match(noteDeleteBlock, /删除笔记/);
  assert.match(noteDeleteBlock, /这只会删除知识库里的笔记；Markdown 镜像文件会保留。/);
});

test('knowledge note workspace surfaces reading and code mode labels in the editor chrome', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /阅读/);
  assert.match(source, /代码/);
  assert.match(source, /gn-note-mode-toggle/);
  assert.match(source, /gn-note-reading-surface/);
});
