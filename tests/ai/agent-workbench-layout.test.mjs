import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentShellPagePath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/pages/AgentShellPage.tsx',
);
const gnAgentChatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx',
);
const agentShellPageCssPath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/pages/AgentShellPage.css',
);
const agentWorkbenchCssPath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/components/agentWorkbench.css',
);
const appCssPath = path.resolve(
  __dirname,
  '../../src/App.css',
);
const appTsxPath = path.resolve(
  __dirname,
  '../../src/App.tsx',
);
const tauriConfPath = path.resolve(
  __dirname,
  '../../src-tauri/tauri.conf.json',
);
const tauriLibPath = path.resolve(
  __dirname,
  '../../src-tauri/src/lib.rs',
);
const aiChatCssPath = path.resolve(
  __dirname,
  '../../src/components/workspace/AIChat.css',
);

test('AgentShellPage composes the new workbench shell', async () => {
  const source = await readFile(agentShellPagePath, 'utf8');

  assert.match(source, /AgentWorkbenchLayout/);
  assert.match(source, /AgentChatStage/);
  assert.match(source, /AgentWorkbenchSidebar/);
  assert.match(source, /AgentFloatingPlanCard/);
  assert.doesNotMatch(source, /AgentWorkbenchInspector/);
  assert.doesNotMatch(source, /rightInspector=/);
  assert.doesNotMatch(source, /inspectorCollapsed=/);
});

test('AgentShellPage no longer renders the old AGENT_WORKSPACE_TABS top-level shell', async () => {
  const source = await readFile(agentShellPagePath, 'utf8');
  const css = await readFile(agentShellPageCssPath, 'utf8');

  assert.doesNotMatch(source, /AGENT_WORKSPACE_TABS/);
  assert.doesNotMatch(source, /agent-workspace-tabs/);
  assert.doesNotMatch(css, /padding-bottom:\s*6px/);
});

test('GNAgentChatPage is no longer a competing full page shell', async () => {
  const source = await readFile(gnAgentChatPagePath, 'utf8');

  assert.match(source, /AgentChatStage|useGNAgentWorkbenchSession/);
});

