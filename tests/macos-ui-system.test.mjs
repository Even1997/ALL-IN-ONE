import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, '../package.json');
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const projectSetupPath = path.resolve(__dirname, '../src/components/project/ProjectSetup.tsx');
const uiIndexPath = path.resolve(__dirname, '../src/components/ui/index.ts');
const macButtonPath = path.resolve(__dirname, '../src/components/ui/MacButton.tsx');
const macPanelPath = path.resolve(__dirname, '../src/components/ui/MacPanel.tsx');
const macFieldPath = path.resolve(__dirname, '../src/components/ui/MacField.tsx');
const macDialogPath = path.resolve(__dirname, '../src/components/ui/MacDialog.tsx');

test('macOS UI system is wired into the desktop shell and project manager', async () => {
  const [
    packageJson,
    appSource,
    appCss,
    projectSetupSource,
    uiIndexSource,
    macButtonSource,
    macPanelSource,
    macFieldSource,
    macDialogSource,
  ] = await Promise.all([
    readFile(packageJsonPath, 'utf8'),
    readFile(appPath, 'utf8'),
    readFile(appCssPath, 'utf8'),
    readFile(projectSetupPath, 'utf8'),
    readFile(uiIndexPath, 'utf8'),
    readFile(macButtonPath, 'utf8'),
    readFile(macPanelPath, 'utf8'),
    readFile(macFieldPath, 'utf8'),
    readFile(macDialogPath, 'utf8'),
  ]);

  assert.match(packageJson, /"@radix-ui\/react-dialog"/);
  assert.match(packageJson, /"@radix-ui\/react-dropdown-menu"/);
  assert.match(packageJson, /"@radix-ui\/react-tooltip"/);

  assert.match(uiIndexSource, /export \* from '\.\/MacButton';/);
  assert.match(uiIndexSource, /export \* from '\.\/MacPanel';/);
  assert.match(uiIndexSource, /export \* from '\.\/MacField';/);
  assert.match(uiIndexSource, /export \* from '\.\/MacDialog';/);

  assert.match(macButtonSource, /export const MacButton/);
  assert.match(macButtonSource, /export const MacIconButton/);
  assert.match(macPanelSource, /export const MacPanel/);
  assert.match(macFieldSource, /export const MacField/);
  assert.match(macDialogSource, /from '@radix-ui\/react-dialog'/);
  assert.match(macDialogSource, /export const MacDialog/);

  assert.match(appSource, /MacIconButton/);
  assert.match(appSource, /MacSelectField/);
  assert.match(appSource, /desktop-primary-rail mac-sidebar-panel/);
  assert.match(appSource, /desktop-workbench-topbar mac-toolbar mac-panel/);

  assert.match(projectSetupSource, /MacButton/);
  assert.match(projectSetupSource, /MacPanel/);
  assert.match(projectSetupSource, /MacField/);

  assert.match(appCss, /--macos-window-bg:/);
  assert.match(appCss, /--macos-panel-bg:/);
  assert.match(appCss, /--role-knowledge-accent:/);
  assert.match(appCss, /\.mac-button\s*\{/);
  assert.match(appCss, /\.mac-panel\s*\{/);
  assert.match(appCss, /\.mac-field\s*\{/);
  assert.match(appCss, /\.mac-toolbar\s*\{/);
  assert.match(appCss, /:root\[data-theme='dark'\]\s*\{[\s\S]*?--macos-window-bg:/);
  assert.match(appCss, /:root\[data-theme='light'\]\s*\{[\s\S]*?--macos-window-bg:/);
});
