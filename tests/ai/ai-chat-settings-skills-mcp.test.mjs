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
const aiSettingsTabPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAISettingsTab.tsx');
const mcpPagePath = path.resolve(__dirname, '../../src/components/workspace/RuntimeMcpSettingsPage.tsx');
const skillsPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const sidecarBridgePath = path.resolve(__dirname, '../../src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts');

test('global settings page exposes the final settings IA and keeps ai, skills, and mcp mounted', async () => {
  const [sharedSource, pageSource] = await Promise.all([
    readFile(settingsSharedPath, 'utf8'),
    readFile(globalSettingsPagePath, 'utf8'),
  ]);

  assert.match(sharedSource, /const SETTINGS_TABS/);
  assert.match(sharedSource, /id:\s*'general'/);
  assert.match(sharedSource, /id:\s*'ai'/);
  assert.match(sharedSource, /id:\s*'permissions'/);
  assert.match(sharedSource, /id:\s*'mcp'/);
  assert.match(sharedSource, /id:\s*'skills'/);
  assert.match(sharedSource, /id:\s*'appearance'/);
  assert.match(sharedSource, /id:\s*'storage'/);
  assert.match(sharedSource, /id:\s*'advanced'/);
  assert.match(sharedSource, /const LEGACY_SETTINGS_TAB_ID_MAP/);
  assert.match(sharedSource, /about:\s*'general'/);
  assert.match(sharedSource, /adapters:\s*'advanced'/);
  assert.doesNotMatch(sharedSource, /id:\s*'adapters'/);
  assert.doesNotMatch(sharedSource, /id:\s*'terminal'/);
  assert.doesNotMatch(sharedSource, /id:\s*'agents'/);
  assert.doesNotMatch(sharedSource, /id:\s*'plugins'/);
  assert.doesNotMatch(sharedSource, /id:\s*'computerUse'/);
  assert.doesNotMatch(sharedSource, /id:\s*'diagnostics'/);
  assert.doesNotMatch(sharedSource, /id:\s*'about'/);
  assert.match(pageSource, /case 'ai':/);
  assert.match(pageSource, /case 'skills':/);
  assert.match(pageSource, /case 'mcp':/);
  assert.match(pageSource, /SettingsSidebar/);
  assert.match(pageSource, /SettingsPlaceholderPanel/);
  assert.match(pageSource, /chat-settings-workbench-shell/);
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
  assert.match(pageSource, /概览/);
  assert.match(pageSource, /最近调用/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-companion/);
  assert.doesNotMatch(pageSource, /chat-settings-companion-panel/);
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

test('phase 2 surfaces transfer and status sections inside ai, mcp, and skills settings', async () => {
  const [pageSource, aiTabSource, mcpSource, skillsSource] = await Promise.all([
    readFile(globalSettingsPagePath, 'utf8'),
    readFile(aiSettingsTabPath, 'utf8'),
    readFile(mcpPagePath, 'utf8'),
    readFile(skillsPagePath, 'utf8'),
  ]);

  assert.match(pageSource, /handleExportConfigs/);
  assert.match(pageSource, /handleImportConfigs/);
  assert.match(pageSource, /showJsonImport/);
  assert.match(pageSource, /jsonImportText/);

  assert.match(aiTabSource, /导入与导出/);
  assert.match(aiTabSource, /导出 JSON/);
  assert.match(aiTabSource, /导入 JSON/);
  assert.match(aiTabSource, /导入配置/);

  assert.match(mcpSource, /概览/);
  assert.match(mcpSource, /最近调用/);
  assert.match(mcpSource, /服务列表/);

  assert.match(skillsSource, /type SkillLibraryTab = 'system' \| 'personal'/);
  assert.match(skillsSource, /推荐/);
  assert.match(skillsSource, /已装/);
  assert.match(skillsSource, /卸载/);
  assert.match(skillsSource, /删除/);
  assert.match(skillsSource, /MacDialog/);
  assert.doesNotMatch(skillsSource, /type SkillLibraryFilter = 'all'/);
  assert.doesNotMatch(skillsSource, /gn-agent-skills-shell/);
});