test('Agent workbench has low-height responsive rules for the floating plan and stage spacing', async () => {
  const css = await readFile(agentWorkbenchCssPath, 'utf8');

  assert.match(css, /\.agent-workbench-shell\s*{[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(css, /\.agent-workbench-sidebar-shell,\s*\.agent-workbench-center\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.agent-workbench-sidebar\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.agent-workbench-left-rail\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /@media\s*\(max-height:\s*860px\)\s*{/);
  assert.match(css, /@media\s*\(max-height:\s*860px\)\s*{[\s\S]*?\.agent-workbench-floating-overlay\s*{[\s\S]*?top:\s*12px;/);
  assert.match(css, /@media\s*\(max-height:\s*860px\)\s*{[\s\S]*?\.agent-workbench-shell\s*{[\s\S]*?gap:\s*8px;[\s\S]*?padding:\s*8px;/);
  assert.match(css, /@media\s*\(max-height:\s*860px\)\s*{[\s\S]*?\.agent-floating-plan-card header\s*{[\s\S]*?padding:\s*12px 14px;/);
});

test('embedded agent composer can compress and wrap at small sizes instead of overflowing the bottom edge', async () => {
  const css = await readFile(aiChatCssPath, 'utf8');

  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*{[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-embedded-toolbar\s*{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*{[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-embedded-toolbar\s*{[\s\S]*?align-items:\s*stretch;/);
  assert.match(css, /@media\s*\(max-height:\s*860px\)\s*{[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-embedded-input\s*{[\s\S]*?min-height:\s*78px;/);
});

test('embedded agent chat content shares a responsive width lane with the composer', async () => {
  const css = await readFile(aiChatCssPath, 'utf8');

  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s*{[\s\S]*?--gn-agent-content-width:\s*min\(880px,\s*100%\);/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s*{[\s\S]*?--gn-agent-content-gutter:\s*clamp\(10px,\s*3vw,\s*24px\);/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s*{[\s\S]*?--gn-agent-linear-lane-width:\s*var\(--gn-agent-content-width\);/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-message-list\s*{[\s\S]*?padding-inline:\s*var\(--gn-agent-content-gutter\);/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-message\.assistant\s+\.chat-message-bubble,[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-stream\s*{[\s\S]*?margin-inline:\s*auto;/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer\s*{[\s\S]*?padding-inline:\s*var\(--gn-agent-content-gutter\);/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-shell\s*{[\s\S]*?width:\s*var\(--gn-agent-content-width\);[\s\S]*?margin-inline:\s*auto;/);
});

test('embedded agent tool execution cards shrink inside the shared content lane', async () => {
  const css = await readFile(aiChatCssPath, 'utf8');

  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-card,[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-card-inline\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-inline-summary\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-inline-meta\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?margin-left:\s*0;/);
  assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-command,[\s\S]*?\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-member\s+pre\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?box-sizing:\s*border-box;/);
});

test('desktop workbench shell constrains the embedded agent page instead of letting it bleed past the frame', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?width:\s*100%;/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /body\.desktop-workbench-mode,\s*body\.desktop-workbench-mode\s+#root\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.app-shell-desktop\s*{[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.desktop-shell-frame\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.desktop-workbench-column\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.desktop-workbench-column\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.desktop-workbench-panels\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?display:\s*flex;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.app-workbench-main-shell\s*{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /--desktop-topbar-height:\s*40px;/);
  assert.match(css, /\.desktop-shell-frame\s*{[\s\S]*?grid-template-columns:\s*\d+px minmax\(0,\s*1fr\);/);
  assert.match(css, /\.desktop-shell-frame\s*{[\s\S]*?padding:\s*\d+px;/);
  assert.match(css, /\.desktop-primary-rail\.mac-sidebar-panel\s*{[\s\S]*?padding:\s*\d+px \d+px \d+px;/);
  assert.match(css, /\.desktop-primary-nav,\s*\.desktop-primary-foot\s*{[\s\S]*?gap:\s*8px;/);
  assert.match(css, /\.desktop-brand-chip\.mac-button\s*{[\s\S]*?width:\s*\d+px;/);
  assert.match(css, /\.desktop-rail-icon-btn\.mac-button\s*{[\s\S]*?width:\s*\d+px;/);
  assert.match(css, /\.desktop-rail-icon-btn\.mac-button svg\s*{[\s\S]*?width:\s*\d+px;/);
  assert.match(css, /\.desktop-rail-icon-btn\.mac-button\.active\s*{[\s\S]*?background:\s*linear-gradient/);
  assert.match(css, /\.desktop-window-control\s*{[\s\S]*?width:\s*\d+px;/);
  assert.match(css, /\.desktop-workbench-topbar\.mac-toolbar\.mac-panel\s*{[\s\S]*?padding:\s*\d+px \d+px;/);
  assert.match(css, /@media\s*\(max-width:\s*1099px\)\s*{[\s\S]*?\.app-shell-desktop\s*{[\s\S]*?min-height:\s*100dvh;/);
});

test('desktop window switches to a frameless custom titlebar with in-app menus and controls', async () => {
  const tauriConf = await readFile(tauriConfPath, 'utf8');
  const source = await readFile(appTsxPath, 'utf8');
  const tauriLib = await readFile(tauriLibPath, 'utf8');
  const appCss = await readFile(appCssPath, 'utf8');
  const capability = await readFile(path.resolve(__dirname, '../../src-tauri/capabilities/default.json'), 'utf8');

  assert.match(tauriConf, /"title":\s*""/);
  assert.match(tauriConf, /"decorations":\s*false/);
  assert.match(source, /getCurrentWindow/);
  assert.match(source, /handleDesktopTopbarDoubleClick/);
  assert.match(source, /onDoubleClick=/);
  assert.match(source, /data-app-menu-root="desktop"/);
  assert.match(source, /data-tauri-drag-region/);
  assert.match(source, /desktop-workbench-drag-spacer/);
  assert.match(source, /desktop-window-controls/);
  assert.match(source, /desktop-window-control/);
  assert.match(source, /handleDesktopMenuAction/);
  assert.match(source, /工作台/);
  assert.match(capability, /core:window:allow-start-dragging/);
  assert.match(capability, /core:window:allow-minimize/);
  assert.match(capability, /core:window:allow-is-maximized/);
  assert.match(capability, /core:window:allow-maximize/);
  assert.match(capability, /core:window:allow-unmaximize/);
  assert.match(capability, /core:window:allow-close/);
  assert.match(appCss, /--desktop-titlebar-fg:/);
  assert.match(appCss, /--desktop-titlebar-menu-bg:/);
  assert.match(appCss, /\.desktop-workbench-menubar \.desktop-workbench-title\s*{[\s\S]*?flex:\s*0 1 220px;/);
  assert.match(appCss, /\.app-menu-trigger\s*{[\s\S]*?color:\s*var\(--desktop-titlebar-fg\)/);
  assert.match(appCss, /\.app-menu-panel\s*{[\s\S]*?background:\s*var\(--desktop-titlebar-menu-bg\)/);
  assert.match(appCss, /\.desktop-window-control\s*{[\s\S]*?color:\s*var\(--desktop-titlebar-fg\)/);
  assert.doesNotMatch(source, /listen<NativeMenuEventPayload>\('native-menu-event'/);
  assert.doesNotMatch(tauriLib, /\.on_menu_event\(/);
  assert.doesNotMatch(tauriLib, /app\.set_menu\(native_menu\)/);
});
