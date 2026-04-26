import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const workspacePath = path.resolve(__dirname, '../src/components/workspace/Workspace.tsx');
const workspaceCssPath = path.resolve(__dirname, '../src/components/workspace/Workspace.css');
const chatCssPath = path.resolve(__dirname, '../src/components/workspace/AIChat.css');
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

test('desktop app shell exposes edge-to-edge workbench classes', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /app-shell-desktop/);
  assert.match(css, /\.app-shell-desktop\s*\{/);
  assert.match(css, /\.app-main-desktop\s*\{/);
  assert.match(css, /height:\s*calc\(100vh - var\(--desktop-topbar-height\)\)/);
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

  assert.match(source, /from 'allotment'/);
  assert.match(source, /layoutPreferences/);
  assert.match(source, /productWorkbenchLeftNavWidth/);
  assert.match(source, /<Allotment/);
  assert.doesNotMatch(source, /pm-left-nav-divider/);
  assert.match(css, /\.product-workbench-allotment\s*\{/);
  assert.match(css, /\.product-workbench-allotment\s*{[\s\S]*?--sash-size:\s*8px;/);
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
  assert.match(css, /\.app-shell-resizer\s*{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.app-shell-resizer::before\s*{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.app-shell-resizer\.vertical::before\s*{[\s\S]*?width:\s*1px;/);
  assert.match(css, /\.app-shell-resizer:hover::before\s*{[\s\S]*?background:\s*var\(--mode-border/);
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
