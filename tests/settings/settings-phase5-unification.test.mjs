import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsFieldRowPath = path.resolve(__dirname, '../../src/components/workspace/settings/SettingsFieldRow.tsx');
const settingsReadonlyCardPath = path.resolve(__dirname, '../../src/components/workspace/settings/SettingsReadonlyCard.tsx');
const settingsDangerActionPath = path.resolve(__dirname, '../../src/components/workspace/settings/SettingsDangerAction.tsx');
const generalPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/GeneralSettingsPanel.tsx');
const appearancePanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/AppearanceSettingsPanel.tsx');
const permissionsPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/PermissionsSettingsPanel.tsx');
const storagePanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/StorageSettingsPanel.tsx');
const advancedPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/AdvancedSettingsPanel.tsx');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('phase 5 adds shared settings primitives for fields, readonly cards, and danger actions', async () => {
  await Promise.all([
    access(settingsFieldRowPath),
    access(settingsReadonlyCardPath),
    access(settingsDangerActionPath),
  ]);

  const [fieldRowSource, readonlyCardSource, dangerActionSource] = await Promise.all([
    readFile(settingsFieldRowPath, 'utf8'),
    readFile(settingsReadonlyCardPath, 'utf8'),
    readFile(settingsDangerActionPath, 'utf8'),
  ]);

  assert.match(fieldRowSource, /export const SettingsFieldRow/);
  assert.match(readonlyCardSource, /export const SettingsReadonlyCard/);
  assert.match(dangerActionSource, /export const SettingsDangerAction/);
});

test('phase 5 moves general and appearance panels onto shared field and readonly primitives', async () => {
  const [generalSource, appearanceSource] = await Promise.all([
    readFile(generalPanelPath, 'utf8'),
    readFile(appearancePanelPath, 'utf8'),
  ]);

  assert.match(generalSource, /SettingsFieldRow/);
  assert.match(generalSource, /SettingsReadonlyCard/);

  assert.match(appearanceSource, /SettingsFieldRow/);
  assert.match(appearanceSource, /SettingsReadonlyCard/);
});

test('phase 5 moves runtime-backed panels onto shared readonly and danger action primitives', async () => {
  const [permissionsSource, storageSource, advancedSource] = await Promise.all([
    readFile(permissionsPanelPath, 'utf8'),
    readFile(storagePanelPath, 'utf8'),
    readFile(advancedPanelPath, 'utf8'),
  ]);

  assert.match(permissionsSource, /SettingsFieldRow/);
  assert.match(permissionsSource, /SettingsReadonlyCard/);

  assert.match(storageSource, /SettingsReadonlyCard/);
  assert.match(storageSource, /SettingsDangerAction/);

  assert.match(advancedSource, /SettingsReadonlyCard/);
  assert.match(advancedSource, /SettingsDangerAction/);
});

test('phase 5 extends settings styling for readonly, status, and danger action states', async () => {
  const cssSource = await readFile(aiChatCssPath, 'utf8');

  assert.match(cssSource, /\.chat-settings-readonly-card/);
  assert.match(cssSource, /\.chat-settings-status-note/);
  assert.match(cssSource, /\.chat-settings-danger-action/);
});
