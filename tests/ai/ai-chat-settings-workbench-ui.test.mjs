import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const appCssPath = path.resolve(__dirname, '../../src/App.css');

test('global settings page uses the workbench shell vocabulary as a top-level surface', async () => {
  const [appSource, pageSource, css] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(globalSettingsPagePath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(appSource, /GlobalSettingsPage/);
  assert.match(pageSource, /global-settings-page/);
  assert.match(pageSource, /chat-settings-workbench-shell/);
  assert.match(pageSource, /chat-settings-workbench-stage/);
  assert.match(pageSource, /SettingsSidebar/);
  assert.match(pageSource, /SettingsSection/);
  assert.match(pageSource, /SettingsPlaceholderPanel/);
  assert.match(pageSource, /chat-settings-back/);
  assert.match(pageSource, /chat-settings-header-copy/);
  assert.match(css, /\.chat-settings-workbench-shell\s*\{/);
  assert.match(css, /\.chat-settings-workbench-sidebar\s*\{/);
  assert.match(css, /\.chat-settings-workbench-stage\s*\{/);
  assert.match(css, /\.global-settings-page\s*\{/);
  assert.match(css, /\.global-settings-page-body\s*\{/);
  assert.match(css, /\.chat-settings-eyebrow,\s*\.chat-settings-summary-label\s*\{[^}]*display:\s*block;/s);
  assert.doesNotMatch(pageSource, /chat-settings-drawer-embedded/);
  assert.doesNotMatch(css, /\.chat-settings-workbench-companion\s*\{/);
  assert.match(css, /\.chat-settings-workbench-shell\s*\{[^}]*grid-template-columns:\s*168px minmax\(0, 1fr\);/s);
});

test('desktop settings state is routed through App as a global page instead of an ai pane overlay', async () => {
  const [appSource, chatSource, appCss] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
    readFile(appCssPath, 'utf8'),
  ]);

  assert.match(appSource, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(appSource, /setActiveGlobalSettingsTab\(resolveSettingsTabId\(detail\.tab\)\)/);
  assert.match(appSource, /setIsGlobalSettingsOpen\(true\)/);
  assert.match(appSource, /isGlobalSettingsOpen\s*\?\s*\(/);
  assert.match(appSource, /const desktopInspector\s*=\s*!isGlobalSettingsOpen/);
  assert.match(chatSource, /dispatchEvent\([\s\S]*?new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
  assert.doesNotMatch(chatSource, /chat-settings-drawer-embedded/);
  assert.doesNotMatch(chatSource, /setIsSettingsOpen\(true\)/);
  assert.doesNotMatch(appCss, /ai-chat-settings-overlay-open/);
});
