import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const permissionsPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/PermissionsSettingsPanel.tsx');
const storagePanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/StorageSettingsPanel.tsx');
const advancedPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/AdvancedSettingsPanel.tsx');

test('phase 4 mounts permissions, storage, and advanced settings panels from the global settings shell', async () => {
  const pageSource = await readFile(globalSettingsPagePath, 'utf8');

  assert.match(pageSource, /from '\.\/settings\/PermissionsSettingsPanel'/);
  assert.match(pageSource, /from '\.\/settings\/StorageSettingsPanel'/);
  assert.match(pageSource, /from '\.\/settings\/AdvancedSettingsPanel'/);
  assert.match(pageSource, /case 'permissions':/);
  assert.match(pageSource, /case 'storage':/);
  assert.match(pageSource, /case 'advanced':/);
  assert.match(pageSource, /<PermissionsSettingsPanel/);
  assert.match(pageSource, /<StorageSettingsPanel/);
  assert.match(pageSource, /<AdvancedSettingsPanel/);
});

test('phase 4 adds dedicated permissions, storage, and advanced settings panel files', async () => {
  await Promise.all([
    access(permissionsPanelPath),
    access(storagePanelPath),
    access(advancedPanelPath),
  ]);

  const [permissionsSource, storageSource, advancedSource] = await Promise.all([
    readFile(permissionsPanelPath, 'utf8'),
    readFile(storagePanelPath, 'utf8'),
    readFile(advancedPanelPath, 'utf8'),
  ]);

  assert.match(permissionsSource, /permissionMode/);
  assert.match(permissionsSource, /sandboxPolicy/);
  assert.match(permissionsSource, /autoResumeOnLaunch/);
  assert.match(permissionsSource, /persistResumeDrafts/);

  assert.match(storageSource, /rootPath/);
  assert.match(storageSource, /defaultPath/);
  assert.match(storageSource, /getProjectDir/);
  assert.match(storageSource, /getRequirementsDir/);
  assert.match(storageSource, /isTauriRuntimeAvailable\(\)/);
  assert.match(storageSource, /Default path/);

  assert.match(advancedSource, /providerMode/);
  assert.match(advancedSource, /claudeConfigId/);
  assert.match(advancedSource, /codexConfigId/);
  assert.match(advancedSource, /runtimeSettingsPath/);
  assert.match(advancedSource, /shellSettingsPath/);
  assert.match(advancedSource, /Desktop runtime required/);
});
