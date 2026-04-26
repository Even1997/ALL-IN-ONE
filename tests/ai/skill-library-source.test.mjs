import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const libPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src-tauri/src/lib.rs');

test('tauri owns a GoodNight skill root and exposes discovery plus import commands', async () => {
  const source = await readFile(libPath, 'utf8');

  assert.match(source, /goodnight/i);
  assert.match(source, /fn\s+discover_local_skills/);
  assert.match(source, /fn\s+import_local_skill/);
  assert.match(source, /fn\s+import_github_skill/);
  assert.match(source, /fn\s+sync_skill_to_runtime/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*discover_local_skills/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*import_local_skill/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*import_github_skill/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*sync_skill_to_runtime/);
});
