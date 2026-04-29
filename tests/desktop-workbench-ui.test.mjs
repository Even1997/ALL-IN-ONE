import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const tauriConfigPath = path.resolve(__dirname, '../src-tauri/tauri.conf.json');
const workspacePath = path.resolve(__dirname, '../src/components/workspace/Workspace.tsx');
const workspaceCssPath = path.resolve(__dirname, '../src/components/workspace/Workspace.css');
const chatCssPath = path.resolve(__dirname, '../src/components/workspace/AIChat.css');
const aiChatPath = path.resolve(__dirname, '../src/components/workspace/AIChat.tsx');
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const appThemePath = path.resolve(__dirname, '../src/appTheme.ts');

test('desktop app shell exposes edge-to-edge workbench classes', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /app-shell-desktop/);
  assert.match(css, /\.app-shell-desktop\s*\{/);
  assert.match(css, /\.app-main-desktop\s*\{/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100dvh;[\s\S]*?min-width:\s*1280px;[\s\S]*?min-height:\s*100dvh;/);
  assert.match(css, /\.app-workbench-row\s*{[\s\S]*?height:\s*calc\(100dvh - var\(--desktop-topbar-height\)\);/);
});

test('workspace exposes horizontal and vertical resize splitters', async () => {
  const source = await readFile(workspacePath, 'utf8');
  const css = await readFile(workspaceCssPath, 'utf8');

  assert.match(source, /from 'allotment'/);
  assert.match(source, /layoutPreferences/);
  assert.match(source, /workspaceSidebarWidth/);
  assert.match(source, /workspaceActivityWidth/);
  assert.match(source, /workspaceTerminalHeight/);
  assert.match(source, /<Allotment/);
  assert.doesNotMatch(source, /handlePaneResizePointerDown/);
  assert.match(css, /\.workspace-allotment\s*\{/);
  assert.match(css, /\.workspace-allotment\s*{[\s\S]*?--sash-size:\s*8px;/);
});

test('ai chat supports docked desktop pane styling', async () => {
  const css = await readFile(chatCssPath, 'utf8');

  assert.match(css, /body\.desktop-workbench-mode \.chat-shell/);
  assert.match(css, /position:\s*relative;/);
  assert.match(css, /width:\s*100%;/);
});

test('collapsed desktop ai pane disappears entirely instead of rendering a compact rail', async () => {
  const appSource = await readFile(appPath, 'utf8');
  const aiChatSource = await readFile(aiChatPath, 'utf8');
  const css = await readFile(chatCssPath, 'utf8');
  const appCss = await readFile(appCssPath, 'utf8');

  assert.match(appSource, /isDesktopAiPaneMounted/);
  assert.match(appSource, /isDesktopAiPaneVisible/);
  assert.doesNotMatch(aiChatSource, /chat-collapsed-rail/);
  assert.doesNotMatch(aiChatSource, /chat-collapsed-lane-btn/);
  assert.doesNotMatch(css, /\.chat-collapsed-rail\s*\{/);
  assert.doesNotMatch(css, /\.chat-collapsed-lane-btn\s*\{/);
  assert.match(appCss, /\.app-workbench-ai-shell\.is-hidden\s*\{/);
  assert.match(appCss, /transition:\s*width 0\.28s ease, min-width 0\.28s ease, opacity 0\.24s ease, transform 0\.28s ease, margin-left 0\.28s ease;/);
});

test('product knowledge view renders opened-file tab strip', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /openKnowledgeTabIds/);
  assert.match(source, /pm-knowledge-open-tabs/);
  assert.match(source, /handleCloseKnowledgeTab/);
  assert.match(source, /setSelectedRequirementId\(tab\.id\)/);
});

test('product workbench renders a real divider between left nav and viewer', async () => {
  const source = await readFile(productPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /layoutPreferences/);
  assert.match(source, /productWorkbenchLeftNavWidth/);
  assert.match(source, /WorkbenchShell/);
  assert.doesNotMatch(source, /pm-left-nav-divider/);
  assert.match(css, /\.pm-workbench-shell-allotment\s*\{/);
  assert.match(css, /\.pm-workbench-shell-allotment\s*{[\s\S]*?width:\s*100%;/);
});

test('product sidebar tabs render a full-height divider between knowledge and page', async () => {
  const source = await readFile(productPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /pm-sidebar-tab-divider/);
  assert.match(css, /\.pm-sidebar-tab-divider\s*\{/);
  assert.match(css, /\.pm-sidebar-tab-divider\s*{[\s\S]*?align-self:\s*stretch;/);
  assert.match(css, /\.pm-sidebar-tab-divider\s*{[\s\S]*?flex:\s*0 0 1px;/);
});

test('right app shell resizer only paints a one pixel line on hover', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /layoutPreferences/);
  assert.match(source, /desktopAiPaneWidth/);
  assert.match(source, /readLayoutSize/);
  assert.match(source, /writeLayoutSize/);
  assert.match(source, /<Allotment className="app-workbench-allotment"/);
  assert.match(css, /\.app-workbench-allotment\s*\{/);
  assert.match(css, /\.app-workbench-allotment\s*{[\s\S]*?--sash-size:\s*8px;/);
  assert.match(css, /\.app-workbench-allotment\s*{[\s\S]*?--sash-hover-size:\s*4px;/);
  assert.match(css, /\.app-ai-activity-pane\s*\{/);
});

test('desktop product knowledge and page panes fill the workbench height', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /\.desktop-active \.pm-viewer-stack > \.pm-card\s*{[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(css, /\.desktop-active \.pm-page-workspace\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.desktop-active \.pm-page-workspace\s*{[\s\S]*?align-items:\s*stretch;/);
  assert.match(css, /\.desktop-active \.pm-wireframe-main,[\s\S]*?\.desktop-active \.pm-wireframe-side\s*{[\s\S]*?height:\s*100%;/);
});

test('desktop workbench disables legacy chat sidebar padding on the main pane', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /body\.desktop-workbench-mode\.ai-chat-sidebar-expanded\s+\.app-main-desktop,[\s\S]*?body\.desktop-workbench-mode\.ai-chat-sidebar-collapsed\s+\.app-main-desktop\s*{[\s\S]*?padding-right:\s*0;/);
});

test('desktop app shell is constrained to the 1280 by 800 design floor', async () => {
  const css = await readFile(appCssPath, 'utf8');
  const config = JSON.parse(await readFile(tauriConfigPath, 'utf8'));
  const [mainWindow] = config.app.windows;

  assert.equal(mainWindow.width, 1280);
  assert.equal(mainWindow.height, 800);
  assert.equal(mainWindow.minWidth, 1280);
  assert.equal(mainWindow.minHeight, 800);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?min-width:\s*1280px;/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?min-height:\s*800px;/);
});

test('desktop workbench has compact 1280px rules that preserve topbar controls', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /@media\s*\(max-width:\s*1280px\)\s*{[\s\S]*?\.desktop-shell-frame\s*{[\s\S]*?grid-template-columns:\s*52px minmax\(0,\s*1fr\);/);
  assert.match(css, /@media\s*\(max-width:\s*1280px\)\s*{[\s\S]*?\.desktop-workbench-tools\s*{[\s\S]*?flex-shrink:\s*0;/);
  assert.match(css, /@media\s*\(max-width:\s*1280px\)\s*{[\s\S]*?\.desktop-project-switcher\.mac-field\s*{[\s\S]*?max-width:\s*180px;/);
  assert.match(css, /@media\s*\(max-width:\s*1280px\)\s*{[\s\S]*?\.desktop-topbar-btn\.icon\s*{[\s\S]*?min-width:\s*32px;/);
});

test('desktop ai pane keeps GN Agent lane tabs inside the 1280px layout', async () => {
  const css = await readFile(chatCssPath, 'utf8');

  assert.match(css, /body\.desktop-workbench-mode\s+\.desktop-ai-shell\s+\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-agent-lane-tabs\s*{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /body\.desktop-workbench-mode\s+\.desktop-ai-shell\s+\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-agent-lane-tabs\s*{[\s\S]*?gap:\s*8px;/);
  assert.match(css, /body\.desktop-workbench-mode\s+\.desktop-ai-shell\s+\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-agent-lane-tabs button\s*{[\s\S]*?font-size:\s*11px;/);
});

test('desktop knowledge filters wrap instead of clipping labels at 1280px', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /\.desktop-active\s+\.pm-knowledge-filter-tabs\s*{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.desktop-active\s+\.pm-knowledge-filter-tabs\s*{[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.desktop-active\s+\.pm-knowledge-filter-tabs button\s*{[\s\S]*?font-size:\s*11px;/);
});

test('desktop knowledge workspace lets ai push all three note columns left', async () => {
  const appSource = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(appSource, /const DESKTOP_AI_PANE_WIDTH_BOUNDS = \{ min: 320, max: 420 \};/);
  assert.match(appSource, /const DEFAULT_DESKTOP_AI_PANE_WIDTH = 360;/);
  assert.match(css, /\.product-workbench-shell\s*{[\s\S]*?container-type:\s*inline-size;/);
  assert.match(css, /\.desktop-workbench-panels\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.desktop-active\s+\.gn-note-workspace\s*{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.gn-note-workspace\s*{[\s\S]*?grid-template-columns:\s*minmax\(190px,\s*0\.72fr\) minmax\(360px,\s*1\.45fr\) minmax\(220px,\s*0\.9fr\);/);
  assert.match(css, /\.gn-note-editor-column::before,[\s\S]*?\.gn-note-side::before\s*{[\s\S]*?width:\s*1px;/);
  assert.match(css, /\.app-workbench-ai-shell::before\s*{[\s\S]*?width:\s*1px;/);
  assert.doesNotMatch(css, /\.desktop-workbench-panels \.desktop-ai-shell\s*{[\s\S]*?position:\s*absolute;/);
  assert.match(css, /@container\s*\(max-width:\s*760px\)\s*{[\s\S]*?\.gn-note-side\s*{[\s\S]*?display:\s*none;/);
});

test('desktop product workbench uses dedicated shell and workspace files', async () => {
  const productSource = await readFile(productPath, 'utf8');

  assert.match(productSource, /WorkbenchShell/);
  assert.match(productSource, /KnowledgeWorkspace/);
  assert.match(productSource, /PageWorkspace/);
});

test('knowledge and page workspaces share monochrome workbench shell classes', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /\.pm-knowledge-workspace\s*\{/);
  assert.match(css, /\.pm-page-workspace-shell\s*\{/);
  assert.match(css, /\.pm-knowledge-workspace,\s*[\s\S]*?\.pm-page-workspace-shell,\s*[\s\S]*?\.pm-workbench-ai-pane\s*\{/);
  assert.match(css, /background:\s*var\(--mode-panel-alt\)/);
  assert.match(css, /border:\s*1px solid var\(--mode-border\)/);
});

test('workbench style remains user-selectable and its shared tokens are monochrome in both themes', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.doesNotMatch(source, /effectiveThemeMode/);
  assert.doesNotMatch(source, /effectiveAppStyle/);
  assert.match(source, /document\.documentElement\.dataset\.theme = themeMode;/);
  assert.match(source, /document\.documentElement\.dataset\.style = appStyle;/);
  assert.match(css, /:root\[data-style='workbench'\]\[data-theme='dark'\],\s*[\s\S]*?--mode-surface:\s*#0f0f10;/);
  assert.match(css, /:root\[data-style='workbench'\]\[data-theme='dark'\],\s*[\s\S]*?--mode-button:\s*#f5f5f4;/);
  assert.match(css, /:root\[data-style='workbench'\]\[data-theme='light'\]\s*{[\s\S]*?--mode-surface:\s*#f7f7f5;/);
  assert.match(css, /:root\[data-style='workbench'\]\[data-theme='light'\]\s*{[\s\S]*?--mode-button:\s*#111111;/);
  assert.doesNotMatch(css, /:root\[data-style='workbench'\]\[data-theme='light'\]\s*{[\s\S]*?#3b82f6/);
});

test('desktop header drops legacy style switching and only keeps the monochrome workbench style', async () => {
  const source = await readFile(appPath, 'utf8');
  const themeSource = await readFile(appThemePath, 'utf8');

  assert.doesNotMatch(source, /app-style-switcher/);
  assert.doesNotMatch(source, /APP_STYLE_OPTIONS/);
  assert.match(themeSource, /export type AppStyle = 'workbench';/);
});
