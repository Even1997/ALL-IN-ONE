import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const settingsSharedPath = path.resolve(__dirname, '../../src/components/workspace/globalSettingsPageShared.ts');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const mcpPagePath = path.resolve(__dirname, '../../src/components/workspace/RuntimeMcpSettingsPage.tsx');
const sidecarBridgePath = path.resolve(__dirname, '../../src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts');

test('global settings page exposes ai, skills, and mcp tabs', async () => {
  const [sharedSource, pageSource] = await Promise.all([
    readFile(settingsSharedPath, 'utf8'),
    readFile(globalSettingsPagePath, 'utf8'),
  ]);

  assert.match(sharedSource, /const SETTINGS_TABS/);
  assert.match(sharedSource, /id:\s*'ai'/);
  assert.match(sharedSource, /id:\s*'permissions'/);
  assert.match(sharedSource, /id:\s*'general'/);
  assert.match(sharedSource, /id:\s*'adapters'/);
  assert.match(sharedSource, /id:\s*'terminal'/);
  assert.match(sharedSource, /id:\s*'skills'/);
  assert.match(sharedSource, /id:\s*'mcp'/);
  assert.match(sharedSource, /id:\s*'agents'/);
  assert.match(sharedSource, /id:\s*'plugins'/);
  assert.match(sharedSource, /id:\s*'computerUse'/);
  assert.match(sharedSource, /id:\s*'diagnostics'/);
  assert.match(sharedSource, /id:\s*'about'/);
  assert.match(pageSource, /activeSettingsTab === 'ai'/);
  assert.match(pageSource, /activeSettingsTab === 'skills'/);
  assert.match(pageSource, /activeSettingsTab === 'mcp'/);
  assert.match(pageSource, /renderSettingsPlaceholder/);
  assert.match(pageSource, /chat-settings-placeholder-note/);
  assert.match(pageSource, /chat-settings-workbench-shell/);
  assert.match(pageSource, /chat-settings-workbench-sidebar/);
  assert.match(pageSource, /chat-settings-workbench-stage/);
  assert.doesNotMatch(pageSource, /chat-settings-workbench-companion/);
  assert.match(pageSource, /<GNAgentSkillsPage \/>/);
  assert.match(pageSource, /<RuntimeMcpSettingsPage/);
});

test('global settings page can be opened from an external settings event and target a specific tab', async () => {
  const [appSource, chatSource] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
  ]);

  assert.match(appSource, /AI_CHAT_SETTINGS_EVENT/);
  assert.match(appSource, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(appSource, /setIsGlobalSettingsOpen\(true\)/);
  assert.match(appSource, /resolveSettingsTabId\(detail\.tab\)/);
  assert.doesNotMatch(appSource, /setActiveGlobalSettingsTab\(detail\.tab \|\| SETTINGS_TABS\[0\]\.id\)/);
  assert.match(chatSource, /dispatchEvent\([\s\S]*?new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
  assert.doesNotMatch(chatSource, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
});

test('global settings page keeps the workbench shell scrollable on desktop and mobile', async () => {
  const css = await readFile(aiChatCssPath, 'utf8');

  assert.match(css, /\.global-settings-page-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-settings-workbench-shell\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.chat-settings-workbench-sidebar\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-settings-source-list\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.chat-settings-ai-layout\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-workbench-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-source-list\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-source-row\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*auto;/s);
});

test('runtime mcp settings page owns CRUD-style management hooks', async () => {
  const pageSource = await readFile(mcpPagePath, 'utf8');
  const bridgeSource = await readFile(sidecarBridgePath, 'utf8');

  assert.match(pageSource, /initializeRuntimeSidecarMcpServers/);
  assert.match(pageSource, /upsertRuntimeSidecarMcpServer/);
  assert.match(pageSource, /deleteRuntimeSidecarMcpServer/);
  assert.match(pageSource, /invokeRuntimeSidecarMcpTool/);
  assert.match(pageSource, /chat-settings-mcp-layout/);
  assert.match(pageSource, /chat-settings-mcp-list/);
  assert.match(pageSource, /chat-settings-mcp-stage/);
  assert.match(pageSource, /chat-settings-mcp-companion/);
  assert.match(pageSource, /chat-settings-companion-panel/);
  assert.match(pageSource, /SSE/);
  assert.doesNotMatch(pageSource, /OAuth Client ID/);
  assert.doesNotMatch(pageSource, /OAuth Callback Port/);
  assert.doesNotMatch(pageSource, /Headers Helper/);
  assert.doesNotMatch(pageSource, /<span>Description<\/span>/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-toolbar-bar/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-hero/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-summary/);

  assert.match(bridgeSource, /initializeRuntimeSidecarMcpServers/);
  assert.match(bridgeSource, /initializeRuntimeSidecarMcpToolCalls/);
  assert.match(bridgeSource, /upsertRuntimeSidecarMcpServer/);
  assert.match(bridgeSource, /deleteRuntimeSidecarMcpServer/);
});
