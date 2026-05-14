import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('desktop rail keeps settings above the theme toggle for agent management entry points', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /dispatchEvent\([\s\S]*?new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /detail:\s*\{\s*tab:\s*'ai'\s*\}/);
  assert.match(
    source,
    /new CustomEvent\(AI_CHAT_SETTINGS_EVENT[\s\S]*?themeMode === 'dark' \? 'Switch to light mode' : 'Switch to dark mode'/
  );
});
