import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project manager forms center the create panels horizontally', async () => {
  const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.project-manager-form\s*\{[^}]*width:\s*min\(760px,\s*100%\);[^}]*margin-inline:\s*auto;/s
  );
});
