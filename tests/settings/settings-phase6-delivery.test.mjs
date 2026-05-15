import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storagePanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/StorageSettingsPanel.tsx');
const advancedPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/AdvancedSettingsPanel.tsx');
const docsIndexPath = path.resolve(__dirname, '../../docs/settings/index.md');
const phase6DocPath = path.resolve(__dirname, '../../docs/settings/12-phase-6-delivery-status.md');

test('phase 6 keeps runtime-backed reset actions explicit in storage and advanced panels', async () => {
  const [storageSource, advancedSource] = await Promise.all([
    readFile(storagePanelPath, 'utf8'),
    readFile(advancedPanelPath, 'utf8'),
  ]);

  assert.match(storageSource, /SettingsDangerAction/);
  assert.match(storageSource, /handleResetRootPath/);
  assert.match(storageSource, /actionLabel=/);

  assert.match(advancedSource, /SettingsDangerAction/);
  assert.match(advancedSource, /handleResetBindings/);
  assert.match(advancedSource, /clearClaudeConfigId/);
  assert.match(advancedSource, /clearCodexConfigId/);
});

test('phase 6 keeps explicit status-note messaging for browser preview and runtime-backed saves', async () => {
  const [storageSource, advancedSource] = await Promise.all([
    readFile(storagePanelPath, 'utf8'),
    readFile(advancedPanelPath, 'utf8'),
  ]);

  assert.match(storageSource, /chat-settings-status-note/);
  assert.match(storageSource, /desktopRuntimeAvailable/);

  assert.match(advancedSource, /chat-settings-status-note/);
  assert.match(advancedSource, /desktopRuntimeAvailable/);
  assert.match(advancedSource, /Sidecar/);
});

test('phase 6 delivery status is documented from the settings docs index', async () => {
  const [indexSource, phase6Source] = await Promise.all([
    readFile(docsIndexPath, 'utf8'),
    readFile(phase6DocPath, 'utf8'),
  ]);

  assert.match(indexSource, /12-phase-6-delivery-status\.md/);
  assert.match(phase6Source, /阶段 6/);
  assert.match(phase6Source, /General \/ AI \/ Permissions \/ MCP \/ Skills \/ Appearance \/ Storage \/ Advanced/);
});
