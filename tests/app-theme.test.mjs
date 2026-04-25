import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_STYLE_STORAGE_KEY,
  APP_STYLE_OPTIONS,
  getInitialAppStyle,
  isAppStyle,
} from '../src/appTheme.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');

test('app style options expose minimal and cartoon choices', () => {
  assert.deepEqual(
    APP_STYLE_OPTIONS.map((option) => option.id),
    ['minimal', 'cartoon']
  );
  assert.deepEqual(
    APP_STYLE_OPTIONS.map((option) => option.label),
    ['简约', '卡通']
  );
});

test('app style helpers validate and fall back to minimal', () => {
  assert.equal(APP_STYLE_STORAGE_KEY, 'devflow-app-style');
  assert.equal(isAppStyle('cartoon'), true);
  assert.equal(isAppStyle('unknown'), false);
  assert.equal(getInitialAppStyle(() => 'cartoon'), 'cartoon');
  assert.equal(getInitialAppStyle(() => 'unknown'), 'minimal');
  assert.equal(getInitialAppStyle(() => null), 'minimal');
});

test('theme mode toggle uses light and dark labels', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /themeMode === 'dark' \? '浅色' : '深色'/);
  assert.doesNotMatch(source, /夜间/);
});
