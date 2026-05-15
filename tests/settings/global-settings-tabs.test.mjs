import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsSharedPath = path.resolve(__dirname, '../../src/components/workspace/globalSettingsPageShared.ts');
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');

test('settings IA is locked to the final 8 top-level modules', async () => {
  const sharedSource = await readFile(settingsSharedPath, 'utf8');

  assert.match(sharedSource, /id:\s*'general'/);
  assert.match(sharedSource, /id:\s*'ai'/);
  assert.match(sharedSource, /id:\s*'permissions'/);
  assert.match(sharedSource, /id:\s*'mcp'/);
  assert.match(sharedSource, /id:\s*'skills'/);
  assert.match(sharedSource, /id:\s*'appearance'/);
  assert.match(sharedSource, /id:\s*'storage'/);
  assert.match(sharedSource, /id:\s*'advanced'/);

  assert.doesNotMatch(sharedSource, /id:\s*'adapters'/);
  assert.doesNotMatch(sharedSource, /id:\s*'terminal'/);
  assert.doesNotMatch(sharedSource, /id:\s*'agents'/);
  assert.doesNotMatch(sharedSource, /id:\s*'plugins'/);
  assert.doesNotMatch(sharedSource, /id:\s*'computerUse'/);
  assert.doesNotMatch(sharedSource, /id:\s*'diagnostics'/);
  assert.doesNotMatch(sharedSource, /id:\s*'about'/);
});

test('legacy settings entry ids are mapped into the new IA instead of falling back blindly', async () => {
  const sharedSource = await readFile(settingsSharedPath, 'utf8');

  assert.match(sharedSource, /const LEGACY_SETTINGS_TAB_ID_MAP/);
  assert.match(sharedSource, /about:\s*'general'/);
  assert.match(sharedSource, /adapters:\s*'advanced'/);
  assert.match(sharedSource, /terminal:\s*'advanced'/);
  assert.match(sharedSource, /agents:\s*'advanced'/);
  assert.match(sharedSource, /plugins:\s*'advanced'/);
  assert.match(sharedSource, /computerUse:\s*'advanced'/);
  assert.match(sharedSource, /diagnostics:\s*'advanced'/);
  assert.doesNotMatch(sharedSource, /\?\s*\(tab as SettingsTabId\)\s*:\s*SETTINGS_TABS\[0\]\.id/);
});

test('global settings page is refactored into shell components', async () => {
  const pageSource = await readFile(globalSettingsPagePath, 'utf8');

  assert.match(pageSource, /from '\.\/settings\/SettingsSidebar'/);
  assert.match(pageSource, /from '\.\/settings\/SettingsSection'/);
  assert.match(pageSource, /from '\.\/settings\/SettingsPlaceholderPanel'/);
  assert.match(pageSource, /<SettingsSidebar/);
  assert.match(pageSource, /<SettingsPlaceholderPanel/);
  assert.doesNotMatch(pageSource, /renderSettingsPlaceholder/);
});
