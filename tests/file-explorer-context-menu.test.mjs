import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('file explorer context menu actions are wired to real file operations', async () => {
  const source = await readFile(new URL('../src/components/workspace/FileExplorer.tsx', import.meta.url), 'utf8');

  assert.match(source, /context-menu-item/);
  assert.match(source, /invoke(?:<[^>]+>)?\('tool_rename'/);
  assert.match(source, /invoke(?:<[^>]+>)?\('tool_remove'/);
  assert.match(source, /invoke\('open_path_in_shell'/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /在实际目录中打开/);
  assert.match(source, /不能重命名当前项目根目录/);
  assert.match(source, /不能删除当前项目根目录/);
});
