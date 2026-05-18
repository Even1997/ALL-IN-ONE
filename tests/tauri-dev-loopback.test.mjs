import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('tauri dev uses explicit IPv4 loopback instead of localhost', async () => {
  const tauriConfig = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');

  assert.equal(tauriConfig.build.devUrl, 'http://127.0.0.1:1420');
  assert.match(viteConfig, /host:\s*host\s*\|\|\s*["']127\.0\.0\.1["']/);
});
