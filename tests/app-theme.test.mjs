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
const appCssPath = path.resolve(__dirname, '../src/App.css');
const workspaceCssPath = path.resolve(__dirname, '../src/components/workspace/Workspace.css');
const fileExplorerCssPath = path.resolve(__dirname, '../src/components/workspace/FileExplorer.css');
const terminalCssPath = path.resolve(__dirname, '../src/components/workspace/Terminal.css');
const chatCssPath = path.resolve(__dirname, '../src/components/workspace/AIChat.css');

test('app style options expose workbench, minimal, and cartoon choices', () => {
  assert.deepEqual(
    APP_STYLE_OPTIONS.map((option) => option.id),
    ['workbench', 'minimal', 'cartoon']
  );
  assert.deepEqual(
    APP_STYLE_OPTIONS.map((option) => option.label),
    ['蓝白工具', '简约', '卡通']
  );
});

test('app style helpers validate and fall back to workbench', () => {
  assert.equal(APP_STYLE_STORAGE_KEY, 'goodnight-app-style');
  assert.equal(isAppStyle('cartoon'), true);
  assert.equal(isAppStyle('workbench'), true);
  assert.equal(isAppStyle('unknown'), false);
  assert.equal(getInitialAppStyle(() => 'cartoon'), 'cartoon');
  assert.equal(getInitialAppStyle(() => 'unknown'), 'workbench');
  assert.equal(getInitialAppStyle(() => null), 'workbench');
});

test('theme mode toggle uses light and dark labels', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /themeMode === 'dark' \? '切换到浅色模式' : '切换到深色模式'/);
  assert.match(source, /window\.localStorage\.getItem\(THEME_STORAGE_KEY\) === 'dark' \? 'dark' : 'light'/);
  assert.doesNotMatch(source, /夜间/);
});

test('workbench refresh theme uses a colder blue system with tighter shared radii', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /--style-radius-xs:\s*8px;/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--mode-surface:\s*#10151b;/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--mode-button:\s*rgba\(255,\s*255,\s*255,\s*0\.92\);/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--mode-accent:\s*#8be9d6;/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--style-radius-sm:\s*10px;/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--style-radius-md:\s*14px;/);
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--style-radius-lg:\s*18px;/);
  assert.match(css, /:root\[data-theme='light'\][\s\S]*?--mode-surface:\s*#edf2f8;/);
  assert.match(css, /:root\[data-theme='light'\][\s\S]*?--mode-button:\s*#111318;/);
  assert.match(css, /:root\[data-theme='light'\][\s\S]*?--mode-accent:\s*#0f766e;/);
});

test('workspace, explorer, terminal, and chat consume shared radius tokens', async () => {
  const [workspaceCss, fileExplorerCss, terminalCss, chatCss] = await Promise.all([
    readFile(workspaceCssPath, 'utf8'),
    readFile(fileExplorerCssPath, 'utf8'),
    readFile(terminalCssPath, 'utf8'),
    readFile(chatCssPath, 'utf8'),
  ]);

  assert.match(workspaceCss, /border-radius:\s*var\(--style-radius-lg\);/);
  assert.match(workspaceCss, /border-radius:\s*var\(--style-radius-sm\);/);
  assert.match(fileExplorerCss, /border-radius:\s*var\(--style-radius-md\);/);
  assert.match(terminalCss, /border-radius:\s*var\(--style-radius-sm\);/);
  assert.match(chatCss, /border-radius:\s*var\(--style-radius-lg\);/);
  assert.match(chatCss, /border-radius:\s*var\(--style-radius-md\);/);
});
