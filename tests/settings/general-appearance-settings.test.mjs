import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const generalPanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/GeneralSettingsPanel.tsx');
const appearancePanelPath = path.resolve(__dirname, '../../src/components/workspace/settings/AppearanceSettingsPanel.tsx');
const generalStorePath = path.resolve(__dirname, '../../src/modules/settings/generalSettingsStore.ts');
const appearanceStorePath = path.resolve(__dirname, '../../src/modules/settings/appearanceSettingsStore.ts');
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('phase 3 settings panels are mounted from the global settings shell', async () => {
  const pageSource = await readFile(globalSettingsPagePath, 'utf8');

  assert.match(pageSource, /from '\.\/settings\/GeneralSettingsPanel'/);
  assert.match(pageSource, /from '\.\/settings\/AppearanceSettingsPanel'/);
  assert.match(pageSource, /case 'general':/);
  assert.match(pageSource, /case 'appearance':/);
  assert.match(pageSource, /<GeneralSettingsPanel/);
  assert.match(pageSource, /<AppearanceSettingsPanel/);
});

test('phase 3 introduces dedicated general and appearance settings stores', async () => {
  await Promise.all([access(generalStorePath), access(appearanceStorePath)]);
  const [generalSource, appearanceSource] = await Promise.all([
    readFile(generalStorePath, 'utf8'),
    readFile(appearanceStorePath, 'utf8'),
  ]);

  assert.match(generalSource, /uiLanguage/);
  assert.match(generalSource, /value: 'system'/);
  assert.doesNotMatch(generalSource, /followSystemLanguage: boolean/);
  assert.match(generalSource, /startupPage/);
  assert.match(generalSource, /restoreLastSessionOnLaunch/);
  assert.match(generalSource, /openRecentWorkspaceOnLaunch/);
  assert.match(generalSource, /autoUpdateEnabled/);
  assert.match(generalSource, /updateChannel/);
  assert.match(generalSource, /newWindowBehavior/);

  assert.match(appearanceSource, /themeMode/);
  assert.match(appearanceSource, /appStyle/);
  assert.match(appearanceSource, /desktopAiPaneWidth/);
  assert.match(appearanceSource, /desktopAiPaneCollapsedByDefault/);
  assert.match(appearanceSource, /readingWidth/);
  assert.match(appearanceSource, /uiDensity/);
  assert.match(appearanceSource, /fontSize/);
  assert.match(appearanceSource, /animationsEnabled/);
  assert.match(appearanceSource, /reducedMotion/);
  assert.match(appearanceSource, /timelineDensity/);
  assert.match(appearanceSource, /showThinkingByDefault/);
  assert.match(appearanceSource, /showToolCardsByDefault/);
  assert.match(appearanceSource, /showFinalAnswerExpandedByDefault/);
});

test('App routes theme, startup, and desktop AI pane behavior through phase 3 settings stores', async () => {
  const appSource = await readFile(appPath, 'utf8');

  assert.match(appSource, /useGeneralSettingsStore/);
  assert.match(appSource, /useAppearanceSettingsStore/);
  assert.match(appSource, /startupPage/);
  assert.match(appSource, /restoreLastSessionOnLaunch/);
  assert.match(appSource, /openRecentWorkspaceOnLaunch/);
  assert.match(appSource, /desktopAiPaneCollapsedByDefault/);
  assert.match(appSource, /setThemeMode/);
  assert.match(appSource, /setDesktopAiPaneWidth/);
  assert.doesNotMatch(appSource, /window\.localStorage\.setItem\(THEME_STORAGE_KEY,\s*themeMode\)/);
});

test('phase 3 panels expose document-style sections for editable and read-only settings', async () => {
  await Promise.all([access(generalPanelPath), access(appearancePanelPath)]);
  const [generalSource, appearanceSource] = await Promise.all([
    readFile(generalPanelPath, 'utf8'),
    readFile(appearancePanelPath, 'utf8'),
  ]);

  assert.match(generalSource, /语言/);
  assert.match(generalSource, /启动/);
  assert.match(generalSource, /更新/);
  assert.match(generalSource, /关于/);
  assert.doesNotMatch(generalSource, /followSystemLanguage/);
  assert.doesNotMatch(generalSource, /Effective language/);

  assert.match(appearanceSource, /主题/);
  assert.match(appearanceSource, /布局/);
  assert.match(appearanceSource, /阅读/);
  assert.match(appearanceSource, /过程显示/);
});
