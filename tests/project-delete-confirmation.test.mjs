import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project deletion uses the Tauri dialog API instead of window.confirm', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*confirm,\s*open\s*\}\s+from '@tauri-apps\/plugin-dialog';/);
  assert.match(source, /const confirmed = isTauriRuntimeAvailable\(\)\s*\?\s*await confirm\(/);
  assert.match(source, /: window\.confirm\(`确定删除项目“\$\{targetProject\.name\}”吗？`\);/);
  assert.match(source, /if \(!confirmed\) \{\s*return;\s*\}/s);
});
